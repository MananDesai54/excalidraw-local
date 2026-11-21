/** @type {import('next').NextConfig} */
const nextConfig = {
  // STATIC_EXPORT=1 → plain static site for the Tauri desktop app (API handled in Rust)
  ...(process.env.STATIC_EXPORT ? { output: "export", images: { unoptimized: true } } : {}),
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
