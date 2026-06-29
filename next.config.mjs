/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdf-parse and neo4j-driver are server-only; keep them external from bundling
  serverExternalPackages: ["pdf-parse", "neo4j-driver"],
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
        source: "/liff/:path*",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://*.line.me https://liff.line.me https://miniapp.line.me;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
