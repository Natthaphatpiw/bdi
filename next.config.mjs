/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // server-only packages — keep external from the bundler
  serverExternalPackages: ["pdf-parse", "@mastra/core"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "profile.line-scdn.net" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  // LINE Mini App is embedded in the LINE in-app browser (iframe-like). Allow it.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(self), microphone=(self)" },
        ],
      },
      {
        source: "/liff/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://*.line.me https://liff.line.me https://miniapp.line.me;",
          },
        ],
      },
      {
        source: "/passport/share/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/internal/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
};

export default nextConfig;
