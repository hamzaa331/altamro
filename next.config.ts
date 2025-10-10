// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // ✅ Don’t fail the build because of ESLint errors
    ignoreDuringBuilds: true,
  },
  typescript: {
    // ✅ Don’t fail the build because of TS type errors
    ignoreBuildErrors: true,
  },
  images: {
    // optional: avoids some image warnings in Vercel
    unoptimized: true,
  },
};

export default nextConfig;
