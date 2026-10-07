"""Backwards-compatible entry point. The service now lives in main.py.

Run with:  uvicorn main:app --reload --port 8000
"""
import os

from main import app  # noqa: F401

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
