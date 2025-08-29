/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // ❗ allows production builds to succeed even if there are TS errors
    ignoreBuildErrors: true,
  },
  eslint: {
    // optional: don’t block builds on ESLint errors either
    ignoreDuringBuilds: true,
  },
};
module.exports = nextConfig;
