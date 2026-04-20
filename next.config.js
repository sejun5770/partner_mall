/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig = {
  output: 'standalone',
  // Do NOT enable `trailingSlash: true` when basePath is set: it causes
  // Next.js to 308-redirect `${basePath}/health` to `${basePath}/health/`,
  // which breaks the Docker Manager health probe (it does not follow
  // redirects). basePath alone is enough for the app to live under /c/partner.
  ...(basePath ? { basePath } : {}),
};

module.exports = nextConfig;
