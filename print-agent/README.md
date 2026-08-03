# Agente de impresión de la comanda (ESC/POS · XPrinter XP-80)

Mini servicio local en Node que imprime la comanda **directo en ESC/POS** a la
XPrinter XP-80 (térmica 80mm, USB). Reemplaza la impresión por navegador, que
rotaba/escalaba la salida por culpa del diálogo de Chrome y del driver.

La app (`/comanda`) le manda los datos del ticket por `POST http://localhost:9977/print`.
Si el agente no está corriendo, la app avisa con un toast y cae al print por
navegador que ya existe.

---

## 1. Instalar

Necesitás **Node 18+** en la PC donde está enchufada la impresora.

```
cd print-agent
npm install
```

Esto compila `escpos-usb` (usa `usb`/libusb). En Windows suele bajar binarios
precompilados; si fallara, instalá los *Build Tools* de VS o usá el método RAW
(ver más abajo).

## 2. Probar

```
npm start
```

Deja una ventana abierta con: `print-agent escuchando en http://localhost:9977`
y las USB detectadas. Probá que responda:

```
curl http://localhost:9977/health
```

Prueba de impresión sin la app:

```
curl -X POST http://localhost:9977/print -H "content-type: application/json" ^
  -d "{\"encabezado\":\"Oso 18/04\",\"codigo\":\"C-02\",\"items\":[{\"cant\":\"1\",\"nombre\":\"SKYY C/RED BULL\",\"precio\":\"$13,000\",\"total\":\"$13,000\"}],\"total\":\"$13,000\",\"mostrarTotal\":false,\"corte\":6}"
```

## 3. Dejarlo corriendo al iniciar Windows

1. `Win + R` → escribí `shell:startup` → Enter (abre la carpeta de Inicio).
2. Creá ahí un **acceso directo** a `startup.vbs` (arranca el agente **sin
   ventana**). O copiá `start.bat` si preferís verlo.

Listo: al prender la PC, el agente queda escuchando solo.

---

## Configuración (`.env`)

Copiá `.env.example` a `.env` y ajustá. Todo es opcional (hay defaults). Lo más
usado:

| Variable | Qué es |
| --- | --- |
| `METHOD` | `usb` (default, directo) o `printer` (RAW por nombre de Windows) |
| `USB_VID` / `USB_PID` | Forzar la impresora USB si hay varias o no la detecta |
| `PRINTER_NAME` | Nombre exacto de la impresora (solo `METHOD=printer`) |
| `FEED_MM` | Avance de corte por default (6mm) |
| `CODEPAGE_CMD` / `CODEPAGE_ENC` | Página de códigos para acentos (ver abajo) |
| `ALLOWED_ORIGIN` | Origen(es) de la app permitidos por CORS |

## Identificar el vendorId / productId de la XP-80

Con el agente corriendo, `npm start` imprime `USB detectadas: [...]` con los ids
en hex. O directo:

```
node -e "console.log(require('./print').listarUSB())"
```

Copiá esos valores a `.env` como `USB_VID=0x....` y `USB_PID=0x....` si hace
falta fijarlos.

## Si Windows tiene el puerto tomado por el driver (o no querés tocar el driver)

`METHOD=usb` habla **directo** con el chip USB y por eso ignora el driver (es lo
que evita la rotación), pero en Windows eso exige reemplazar el driver de la
XP-80 por **WinUSB** con [Zadig](https://zadig.akeo.ie/): abrí Zadig →
`Options ▸ List All Devices` → elegí la XPrinter → instalá `WinUSB`. **Ojo:** eso
deja la impresora fuera de la lista normal de Windows (solo la usa el agente).

Si preferís **no** tocar el driver, usá el camino RAW por el nombre de la
impresora de Windows (el driver deja pasar bytes crudos, que es lo normal en las
XP-80). En `.env`:

```
METHOD=printer
PRINTER_NAME=XP-80        # el nombre EXACTO de "Dispositivos e impresoras"
```

Este camino manda el ESC/POS como trabajo **RAW** al spooler: no pasa por el
render del diálogo de Chrome, así que **no rota**. **No necesita compilar nada**:
si no está el módulo `@thiagoelg/node-printer`, el agente cae solo a mandar los
bytes por el spooler de Windows vía PowerShell (`rawprint.ps1`, winspool
`WritePrinter`). Opcionalmente, `npm install @thiagoelg/node-printer` lo hace un
poco más rápido, pero no hace falta.

## Acentos salen mal (Ñ, á, é…)

Es la página de códigos del ESC/POS. El default es PC858 (`CODEPAGE_CMD=19`,
`CODEPAGE_ENC=CP858`). Si tu XP-80 mapea distinto, probá PC850:

```
CODEPAGE_CMD=2
CODEPAGE_ENC=CP850
```

---

## Endpoints

- `POST /print` — body JSON:
  ```json
  {
    "encabezado": "Oso 18/04/26",
    "codigo": "C-02",
    "folio": "01 -0001/524",
    "pie": "Byte Informática - 3471.683423",
    "copias": 1,
    "corte": 6,
    "items": [{ "cant": "1", "nombre": "SKYY C/RED BULL", "precio": "$13,000", "total": "$13,000" }],
    "total": "$13,000",
    "mostrarTotal": false
  }
  ```
- `GET /health` — `{ ok, method, usb? }`.

Escucha solo en `127.0.0.1` y solo acepta el origen de la app (CORS + Private
Network Access para que el fetch desde la página HTTPS funcione en Chrome).
