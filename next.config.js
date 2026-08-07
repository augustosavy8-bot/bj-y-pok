/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  async headers() {
    // Los assets de /public salen por defecto con `cache-control: max-age=0`,
    // así que el navegador los revalida en CADA visita (los slots pesan varios
    // MB de arte). Son archivos versionados a mano que casi nunca cambian: les
    // damos cache largo e immutable. Si se reemplaza un asset, cambiar el
    // nombre (o la ruta del tema) hace de cache-bust.
    const inmutable = [
      { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
    ];
    return [
      { source: "/slots/:path*", headers: inmutable },
      { source: "/juegos/:path*", headers: inmutable },
      { source: "/svg-cards.svg", headers: inmutable },
      { source: "/icon-192.png", headers: inmutable },
      { source: "/icon-512.png", headers: inmutable },
    ];
  },
};

module.exports = nextConfig;
