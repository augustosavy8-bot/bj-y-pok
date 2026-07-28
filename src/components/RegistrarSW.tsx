"use client";

import { useEffect } from "react";

/** Registra el service worker: es lo que permite instalar la app. */
export function RegistrarSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* si falla, la app funciona igual: sólo no se puede instalar */
    });
  }, []);
  return null;
}
