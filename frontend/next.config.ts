import type { NextConfig } from "next";

const electronBuild = process.env.ELECTRON_BUILD === "1";

const nextConfig: NextConfig = electronBuild
  ? {
      output: "export",
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {
      allowedDevOrigins: [
        "192.168.1.104:3000",
        "192.168.1.104",
        "localhost:3000",
        "127.0.0.1:3000",
        "192.168.*.*",
        "10.*.*.*",
        "172.*.*.*",
        "*.local",
        "*.lan",
      ],
      async rewrites() {
        return [
          {
            source: "/api/v1/:path*",
            destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/api/v1/:path*`,
          },
        ];
      },
    };

export default nextConfig;
