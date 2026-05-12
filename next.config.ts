import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Impede embedding em iframes (clickjacking)
          { key: "X-Frame-Options", value: "DENY" },
          // Impede MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Controla informações enviadas no header Referer
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Habilita HSTS (força HTTPS) — 2 anos
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // Desabilita detecção de tipo de conteúdo do IE
          { key: "X-DNS-Prefetch-Control", value: "on" },
          // Permissions Policy — restringe APIs do browser
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self), payment=(self)",
          },
          // CSP básico para Next.js — permite inline styles (Tailwind) e scripts do próprio domínio
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.brasilnfe.com.br",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
