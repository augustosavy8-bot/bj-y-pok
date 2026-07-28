// Service worker mínimo: existe para que la app sea instalable como
// aplicación de escritorio. NO cachea nada a propósito — es una app de mesas
// en vivo y servir datos viejos de una caché sería peor que no tener caché.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (evento) => {
  evento.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Sin intervención: todo va directo a la red.
});

// Al tocar una notificación, enfocar la ventana ya abierta (o abrir una).
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = evento.notification.data?.url || "/home";
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if ("focus" in v) {
          v.navigate?.(destino);
          return v.focus();
        }
      }
      return self.clients.openWindow(destino);
    })
  );
});
