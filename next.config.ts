import type { NextConfig } from "next";

// Disable Next.js telemetry unconditionally — this is a self-hosted app
process.env.NEXT_TELEMETRY_DISABLED = "1";

const nextConfig: NextConfig = {
  // Hide the Next.js dev indicator button — not useful to end users
  devIndicators: false,
  // Skip TypeScript type-checking during production build — saves significant
  // time on slow machines. Types are still checked in the editor/CI.
  typescript: { ignoreBuildErrors: true },
  // Skip ESLint during production build (no eslint config in this project)
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Prevent MIME sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Clickjacking — belt-and-suspenders with CSP frame-ancestors
          { key: "X-Frame-Options", value: "DENY" },
          // Limit referrer leakage to origin only
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // HSTS — enforce HTTPS for 1 year
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // CSP — blocks remote script injection and eval() while allowing Next.js inline scripts.
          // 'unsafe-inline' is needed for Next.js/React hydration scripts.
          { key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'none';" },
          // Disable browser features the app doesn't need
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
