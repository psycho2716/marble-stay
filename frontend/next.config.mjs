/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "loremflickr.com", pathname: "/**" },
      { protocol: "https", hostname: "picsum.photos", pathname: "/**" },
      { protocol: "https", hostname: "fastly.picsum.photos", pathname: "/**" },
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" }
    ]
  },
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

