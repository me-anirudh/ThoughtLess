import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ['minio', 'pg'],
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
