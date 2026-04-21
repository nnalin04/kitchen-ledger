/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@kitchenledger/ui',
    '@kitchenledger/types',
    '@kitchenledger/api-client',
  ],
};

module.exports = nextConfig;
