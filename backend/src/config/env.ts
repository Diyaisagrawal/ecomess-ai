import dotenv from 'dotenv';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';

function required(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isProd) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return devFallback;
}

export const env = {
  isProd,
  port: parseInt(process.env.PORT || '5000', 10),
  databaseUrl: required('DATABASE_URL', 'postgresql://ecomess:ecomess_password@localhost:5432/ecomess_db'),
  jwtSecret: required('JWT_SECRET', 'dev-secret-key'),
  refreshSecret: required('REFRESH_SECRET', 'dev-refresh-secret'),
  // Comma-separated list of allowed browser origins, e.g. https://ecomess.vercel.app
  frontendUrls: (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),
  mlServiceUrl: (process.env.ML_SERVICE_URL || 'http://localhost:8000').replace(/\/$/, ''),
  mlApiKey: process.env.ML_API_KEY || '',
};
