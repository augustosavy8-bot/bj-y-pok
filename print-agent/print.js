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
  if (!opts.printerName) {
    return Promise.reject(new Error("Definí PRINTER_NAME con el nombre EXACTO de la impresora en Windows (ver README)."));
  }
  // Si está el módulo nativo, lo usamos (más rápido). Si no, caemos al spooler
  // de Windows por PowerShell — RAW, sin dependencias que compilar.
  let printer = null;
  try { printer = require("@thiagoelg/node-printer"); }
  catch (e) { try { printer = require("printer"); } catch (e2) { printer = null; } }

  if (printer) {
    return new Promise((resolve, reject) => {
      printer.printDirect({
        data: buffer,
        printer: opts.printerName,
        type: "RAW",
        success: () => resolve(),
        error: (e) => reject(new Error("Error imprimiendo RAW a '" + opts.printerName + "': " + (e && e.message ? e.message : e))),
      });
    });
  }
  return enviarSpoolerWin(buffer, opts);
}

// Envío RAW por el spooler de Windows (winspool WritePrinter) vía PowerShell.
// No necesita módulos nativos de npm.
function enviarSpoolerWin(buffer, opts) {
  return new Promise((resolve, reject) => {
    const os = require("os");
    const fs = require("fs");
    const path = require("path");
    const { spawn } = require("child_process");
    const tmp = path.join(os.tmpdir(), "comanda-" + process.pid + "-" + Date.now() + ".bin");
    try {
      fs.writeFileSync(tmp, buffer);
    } catch (e) {
      return reject(new Error("No se pudo escribir el archivo temporal: " + e.message));
    }
    const ps1 = path.join(__dirname, "rawprint.ps1");
    const ps = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, "-PrinterName", opts.printerName, "-FilePath", tmp],
      { windowsHide: true }
    );
    let err = "";
    ps.stderr.on("data", (d) => (err += d.toString()));
    ps.on("error", (e) => {
      try { fs.unlinkSync(tmp); } catch (_) {}
      reject(new Error("No se pudo lanzar PowerShell: " + e.message));
    });
    ps.on("close", (code) => {
      try { fs.unlinkSync(tmp); } catch (_) {}
      if (code === 0) return resolve();
      reject(new Error("Impresión RAW falló (PowerShell code " + code + "): " + (err.trim() || "sin detalle")));
    });
  });
}

function enviar(buffer, opts) {
  return opts.method === "printer" ? enviarPrinter(buffer, opts) : enviarUSB(buffer, opts);
}

module.exports = { enviar, listarUSB };
