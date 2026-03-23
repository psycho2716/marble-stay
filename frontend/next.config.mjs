/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    appDir: true
  },
  async redirects() {
    return [
      { source: "/preferences", destination: "/profile?tab=settings", permanent: true },
    ];
  },
};

export default nextConfig;

