/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Suppress the Next.js dev error overlay for runtime errors (API catch blocks)
  devIndicators: false,
  // Empty turbopack config allows webpack config to coexist
  turbopack: {},
  // Webpack fallback for compatibility
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
