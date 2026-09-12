import type { NextConfig } from "next";

// GitHub Pages serves this repo from /app-organizer/. Local dev serves from /.
const basePath = process.env.GITHUB_PAGES === "true" ? "/app-organizer" : "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
