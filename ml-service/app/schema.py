"""Pydantic request / response models for the ML service."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

EmploymentType = Literal["salaried", "self_employed", "casual_labour", "gig_worker"]
EducationLevel = Literal["none", "secondary", "graduate", "postgraduate"]
Decision = Literal["approve", "refer", "decline"]


class ApplicantFeatures(BaseModel):
    """Model inputs. Protected attributes (gender, region) are deliberately absent."""

    model_config = ConfigDict(extra="ignore", json_schema_extra={"example": {
        "age": 31, "monthly_income_proxy": 28000, "transaction_regularity": 0.72,
        "monthly_upi_txn_count": 34, "avg_monthly_balance": 18500, "bill_payment_consistency": 0.86,
        "mobile_recharge_regularity": 0.8, "digital_tenure_months": 30, "savings_ratio": 0.18,
        "existing_loans_count": 1, "debt_to_income": 0.22, "loan_amount_requested": 60000,
        "loan_tenure_months": 12, "dependents": 2, "employment_type": "self_employed",
        "education_level": "secondary",
    }})

    age: int = Field(..., ge=18, le=75)
    monthly_income_proxy: float = Field(..., ge=0, le=5_000_000, description="INR / month")
    transaction_regularity: float = Field(..., ge=0, le=1)
    monthly_upi_txn_count: int = Field(..., ge=0, le=2000)
    avg_monthly_balance: float = Field(..., ge=0, le=50_000_000)
    bill_payment_consistency: float = Field(..., ge=0, le=1)
    mobile_recharge_regularity: float = Field(..., ge=0, le=1)
    digital_tenure_months: int = Field(..., ge=0, le=360)
    savings_ratio: float = Field(..., ge=0, le=1)
    existing_loans_count: int = Field(..., ge=0, le=30)
    debt_to_income: float = Field(..., ge=0, le=5)
    loan_amount_requested: float = Field(..., gt=0, le=10_000_000)
    loan_tenure_months: int = Field(..., ge=1, le=120)
    dependents: int = Field(0, ge=0, le=15)
    employment_type: EmploymentType
    education_level: EducationLevel
    data_sparsity_flag: Optional[bool] = Field(
        None, description="Computed from tenure and UPI activity when omitted")


class FactorDetail(BaseModel):
    feature: str
    label: str
    shap: float = Field(..., description="Contribution in log-odds (positive raises risk)")
    value: Optional[float | str | bool] = None
    direction: Literal["increases_risk", "decreases_risk"]
    reason: str


class PredictionResponse(BaseModel):
    risk_score: float = Field(..., description="Probability of default (0-1)")
    credit_score: int = Field(..., description="Scaled score, 300 (high risk) to 900 (low risk)")
    decision: Decision
    risk_band: Literal["low", "medium", "high"]
    shap_values: dict[str, float]
    top_factors: list[str]
    top_factor_details: list[FactorDetail]
    base_value: float
    data_sparsity_flag: bool
    model_version: str
    thresholds: dict[str, float]


class ExplanationResponse(BaseModel):
    risk_score: float
    decision: Decision
    base_value: float
    base_probability: float
    summary: str
    positive_factors: list[FactorDetail]
    negative_factors: list[FactorDetail]
    waterfall: list[dict]
    shap_values: dict[str, float]
    engineered_features: dict[str, float]
    model_version: str


class BatchRequest(BaseModel):
    applicants: list[ApplicantFeatures] = Field(..., min_length=1, max_length=1000)


class AuditRecord(BaseModel):
    risk_score: float = Field(..., ge=0, le=1)
    decision: Decision
    gender: Optional[str] = None
    region: Optional[str] = None
    actual_default: Optional[int] = Field(None, ge=0, le=1)


class AuditRequest(BaseModel):
    records: list[AuditRecord] = Field(..., min_length=1, max_length=200_000)
    min_group_size: int = Field(20, ge=1)
