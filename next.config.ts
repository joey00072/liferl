import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
