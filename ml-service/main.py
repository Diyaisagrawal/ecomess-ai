"""
EcoMess AI - ML Service

Forecasts mess attendance, food demand and food waste per (date, meal) using
XGBoost models trained on the live PostgreSQL data written by the backend.

- On startup (and on POST /train/trigger) models are trained in a background
  thread from the database. If there is not enough real history yet, a
  realistic synthetic history is used so the service is always usable; the
  response metadata says which source was used.
- Metrics (MAE / RMSE / MAPE / R2) are computed on a chronological hold-out
  split (last 20% of days), then the model is refit on all data.
"""

from __future__ import annotations

import logging
import os
import threading
from contextlib import asynccontextmanager
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from xgboost import XGBRegressor

try:  # optional locally, required in production
    import psycopg
except ImportError:  # pragma: no cover
    psycopg = None

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("ml-service")

# ==================== CONFIG ====================

DATABASE_URL = os.getenv("DATABASE_URL", "")
ML_API_KEY = os.getenv("ML_API_KEY", "")
MIN_REAL_ROWS = int(os.getenv("MIN_REAL_ROWS", "60"))
MODELS_DIR = Path(os.getenv("MODELS_DIR", Path(__file__).parent / "models"))
MODELS_DIR.mkdir(parents=True, exist_ok=True)
MODEL_FILE = MODELS_DIR / "ecomess_models.joblib"

MEAL_TYPES = ["BREAKFAST", "LUNCH", "DINNER"]
FEATURES = [
    "day_of_week", "day_of_month", "month", "week_of_year", "is_weekend",
    "doy_sin", "doy_cos", "meal_BREAKFAST", "meal_LUNCH", "meal_DINNER",
]
MODEL_NAMES = {
    "attendance": "attendance_predictor",
    "demand": "demand_predictor",
    "waste": "waste_predictor",
}

@asynccontextmanager
async def lifespan(_app: FastAPI):
    _startup()
    yield


app = FastAPI(
    lifespan=lifespan,
    title="EcoMess AI - ML Service",
    description="XGBoost forecasting of attendance, food demand and waste",
    version="2.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_api_key(x_api_key: Optional[str] = Header(default=None)) -> None:
    if ML_API_KEY and x_api_key != ML_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


# ==================== REQUEST MODELS ====================

class PredictionRequest(BaseModel):
    date: str
    mealType: str = "LUNCH"


class BatchPredictionRequest(BaseModel):
    start_date: str
    end_date: str
    meal_type: str = "LUNCH"


class TrainingRequest(BaseModel):
    reason: Optional[str] = Field(default=None, description="Free-text note for the job log")


# ==================== FEATURES ====================

def parse_date(value: str) -> date:
    try:
        return datetime.fromisoformat(value[:10]).date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid date '{value}', expected YYYY-MM-DD") from exc


def normalise_meal(meal: str) -> str:
    meal = (meal or "LUNCH").upper()
    if meal not in MEAL_TYPES:
        raise HTTPException(status_code=400, detail=f"mealType must be one of {MEAL_TYPES}")
    return meal


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """df needs columns: date (datetime64), meal_type."""
    d = pd.to_datetime(df["date"])
    out = pd.DataFrame(index=df.index)
    out["day_of_week"] = d.dt.weekday
    out["day_of_month"] = d.dt.day
    out["month"] = d.dt.month
    out["week_of_year"] = d.dt.isocalendar().week.astype(int)
    out["is_weekend"] = (d.dt.weekday >= 5).astype(int)
    doy = d.dt.dayofyear
    out["doy_sin"] = np.sin(2 * np.pi * doy / 365.25)
    out["doy_cos"] = np.cos(2 * np.pi * doy / 365.25)
    for m in MEAL_TYPES:
        out[f"meal_{m}"] = (df["meal_type"] == m).astype(int)
    return out[FEATURES]


# ==================== DATA ====================

def synthetic_history(days: int = 365, seed: int = 42) -> pd.DataFrame:
    """Realistic mess history used only until enough real data exists."""
    rng = np.random.default_rng(seed)
    end = date.today() - timedelta(days=1)
    rows = []
    base = {"BREAKFAST": 260, "LUNCH": 420, "DINNER": 360}
    portion = {"BREAKFAST": 0.30, "LUNCH": 0.55, "DINNER": 0.50}  # kg consumed / person
    for i in range(days):
        d = end - timedelta(days=days - 1 - i)
        dow = d.weekday()
        dow_f = [1.0, 1.02, 1.03, 1.0, 0.92, 0.70, 0.62][dow]
        season = 1 + 0.08 * np.sin(2 * np.pi * d.timetuple().tm_yday / 365.25)
        vacation = 0.55 if d.month in (5, 6) or (d.month == 12 and d.day > 20) else 1.0
        for meal in MEAL_TYPES:
            att = base[meal] * dow_f * season * vacation * rng.normal(1, 0.05)
            consumed = att * portion[meal] * rng.normal(1, 0.04)
            # cooks prepare for a "normal" day -> more waste on low-attendance days
            planned = base[meal] * portion[meal] * season * (1.0 if dow < 5 else 0.85)
            prepared = max(planned * rng.normal(1.03, 0.03), consumed * 1.02)
            waste = max(prepared - consumed, 0) + rng.normal(4, 1.5) * (1.4 if dow >= 5 else 1)
            rows.append({
                "date": pd.Timestamp(d), "meal_type": meal,
                "attendance": round(att), "waste_kg": round(max(waste, 0.5), 2),
                "prepared_kg": round(prepared + max(waste - (prepared - consumed), 0), 2),
            })
    return pd.DataFrame(rows)


def load_real_history() -> Optional[pd.DataFrame]:
    if not DATABASE_URL or psycopg is None:
        return None
    url = DATABASE_URL.split("?schema=")[0]
    att_sql = """
        SELECT date_trunc('day', "date")::date AS d, "mealType" AS meal_type, SUM("count") AS attendance
        FROM "AttendanceRecord" GROUP BY 1, 2
    """
    waste_sql = """
        SELECT date_trunc('day', "date")::date AS d, "mealType" AS meal_type,
               SUM("quantityWasted") AS waste_kg, SUM(COALESCE("quantityPrepared", 0)) AS prepared_kg
        FROM "WasteRecord" GROUP BY 1, 2
    """
    with psycopg.connect(url, connect_timeout=10) as conn, conn.cursor() as cur:
        cur.execute(att_sql)
        att = pd.DataFrame(cur.fetchall(), columns=["date", "meal_type", "attendance"])
        cur.execute(waste_sql)
        waste = pd.DataFrame(cur.fetchall(), columns=["date", "meal_type", "waste_kg", "prepared_kg"])
    if att.empty:
        return att
    df = att.merge(waste, on=["date", "meal_type"], how="left")
    df["date"] = pd.to_datetime(df["date"])
    for c in ["attendance", "waste_kg", "prepared_kg"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df[df["meal_type"].isin(MEAL_TYPES)]
    return df.sort_values("date").reset_index(drop=True)


def load_item_waste() -> pd.DataFrame:
    if not DATABASE_URL or psycopg is None:
        return pd.DataFrame()
    sql = """
        SELECT "foodItem", "category", EXTRACT(ISODOW FROM "date")::int AS dow,
               SUM("quantityWasted") AS wasted, SUM(COALESCE("quantityPrepared",0)) AS prepared
        FROM "WasteRecord" WHERE "date" >= NOW() - INTERVAL '60 days'
        GROUP BY 1, 2, 3
    """
    try:
        with psycopg.connect(DATABASE_URL.split("?schema=")[0], connect_timeout=10) as conn, conn.cursor() as cur:
            cur.execute(sql)
            return pd.DataFrame(cur.fetchall(), columns=["food_item", "category", "dow", "wasted", "prepared"])
    except Exception as exc:  # noqa: BLE001
        log.warning("Item waste query failed: %s", exc)
        return pd.DataFrame()


# ==================== TRAINING ====================

def _xgb() -> XGBRegressor:
    return XGBRegressor(
        n_estimators=300, max_depth=4, learning_rate=0.05, subsample=0.9,
        colsample_bytree=0.9, min_child_weight=2, n_jobs=2, random_state=42,
    )


def _fit_with_metrics(X: pd.DataFrame, y: pd.Series, dates: pd.Series) -> dict[str, Any]:
    unique_days = np.sort(dates.unique())
    cutoff = unique_days[int(len(unique_days) * 0.8)] if len(unique_days) >= 10 else unique_days[-1]
    train, test = dates < cutoff, dates >= cutoff
    if train.sum() < 10 or test.sum() < 3:
        train = test = pd.Series(True, index=X.index)

    m = _xgb().fit(X[train], y[train])
    pred = m.predict(X[test])
    yt = y[test].to_numpy()
    nz = np.abs(yt) > 1e-6
    mae = float(mean_absolute_error(yt, pred))
    rmse = float(np.sqrt(mean_squared_error(yt, pred)))
    mape = float(np.mean(np.abs((yt[nz] - pred[nz]) / yt[nz])) * 100) if nz.any() else 0.0
    r2 = float(r2_score(yt, pred)) if len(yt) > 1 else 0.0
    resid_std = float(np.std(yt - pred))

    final = _xgb().fit(X, y)  # refit on everything for serving
    importances = dict(sorted(
        zip(X.columns, map(float, final.feature_importances_)), key=lambda kv: -kv[1]
    )[:5])
    return {
        "model": final,
        "metrics": {
            "mae": round(mae, 3), "rmse": round(rmse, 3), "mape": round(mape, 2),
            "r2": round(r2, 4), "accuracy": round(max(0.0, 1 - mape / 100), 4),
            "train_rows": int(train.sum()), "test_rows": int(test.sum()),
        },
        "resid_std": resid_std,
        "top_features": importances,
    }


def train_all() -> dict[str, Any]:
    source = "database"
    try:
        df = load_real_history()
    except Exception as exc:  # noqa: BLE001
        log.warning("Could not read training data from DB: %s", exc)
        df = None
    if df is None or len(df) < MIN_REAL_ROWS:
        log.info("Real rows=%s < %s -> using synthetic history", 0 if df is None else len(df), MIN_REAL_ROWS)
        df, source = synthetic_history(), "synthetic"

    X = build_features(df)
    bundle: dict[str, Any] = {
        "version": datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S"),
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "data_source": source,
        "rows": int(len(df)),
        "date_range": [df["date"].min().date().isoformat(), df["date"].max().date().isoformat()],
        "models": {},
    }

    att = _fit_with_metrics(X, df["attendance"].astype(float), df["date"])
    bundle["models"]["attendance"] = att

    wdf = df.dropna(subset=["waste_kg"])
    if len(wdf) >= 20:
        Xw = X.loc[wdf.index].assign(attendance=wdf["attendance"].astype(float))
        bundle["models"]["waste"] = _fit_with_metrics(Xw, wdf["waste_kg"].astype(float), wdf["date"])

        ddf = wdf[wdf["prepared_kg"] > 0]
        if len(ddf) >= 20:
            consumed = (ddf["prepared_kg"] - ddf["waste_kg"]).clip(lower=0)
            Xd = X.loc[ddf.index].assign(attendance=ddf["attendance"].astype(float))
            bundle["models"]["demand"] = _fit_with_metrics(Xd, consumed, ddf["date"])

    # fallback per-head ratios for when a model can't be trained
    bundle["ratios"] = {
        "waste_per_head": float((wdf["waste_kg"] / wdf["attendance"].clip(lower=1)).median()) if len(wdf) else 0.03,
        "consumed_per_head": 0.45,
    }
    joblib.dump(bundle, MODEL_FILE)
    log.info("Training complete (%s rows, source=%s)", len(df), source)
    return bundle


# ==================== STATE / JOBS ====================

STATE: dict[str, Any] = {"bundle": None}
JOBS: dict[str, dict[str, Any]] = {}
_train_lock = threading.Lock()


def _run_job(job_id: str) -> None:
    JOBS[job_id].update(status="running", progress=10)
    try:
        with _train_lock:
            bundle = train_all()
        STATE["bundle"] = bundle
        JOBS[job_id].update(
            status="completed", progress=100,
            finished_at=datetime.now(timezone.utc).isoformat(),
            data_source=bundle["data_source"], rows=bundle["rows"],
            models_trained=[MODEL_NAMES[k] for k in bundle["models"]],
            metrics={MODEL_NAMES[k]: v["metrics"] for k, v in bundle["models"].items()},
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("Training failed")
        JOBS[job_id].update(status="failed", error=str(exc))


def start_training() -> str:
    job_id = "train_" + uuid.uuid4().hex[:10]
    JOBS[job_id] = {"job_id": job_id, "status": "queued", "progress": 0,
                    "started_at": datetime.now(timezone.utc).isoformat()}
    threading.Thread(target=_run_job, args=(job_id,), daemon=True).start()
    return job_id


def _startup() -> None:
    if MODEL_FILE.exists():
        try:
            STATE["bundle"] = joblib.load(MODEL_FILE)
            log.info("Loaded cached models v%s", STATE["bundle"]["version"])
        except Exception as exc:  # noqa: BLE001
            log.warning("Could not load cached models: %s", exc)
    start_training()  # always refresh from latest data in background


def get_bundle() -> dict[str, Any]:
    bundle = STATE["bundle"]
    if bundle is None:
        # first boot on an empty disk: train synchronously so the request succeeds
        with _train_lock:
            if STATE["bundle"] is None:
                STATE["bundle"] = train_all()
        bundle = STATE["bundle"]
    return bundle


# ==================== PREDICTION ====================

def _confidence(entry: dict[str, Any]) -> float:
    return round(min(0.99, max(0.05, entry["metrics"]["accuracy"])), 3)


def forecast(day: date, meal: str) -> dict[str, Any]:
    b = get_bundle()
    frame = pd.DataFrame({"date": [pd.Timestamp(day)], "meal_type": [meal]})
    X = build_features(frame)

    a = b["models"]["attendance"]
    attendance = max(0.0, float(a["model"].predict(X)[0]))
    out: dict[str, Any] = {
        "attendance": round(attendance),
        "attendance_interval": [max(0, round(attendance - 1.96 * a["resid_std"])),
                                round(attendance + 1.96 * a["resid_std"])],
        "attendance_confidence": _confidence(a),
    }
    Xa = X.assign(attendance=attendance)

    w = b["models"].get("waste")
    if w:
        waste = max(0.0, float(w["model"].predict(Xa)[0]))
        out["waste_confidence"] = _confidence(w)
    else:
        waste = attendance * b["ratios"]["waste_per_head"]
        out["waste_confidence"] = 0.5
    out["waste_kg"] = round(waste, 2)

    d = b["models"].get("demand")
    if d:
        demand = max(0.0, float(d["model"].predict(Xa)[0]))
        out["demand_confidence"] = _confidence(d)
    else:
        demand = attendance * b["ratios"]["consumed_per_head"]
        out["demand_confidence"] = 0.5
    out["demand_kg"] = round(demand, 2)
    out["recommended_prep_kg"] = round(demand * 1.05, 2)  # 5% safety buffer
    out["waste_pct_if_overprepared"] = round(100 * waste / max(demand + waste, 1e-6), 2)
    return out


def _meta() -> dict[str, Any]:
    b = get_bundle()
    return {"model_version": b["version"], "data_source": b["data_source"]}


# ==================== ENDPOINTS ====================

@app.get("/health")
def health() -> dict[str, Any]:
    b = STATE["bundle"]
    return {
        "status": "ok",
        "service": "EcoMess AI ML Service",
        "version": app.version,
        "models_loaded": b is not None,
        "model_version": b["version"] if b else None,
        "data_source": b["data_source"] if b else None,
    }


@app.post("/predict/attendance", dependencies=[Depends(require_api_key)])
def predict_attendance(req: PredictionRequest) -> dict[str, Any]:
    day, meal = parse_date(req.date), normalise_meal(req.mealType)
    f = forecast(day, meal)
    return {"date": day.isoformat(), "meal_type": meal, "predicted_value": f["attendance"],
            "interval": f["attendance_interval"], "confidence": f["attendance_confidence"], **_meta()}


@app.post("/predict/demand", dependencies=[Depends(require_api_key)])
def predict_demand(req: PredictionRequest) -> dict[str, Any]:
    day, meal = parse_date(req.date), normalise_meal(req.mealType)
    f = forecast(day, meal)
    return {"date": day.isoformat(), "meal_type": meal, "predicted_demand": f["demand_kg"],
            "recommended_prep_kg": f["recommended_prep_kg"], "predicted_attendance": f["attendance"],
            "confidence": f["demand_confidence"], "unit": "kg", **_meta()}


@app.post("/predict/waste", dependencies=[Depends(require_api_key)])
def predict_waste(req: PredictionRequest) -> dict[str, Any]:
    day, meal = parse_date(req.date), normalise_meal(req.mealType)
    f = forecast(day, meal)
    return {"date": day.isoformat(), "meal_type": meal, "predicted_waste": f["waste_kg"],
            "predicted_attendance": f["attendance"], "confidence": f["waste_confidence"],
            "unit": "kg", **_meta()}


@app.post("/predict/batch", dependencies=[Depends(require_api_key)])
def predict_batch(req: BatchPredictionRequest) -> dict[str, Any]:
    start, end, meal = parse_date(req.start_date), parse_date(req.end_date), normalise_meal(req.meal_type)
    if end < start or (end - start).days > 62:
        raise HTTPException(status_code=400, detail="Range must be 0-62 days")
    days = []
    cur = start
    while cur <= end:
        f = forecast(cur, meal)
        days.append({"date": cur.isoformat(), "meal_type": meal, **f})
        cur += timedelta(days=1)
    return {"start_date": start.isoformat(), "end_date": end.isoformat(), "days": days,
            "count": len(days), **_meta()}


@app.get("/models", dependencies=[Depends(require_api_key)])
def list_models() -> dict[str, Any]:
    b = get_bundle()
    return {
        "trained_at": b["trained_at"], "data_source": b["data_source"], "rows": b["rows"],
        "date_range": b["date_range"],
        "models": [
            {"name": MODEL_NAMES[k], "version": b["version"], **v["metrics"], "top_features": v["top_features"]}
            for k, v in b["models"].items()
        ],
    }


@app.get("/models/{model_name}/metrics", dependencies=[Depends(require_api_key)])
def model_metrics(model_name: str) -> dict[str, Any]:
    b = get_bundle()
    key = next((k for k, v in MODEL_NAMES.items() if v == model_name or k == model_name), None)
    if key is None or key not in b["models"]:
        raise HTTPException(status_code=404, detail="Model not found")
    entry = b["models"][key]
    return {"model": MODEL_NAMES[key], "version": b["version"], "trained_at": b["trained_at"],
            "data_source": b["data_source"], "metrics": entry["metrics"],
            "top_features": entry["top_features"]}


@app.post("/train/trigger", dependencies=[Depends(require_api_key)])
def trigger_training(req: Optional[TrainingRequest] = None) -> dict[str, Any]:
    job_id = start_training()
    return {"job_id": job_id, "status": "queued", "message": "Model training job started"}


@app.get("/train/status/{job_id}", dependencies=[Depends(require_api_key)])
def training_status(job_id: str) -> dict[str, Any]:
    if job_id not in JOBS:
        raise HTTPException(status_code=404, detail="Job not found")
    return JOBS[job_id]


DOW_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


@app.get("/recommendations", dependencies=[Depends(require_api_key)])
def recommendations() -> dict[str, Any]:
    recs: list[dict[str, Any]] = []
    items = load_item_waste()
    if not items.empty:
        items["wasted"] = items["wasted"].astype(float)
        items["prepared"] = items["prepared"].astype(float)
        by_item = items.groupby("food_item")[["wasted", "prepared"]].sum()
        by_item["rate"] = by_item["wasted"] / by_item["prepared"].replace(0, np.nan)
        for name, row in by_item.sort_values("wasted", ascending=False).head(3).iterrows():
            rate = row["rate"] if pd.notna(row["rate"]) else None
            recs.append({
                "type": "WASTE_REDUCTION",
                "title": f"Reduce {name} preparation",
                "description": (f"{name} produced {row['wasted']:.1f} kg of waste in the last 60 days"
                                + (f" ({rate * 100:.0f}% of what was prepared)." if rate else ".")),
                "expectedSavings": f"{row['wasted'] * 0.3:.1f} kg/60d",
                "priority": "HIGH" if (rate or 0) > 0.15 else "MEDIUM",
            })
        by_dow = items.groupby("dow")["wasted"].sum()
        if len(by_dow) >= 3:
            worst = int(by_dow.idxmax())
            recs.append({
                "type": "SCHEDULING",
                "title": f"{DOW_NAMES[worst]}s waste the most",
                "description": f"{DOW_NAMES[worst]} accounts for {100 * by_dow.max() / by_dow.sum():.0f}% "
                               "of weekly waste. Scale batch sizes to the forecast for that day.",
                "priority": "MEDIUM",
            })

    # forecast-based prep guidance for tomorrow
    tomorrow = date.today() + timedelta(days=1)
    for meal in MEAL_TYPES:
        f = forecast(tomorrow, meal)
        recs.append({
            "type": "PREPARATION",
            "title": f"Tomorrow's {meal.lower()}: prepare ~{f['recommended_prep_kg']:.0f} kg",
            "description": f"Expected {f['attendance']} diners (range {f['attendance_interval'][0]}-"
                           f"{f['attendance_interval'][1]}); forecast demand {f['demand_kg']:.0f} kg.",
            "priority": "MEDIUM",
        })
    return {"recommendations": recs, **_meta()}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
