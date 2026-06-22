/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    KAJABI_API_KEY: process.env.KAJABI_API_KEY,
    AIRTABLE_TOKEN: process.env.AIRTABLE_TOKEN,
    AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID,
    CRON_SECRET: process.env.CRON_SECRET,
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIL_FROM: process.env.EMAIL_FROM,
  },
};

module.exports = nextConfig;
