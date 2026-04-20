/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig = {
  output: 'standalone',
  // Do NOT enable `trailingSlash: true` when basePath is set: it causes
  // Next.js to 308-redirect `${basePath}/health` to `${basePath}/health/`,
  // which breaks the Docker Manager health probe (it does not follow
  // redirects).
  //
  // `skipTrailingSlashRedirect: true` stops Next.js from 308-ing between
  // `${basePath}/` (with slash) and `${basePath}` (without). Without this,
  // a proxy that rewrites one form to the other can form a redirect loop
  // with Next.js's normalization — the browser saw ERR_TOO_MANY_REDIRECTS
  // on docker-manager.barunsoncard.com/c/partner because of this.
  skipTrailingSlashRedirect: true,
  ...(basePath ? { basePath } : {}),
};

module.exports = nextConfig;
