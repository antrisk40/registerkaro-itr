/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["mongoose"],
  },
  async rewrites() {
    const backend = process.env.API_PROXY_TARGET || 'http://127.0.0.1:4000';
    return [
      {
        source: '/api/:path*',
        destination: `${backend}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
