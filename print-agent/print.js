"use strict";

// Envío del Buffer ESC/POS a la impresora. Dos caminos:
//   METHOD=usb      -> escpos-usb, escribe directo al endpoint USB (bypassa el
//                      driver de Windows; es lo que evita la rotación). Requiere
//                      WinUSB/Zadig en la XP-80. Es el default.
//   METHOD=printer  -> RAW al nombre de impresora de Windows (usa el driver en
//                      modo passthrough). No necesita Zadig, pero el driver debe
//                      dejar pasar los bytes crudos. Requiere @thiagoelg/node-printer.

function listarUSB() {
  const USB = require("escpos-usb");
  try {
    return (USB.findPrinter ? USB.findPrinter() : []).map((d) => {
      const desc = d.deviceDescriptor || {};
      return {
        vendorId: "0x" + (desc.idVendor || 0).toString(16).padStart(4, "0"),
        productId: "0x" + (desc.idProduct || 0).toString(16).padStart(4, "0"),
      };
    });
  } catch (e) {
    return [];
  }
}

function enviarUSB(buffer, opts) {
  return new Promise((resolve, reject) => {
    let USB;
    try {
      require("escpos"); // asegura peer
      USB = require("escpos-usb");
    } catch (e) {
      return reject(new Error("Faltan dependencias USB (escpos/escpos-usb). Corré: npm install"));
    }
    let device;
    try {
      device = opts.vid && opts.pid ? new USB(opts.vid, opts.pid) : new USB();
    } catch (e) {
      return reject(new Error("No se encontró la impresora USB (" + e.message + "). Verificá el cable/encendido, o pasá USB_VID/USB_PID (ver README)."));
    }
    device.open((err) => {
      if (err) {
        return reject(new Error("No se pudo abrir la impresora USB (" + err.message + "). En Windows suele faltar el driver WinUSB (Zadig) o el puerto lo tiene tomado el driver de la XP-80 — ver README (usá METHOD=printer)."));
      }
      device.write(buffer, (err2) => {
        try { device.close(); } catch (_) {}
        if (err2) return reject(new Error("Error escribiendo por USB: " + err2.message));
        resolve();
      });
    });
  });
}

function enviarPrinter(buffer, opts) {
  return new Promise((resolve, reject) => {
    let printer;
    try {
      printer = require("@thiagoelg/node-printer");
    } catch (e) {
      try { printer = require("printer"); } catch (e2) {
        return reject(new Error("Falta el paquete de impresión RAW. Instalá: npm install @thiagoelg/node-printer (ver README, sección METHOD=printer)."));
      }
    }
    if (!opts.printerName) {
      return reject(new Error("Definí PRINTER_NAME con el nombre EXACTO de la impresora en Windows (ver README)."));
    }
    printer.printDirect({
      data: buffer,
      printer: opts.printerName,
      type: "RAW",
      success: () => resolve(),
      error: (e) => reject(new Error("Error imprimiendo RAW a '" + opts.printerName + "': " + (e && e.message ? e.message : e))),
    });
  });
}

function enviar(buffer, opts) {
  return opts.method === "printer" ? enviarPrinter(buffer, opts) : enviarUSB(buffer, opts);
}

module.exports = { enviar, listarUSB };
