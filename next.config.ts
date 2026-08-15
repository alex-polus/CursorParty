import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@cursor/sdk", "@libsql/client", "ws"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
