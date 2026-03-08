import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
          // CSP — focused on high-value directives that don't require nonce plumbing
          // Intentionally omits script-src/style-src to avoid breaking Next.js/Tailwind inline styles
          { key: "Content-Security-Policy",
            value: "base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'none';" },
          // Disable browser features the app doesn't need
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
