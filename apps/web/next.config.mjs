/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@voice-industrial-design/server",
    "@voice-industrial-design/shared"
  ],
  async rewrites() {
    const apiBaseUrl = process.env.WORKBENCH_API_PROXY_URL;

    if (!apiBaseUrl) {
      return [];
    }

    return [
      {
        source: "/api/:path*",
        destination: `${apiBaseUrl}/api/:path*`
      }
    ];
  }
};

export default nextConfig;
