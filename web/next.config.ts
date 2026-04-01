import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(process.cwd(), '..'),
  serverExternalPackages: ['puppeteer'],
};

export default nextConfig;
