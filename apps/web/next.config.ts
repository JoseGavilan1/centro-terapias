import type { NextConfig } from 'next';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  // El frontend llama a su propio origen (/api/...) y Next reenvía al backend.
  // Así las cookies httpOnly funcionan como same-origin en dev y producción,
  // sin CORS ni exposición de tokens a JavaScript (ver docs/01-arquitectura.md, ADR-06).
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
