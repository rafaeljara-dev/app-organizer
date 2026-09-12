import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel serves this at the domain root, and the icon resolver needs a
  // server, so there is no static export and no basePath any more.
  env: { NEXT_PUBLIC_BASE_PATH: "" },
};

const withSerwist = withSerwistInit({
  swSrc: "worker/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: true,
  // We register the worker ourselves in components/RegisterSW.tsx, guarded
  // for the cases where the API is missing. Letting the plugin inject its
  // own client too would register twice and ship @serwist/window for nothing.
  register: false,
});

export default withSerwist(nextConfig);
