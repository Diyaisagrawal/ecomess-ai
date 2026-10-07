# EcoMess AI

AI-powered food-waste prediction and inventory management for institutional messes and canteens.

**Live demo:**https://ecomess-ai.vercel.app/. Click **Try the demo account** (`demo@ecomess.ai` / `EcoMess@2026`).

## What it does

| Area | Features |
|---|---|
| **AI forecasts** | 7-day forecasts of attendance, food demand (kg) and waste (kg) per meal, with 95% ranges, recommended prep quantities and data-driven recommendations |
| **Waste tracking** | Log waste by item, category, reason and meal. History, filters and stats |
| **Inventory** | Stock levels, low-stock / overstock / expiry alerts, inventory value |
| **Attendance** | Log head counts per meal, trends and meal-wise breakdown |
| **Auth** | JWT access + refresh tokens, role-based access (STAFF / MANAGER / ADMIN) |

## Architecture

```
Next.js 16 (Vercel) ──► Express + Prisma API (Render) ──► PostgreSQL (Neon)
                                   │                          ▲
                                   └──► FastAPI ML service ───┘
                                        (Render, XGBoost)  reads history to train
```

| Service | Stack | Folder |
|---|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind 4, Zustand, Recharts | `frontend/` |
| API | Express, TypeScript, Prisma, JWT, Helmet | `backend/` |
| ML | FastAPI, XGBoost, scikit-learn, pandas | `ml-service/` |
| DB | PostgreSQL 16 | Neon / docker-compose |

### ML pipeline

- **Features:** day of week, day of month, month, ISO week, weekend flag, cyclical day-of-year (sin/cos), one-hot meal type.
- **Models (XGBoost):**
  - Attendance: predicts diners from the features above.
  - Waste (kg): features + attendance.
  - Demand / consumed (kg): features + attendance.
  - At inference time, the predicted attendance feeds the waste and demand models.
- **Evaluation:** chronological hold-out (last 20% of days). The service reports MAE, RMSE, MAPE, R² and the top feature importances, then refits on all the data for serving.
- **Training data:** read live from Postgres on startup and on demand (`POST /train/trigger`, the **Retrain models** button). With fewer than 60 rows of real history, it bootstraps on realistic synthetic data and labels the result as synthetic in the UI and API.
- **Accuracy tracking:** every forecast is stored. `GET /api/predictions/accuracy/:type` back-fills actuals from logged attendance and waste, and reports live MAE / RMSE / MAPE.

## Run locally

**Option A: everything in Docker**
```bash
docker compose up --build
# http://localhost:3000  (API :5000, ML docs :8000/docs)
```

**Option B: dev servers**
```bash
docker compose up -d postgres

cd backend && cp .env.example .env && npm install
npx prisma migrate deploy && npm run seed && npm run dev

cd ml-service && python -m venv venv && venv\Scripts\activate   # (source venv/bin/activate on mac/linux)
pip install -r requirements-dev.txt && copy .env.example .env
uvicorn main:app --reload --port 8000

cd frontend && copy .env.example .env.local && npm install && npm run dev
```
Tests: `cd ml-service && pytest`.

## Deploy (free tier)

1. **Database (Neon).** Create a project at neon.tech and copy the **direct** (non-pooled) connection string. It looks like `postgresql://…neon.tech/neondb?sslmode=require`.
2. **Push to GitHub.**
3. **API + ML (Render).** Go to *New → Blueprint* and pick this repo. `render.yaml` creates `ecomess-api` and `ecomess-ml`. Fill in:
   - `DATABASE_URL`: the Neon string, on both services.
   - `ML_SERVICE_URL`: the ML service URL, e.g. `https://ecomess-ml.onrender.com`.
   - `FRONTEND_URL`: your Vercel URL. Enter it after step 4, then redeploy.

   On first boot the API runs the migrations, seeds 120 days of demo data, and triggers model training.
4. **Frontend (Vercel).** Import the repo, set *Root Directory* = `frontend`, and add the env var `NEXT_PUBLIC_API_URL=https://ecomess-api.onrender.com/api`.
5. Set `FRONTEND_URL` on the Render API to the Vercel domain, and you're live.

> Free Render instances sleep after 15 minutes idle. The first request afterwards takes about 30–50 s. On each wake-up the ML service retrains on the latest data.

## API overview

All routes are under `/api` and need `Authorization: Bearer <token>`, except the auth routes.

| Route | Description |
|---|---|
| `POST /auth/register` · `/auth/login` · `/auth/refresh` · `GET /auth/me` | Auth |
| `GET/POST/PUT/DELETE /waste` · `GET /waste/stats/:start/:end` | Waste records |
| `GET/POST/PUT/DELETE /inventory` · `/inventory/alerts/summary` · `/inventory/summary/overview` | Inventory |
| `GET/POST /attendance` · `/attendance/stats/range` | Attendance |
| `GET /analytics/dashboard` · `/analytics/trends/:metric` · `/analytics/kpi/today` | Analytics |
| `GET /predictions/forecast/week?mealType=` | 7-day ML forecast |
| `POST /predictions/{attendance,demand,waste}` | Single-day prediction |
| `GET /predictions/models` · `/predictions/recommendations` · `/predictions/accuracy/:type` | Model metrics & insights |
| `POST /predictions/train/trigger` (MANAGER/ADMIN) · `GET /predictions/train/status/:id` | Retraining |
| `GET /users` (MANAGER/ADMIN) · `PATCH /users/:id/role` (ADMIN) | Users |
