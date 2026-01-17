/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:8000',
  },
  // Note: Backend API calls are made directly via axios to http://localhost:8000
  // NextAuth routes (/api/auth/*) are handled by pages/api/auth/[...nextauth].ts
};

module.exports = nextConfig;