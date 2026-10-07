import { env } from './config/env';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRouter from './routes/auth';
import attendanceRouter from './routes/attendance';
import userRouter from './routes/user';
import wasteRouter from './routes/waste';
import inventoryRouter from './routes/inventory';
import analyticsRouter from './routes/analytics';
import predictionRouter from './routes/prediction';
import prisma from './utils/prisma';
import { rateLimit } from './middleware/auth.middleware';

const app = express();

app.set('trust proxy', 1); // behind Render / Vercel proxies
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      // allow server-to-server / curl (no origin), configured frontends and Vercel previews
      if (
        !origin ||
        env.frontendUrls.includes(origin) ||
        env.frontendUrls.includes('*') ||
        /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) && env.frontendUrls.some((u) => u.endsWith('.vercel.app'))
      ) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => {
  res.json({ name: 'EcoMess AI API', docs: '/health', api: '/api' });
});

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'up', uptime: Math.round(process.uptime()) });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'down' });
  }
});

app.use('/api/auth', rateLimit(30, 60_000), authRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/users', userRouter);
app.use('/api/waste', wasteRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/predictions', predictionRouter);

app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found` });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.message?.includes('not allowed by CORS')) {
    return res.status(403).json({ success: false, error: err.message });
  }
  console.error(err);
  res.status(err.status || 500).json({ success: false, error: 'Internal server error' });
});

const server = app.listen(env.port, () => {
  console.log(`✓ EcoMess API listening on port ${env.port} (${env.isProd ? 'production' : 'development'})`);
  console.log(`✓ CORS origins: ${env.frontendUrls.join(', ')}`);
  console.log(`✓ ML service: ${env.mlServiceUrl}`);
});

const shutdown = async () => {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
