import os
import tempfile

os.environ["MODELS_DIR"] = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = ""
os.environ["ML_API_KEY"] = "test-key"

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

H = {"X-API-Key": "test-key"}


def client():
    main.STATE["bundle"] = main.train_all()
    return TestClient(main.app)


c = client()


def test_health():
    r = c.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_requires_key():
    assert c.post("/predict/attendance", json={"date": "2026-10-08"}).status_code == 401


def test_predictions_are_sane():
    weekday = c.post("/predict/attendance", json={"date": "2026-10-07", "mealType": "LUNCH"}, headers=H).json()
    sunday = c.post("/predict/attendance", json={"date": "2026-10-11", "mealType": "LUNCH"}, headers=H).json()
    assert weekday["predicted_value"] > sunday["predicted_value"] > 0
    assert 0 < weekday["confidence"] <= 1
    w = c.post("/predict/waste", json={"date": "2026-10-07"}, headers=H).json()
    d = c.post("/predict/demand", json={"date": "2026-10-07"}, headers=H).json()
    assert w["predicted_waste"] > 0 and d["predicted_demand"] > w["predicted_waste"]


def test_bad_input():
    assert c.post("/predict/attendance", json={"date": "nope"}, headers=H).status_code == 400
    assert c.post("/predict/attendance", json={"date": "2026-10-07", "mealType": "SNACK"}, headers=H).status_code == 400


def test_batch_and_metrics():
    r = c.post("/predict/batch", json={"start_date": "2026-10-08", "end_date": "2026-10-14"}, headers=H).json()
    assert r["count"] == 7
    m = c.get("/models/attendance_predictor/metrics", headers=H).json()
    assert m["metrics"]["r2"] > 0.5 and m["data_source"] == "synthetic"


def test_training_job():
    job = c.post("/train/trigger", json={}, headers=H).json()
    import time
    for _ in range(60):
        s = c.get(f"/train/status/{job['job_id']}", headers=H).json()
        if s["status"] in ("completed", "failed"):
            break
        time.sleep(0.5)
    assert s["status"] == "completed"
