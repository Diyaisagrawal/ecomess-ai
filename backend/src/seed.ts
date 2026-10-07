/**
 * Seeds a realistic demo dataset so a fresh deployment has data to show and
 * the ML models have real history to train on.
 *
 *   npm run seed            (dev, ts)
 *   npm run seed:prod       (after build)
 *   Runs automatically on deploy (npm run start:prod); set SEED_DEMO=false to disable.
 *   add --reset to wipe existing attendance / waste / inventory / predictions first
 *
 * Demo login: demo@ecomess.ai / EcoMess@2026  (ADMIN)
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import prisma from './utils/prisma';

const DAYS = 120;
const DEMO_EMAIL = 'demo@ecomess.ai';
const DEMO_PASSWORD = 'EcoMess@2026';

// deterministic PRNG so every deployment gets the same demo data
let seed = 20261007;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const normal = (mean: number, sd: number) => {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const r2 = (x: number) => Math.round(x * 100) / 100;

const MEALS = {
  BREAKFAST: { base: 260, portion: 0.3, items: [['Poha', 'GRAINS', 0.45], ['Idli Sambar', 'GRAINS', 0.35], ['Bread & Butter', 'BAKERY', 0.2]] },
  LUNCH: { base: 420, portion: 0.55, items: [['Rice', 'GRAINS', 0.35], ['Dal', 'PULSES', 0.25], ['Mixed Veg Sabzi', 'VEGETABLES', 0.2], ['Roti', 'GRAINS', 0.2]] },
  DINNER: { base: 360, portion: 0.5, items: [['Rice', 'GRAINS', 0.3], ['Dal Tadka', 'PULSES', 0.25], ['Paneer Curry', 'DAIRY', 0.25], ['Roti', 'GRAINS', 0.2]] },
} as const;
const DOW_FACTOR = [0.62, 1.0, 1.02, 1.03, 1.0, 0.92, 0.7]; // JS getUTCDay(): 0 = Sunday
const REASONS = ['Over-preparation', 'Plate waste', 'Low turnout', 'Taste feedback', 'Spoilage'];
const WASTE_CATEGORY = ['PLATE_WASTE', 'PREPARATION_LOSS', 'PLATE_WASTE', 'SPOILAGE', 'OTHER'];

async function triggerRetrain() {
  const url = process.env.ML_SERVICE_URL;
  if (!url) return;
  try {
    await fetch(`${url.replace(/\/$/, '')}/train/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(process.env.ML_API_KEY ? { 'X-API-Key': process.env.ML_API_KEY } : {}) },
      body: '{}',
      signal: AbortSignal.timeout(5000),
    });
    console.log('✓ Asked ML service to retrain on the new data');
  } catch {
    console.log('ℹ ML service not reachable yet — it retrains from the database on its next start');
  }
}

async function main() {
  const reset = process.argv.includes('--reset');
  if (process.env.SEED_DEMO === 'false' && !reset) {
    console.log('SEED_DEMO=false — skipping demo seed');
    return;
  }

  const password = await bcrypt.hash(DEMO_PASSWORD, 10);
  const demo = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { role: 'ADMIN' },
    create: { email: DEMO_EMAIL, password, name: 'Demo Admin', role: 'ADMIN' },
  });

  const existing = await prisma.attendanceRecord.count();
  if (existing > 0 && !reset) {
    console.log(`Database already has ${existing} attendance records — skipping (use --reset to reseed).`);
    return;
  }
  if (reset) {
    await prisma.$transaction([
      prisma.prediction.deleteMany(),
      prisma.wasteRecord.deleteMany(),
      prisma.attendanceRecord.deleteMany(),
      prisma.dailySummary.deleteMany(),
      prisma.monthlySummary.deleteMany(),
      prisma.inventoryItem.deleteMany(),
    ]);
  }

  const today = new Date();
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - DAYS * 86400000;

  const attendance: any[] = [];
  const waste: any[] = [];
  const summaries: any[] = [];

  for (let i = 0; i < DAYS; i++) {
    const date = new Date(start + i * 86400000);
    const dow = date.getUTCDay();
    const doy = Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000);
    const season = 1 + 0.08 * Math.sin((2 * Math.PI * doy) / 365.25);
    const weekend = dow === 0 || dow === 6;
    let dayAttendance = 0, dayWaste = 0, dayPrepared = 0;

    for (const [meal, cfg] of Object.entries(MEALS)) {
      const count = Math.max(20, Math.round(cfg.base * DOW_FACTOR[dow] * season * normal(1, 0.05)));
      attendance.push({ date, mealType: meal, count, userId: demo.id });

      const consumed = count * cfg.portion * normal(1, 0.04);
      const planned = cfg.base * cfg.portion * season * (weekend ? 0.85 : 1);
      const prepared = Math.max(planned * normal(1.03, 0.03), consumed * 1.02);
      const mealWaste = Math.max(prepared - consumed, 0) + Math.max(normal(4, 1.5), 0.5) * (weekend ? 1.4 : 1);
      const preparedTotal = consumed + mealWaste;

      for (const [item, category, share] of cfg.items) {
        const j = Math.floor(rand() * REASONS.length);
        const itemWaste = r2(mealWaste * share * normal(1, 0.15));
        waste.push({
          date,
          foodItem: item,
          category: WASTE_CATEGORY[j],
          quantityWasted: Math.max(0.1, itemWaste),
          quantityPrepared: r2(preparedTotal * share),
          reason: REASONS[j],
          mealType: meal,
          userId: demo.id,
        });
        dayWaste += Math.max(0.1, itemWaste);
        dayPrepared += preparedTotal * share;
      }
      dayAttendance += count;
    }
    summaries.push({
      date,
      totalAttendance: dayAttendance,
      totalWaste: r2(dayWaste),
      wastePercentage: r2((dayWaste / dayPrepared) * 100),
      mealType: 'ALL',
    });
  }

  await prisma.attendanceRecord.createMany({ data: attendance, skipDuplicates: true });
  await prisma.wasteRecord.createMany({ data: waste });
  await prisma.dailySummary.createMany({ data: summaries, skipDuplicates: true });

  const inDays = (n: number) => new Date(Date.now() + n * 86400000);
  await prisma.inventoryItem.createMany({
    skipDuplicates: true,
    data: [
      { name: 'Basmati Rice', category: 'GRAINS', unit: 'kg', quantity: 340, minThreshold: 150, maxThreshold: 600, unitCost: 95, supplier: 'Agro Wholesale', expiryDate: inDays(180) },
      { name: 'Wheat Flour (Atta)', category: 'GRAINS', unit: 'kg', quantity: 120, minThreshold: 150, maxThreshold: 500, unitCost: 42, supplier: 'Agro Wholesale', expiryDate: inDays(60) },
      { name: 'Toor Dal', category: 'PULSES', unit: 'kg', quantity: 85, minThreshold: 60, maxThreshold: 250, unitCost: 140, supplier: 'Pulse Traders', expiryDate: inDays(150) },
      { name: 'Moong Dal', category: 'PULSES', unit: 'kg', quantity: 40, minThreshold: 50, maxThreshold: 150, unitCost: 120, supplier: 'Pulse Traders', expiryDate: inDays(140) },
      { name: 'Paneer', category: 'DAIRY', unit: 'kg', quantity: 18, minThreshold: 10, maxThreshold: 40, unitCost: 380, supplier: 'City Dairy', expiryDate: inDays(3) },
      { name: 'Milk', category: 'DAIRY', unit: 'L', quantity: 60, minThreshold: 40, maxThreshold: 120, unitCost: 58, supplier: 'City Dairy', expiryDate: inDays(2) },
      { name: 'Potatoes', category: 'VEGETABLES', unit: 'kg', quantity: 210, minThreshold: 80, maxThreshold: 180, unitCost: 28, supplier: 'Fresh Mandi', expiryDate: inDays(20) },
      { name: 'Onions', category: 'VEGETABLES', unit: 'kg', quantity: 95, minThreshold: 60, maxThreshold: 200, unitCost: 35, supplier: 'Fresh Mandi', expiryDate: inDays(25) },
      { name: 'Tomatoes', category: 'VEGETABLES', unit: 'kg', quantity: 30, minThreshold: 40, maxThreshold: 120, unitCost: 30, supplier: 'Fresh Mandi', expiryDate: inDays(5) },
      { name: 'Poha', category: 'GRAINS', unit: 'kg', quantity: 55, minThreshold: 30, maxThreshold: 100, unitCost: 60, supplier: 'Agro Wholesale', expiryDate: inDays(90) },
      { name: 'Bread Loaves', category: 'BAKERY', unit: 'pcs', quantity: 45, minThreshold: 30, maxThreshold: 120, unitCost: 40, supplier: 'Daily Bakery', expiryDate: inDays(-1) },
      { name: 'Cooking Oil', category: 'OILS', unit: 'L', quantity: 75, minThreshold: 40, maxThreshold: 150, unitCost: 145, supplier: 'Agro Wholesale', expiryDate: inDays(240) },
    ],
  });

  console.log(`✓ Seeded ${attendance.length} attendance, ${waste.length} waste records, ${summaries.length} daily summaries, 12 inventory items`);
  console.log(`✓ Demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  await triggerRetrain();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
