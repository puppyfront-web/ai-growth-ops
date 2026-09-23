/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Root build runs ESLint 9 before Next 14, whose bundled lint integration is incompatible.
  eslint: { ignoreDuringBuilds: true },
  // eslint-disable-next-line no-undef
  distDir: process.env.NEXT_DIST_DIR || '.next',
  transpilePackages: ['@ai-growth-ops/shared'],
  experimental: {
    // LLM writing + image generation routinely exceeds Next's 30s rewrite default
    proxyTimeout: 300_000
  },
  async rewrites() {
    // eslint-disable-next-line no-undef
    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3100';
    return [
      {
        source: '/api/:path*',
        destination: `${apiBaseUrl}/api/:path*`
      },
      {
        source: '/uploads/:path*',
        destination: `${apiBaseUrl}/uploads/:path*`
      }
    ];
  }
};

// eslint-disable-next-line no-undef
module.exports = nextConfig;
