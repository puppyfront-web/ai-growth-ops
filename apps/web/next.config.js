/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    proxyTimeout: 30000
  },
  async rewrites() {
    // eslint-disable-next-line no-undef
    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3100';
    return [
      {
        source: '/api/:path*',
        destination: `${apiBaseUrl}/api/:path*`
      }
    ];
  }
};

// eslint-disable-next-line no-undef
module.exports = nextConfig;
