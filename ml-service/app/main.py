"""
FastAPI ML microservice - stateless scoring, explanation and audit API.

It never touches MongoDB; the Express backend is its only client.

Endpoints
  GET  /health                 liveness + model version
  POST /predict                risk score + approve/refer/decline + SHAP summary
  POST /predict/batch          up to 1,000 applicants (used by seeding / back-testing)
  POST /explain/batch          explanations for many applicants (seeding)
  POST /explain                full SHAP explanation + plain-language reason string
  GET  /fairness-report        latest stored OFFLINE fairness audit (Fairlearn)
  POST /audit                  live batch fairness audit over recent decisions
  GET  /model/info             model card
  GET  /model/comparison       multi-algorithm comparison report
  GET  /model/evaluation       XGBoost held-out evaluation report
  GET  /model/explainability   global SHAP importance, beeswarm, stability
  GET  /model/training         hyperparameter search + learning curve
  GET  /model/public-validation results on public real datasets (if run)
"""
from __future__ import annotations

import os
import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from app.audit import run_audit
from app.features import CATEGORICAL_FEATURES, FEATURE_LABELS, PROTECTED_ATTRIBUTES, RAW_FEATURES
from app.model_loader import get_bundle, load_report
from app.schema import (
    ApplicantFeatures, AuditRequest, BatchRequest, ExplanationResponse, PredictionResponse,
)
from app.scoring import explain_applicant, public, score_applicants

INTERNAL_KEY = os.environ.get("ML_SERVICE_KEY", "")

@asynccontextmanager
async def lifespan(_: FastAPI):
    get_bundle()  # load model + preprocessor + explainer once at start-up, not per request
    yield


app = FastAPI(
    lifespan=lifespan,
    title="Credit Scoring ML Service",
    version="1.0.0",
    description="XGBoost credit-risk scoring with SHAP explanations and Fairlearn audits.",
)


def require_internal_key(x_internal_key: str | None = Header(default=None)):
    """Optional shared secret so only the Express backend can call this service."""
    if INTERNAL_KEY and x_internal_key != INTERNAL_KEY:
        raise HTTPException(status_code=401, detail="Invalid internal service key")


@app.middleware("http")
async def timing(request: Request, call_next):
    t0 = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Process-Time-Ms"] = f"{(time.perf_counter() - t0) * 1000:.1f}"
    return response


@app.exception_handler(ValueError)
async def value_error_handler(_: Request, exc: ValueError):
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.get("/health")
def health():
    b = get_bundle()
    return {"status": "ok", "model_version": b.version, "n_features": len(b.preprocessor.feature_names_)}


@app.post("/predict", response_model=PredictionResponse, dependencies=[Depends(require_internal_key)])
def predict(applicant: ApplicantFeatures):
    return public(score_applicants(get_bundle(), [applicant.model_dump()])[0])


@app.post("/predict/batch", dependencies=[Depends(require_internal_key)])
def predict_batch(req: BatchRequest):
    res = score_applicants(get_bundle(), [a.model_dump() for a in req.applicants])
    return {"count": len(res), "results": [public(r) for r in res]}


@app.post("/explain/batch", dependencies=[Depends(require_internal_key)])
def explain_batch(req: BatchRequest):
    b = get_bundle()
    return {"count": len(req.applicants),
            "results": [explain_applicant(b, a.model_dump()) for a in req.applicants]}


@app.post("/explain", response_model=ExplanationResponse, dependencies=[Depends(require_internal_key)])
def explain(applicant: ApplicantFeatures):
    return explain_applicant(get_bundle(), applicant.model_dump())


@app.get("/fairness-report", dependencies=[Depends(require_internal_key)])
def fairness_report():
    rep = load_report("fairness_report.json")
    if rep is None:
        raise HTTPException(404, "No fairness report. Run training/fairness_audit.py")
    return rep


@app.post("/audit", dependencies=[Depends(require_internal_key)])
def audit(req: AuditRequest):
    return run_audit([r.model_dump() for r in req.records], req.min_group_size)


@app.get("/model/info", dependencies=[Depends(require_internal_key)])
def model_info():
    b = get_bundle()
    return {
        **b.card,
        "raw_features": RAW_FEATURES,
        "categorical_options": CATEGORICAL_FEATURES,
        "feature_labels": FEATURE_LABELS,
        "protected_attributes": list(PROTECTED_ATTRIBUTES),
        "base_value": b.base_value,
    }


def _report(name: str):
    rep = load_report(name)
    if rep is None:
        raise HTTPException(404, f"{name} not found. Run the training pipeline.")
    return rep


@app.get("/model/comparison", dependencies=[Depends(require_internal_key)])
def model_comparison():
    return _report("model_comparison.json")


@app.get("/model/evaluation", dependencies=[Depends(require_internal_key)])
def model_evaluation():
    return _report("evaluation.json")


@app.get("/model/explainability", dependencies=[Depends(require_internal_key)])
def model_explainability():
    return _report("explainability.json")


@app.get("/model/training", dependencies=[Depends(require_internal_key)])
def model_training():
    return _report("training_report.json")


@app.get("/model/public-validation", dependencies=[Depends(require_internal_key)])
def public_validation():
    return load_report("public_validation.json") or {"status": "not_run"}
