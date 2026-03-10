/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      stream: require.resolve("stream-browserify"),
      crypto: false,
      fs: false,
      path: false,
    };
    // Buffer polyfill
    config.resolve.alias = {
      ...config.resolve.alias,
    };
    return config;
  },
};

module.exports = nextConfig;
