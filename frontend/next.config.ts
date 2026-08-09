import type { NextConfig } from "next";

const electronBuild = process.env.ELECTRON_BUILD === "1";

const nextConfig: NextConfig = electronBuild
  ? {
      output: "export",
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {
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
