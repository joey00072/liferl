import type { NextConfig } from "next";

const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:5174";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiInternalUrl}/api/:path*`,
      },
    ];
  },
  webpack(config, { dev }) {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ["**/liferl.md", "**/.liferl/**"],
      };
    }
    return config;
  },
};

export default nextConfig;
