"""
Phase 1, step 1 - Synthetic applicant dataset (default: 80,000 rows).

Calibration anchors (approximate, used to set marginal distributions only):
  * PLFS (Periodic Labour Force Survey) - employment mix skewed towards
    self-employment and casual labour, with a smaller regular-salaried share
    and lower female labour participation.
  * NPCI UPI statistics - very high and growing UPI adoption, with urban
    users transacting markedly more often than rural users.
  * RBI Financial Inclusion Index - inclusion is broad but shallow; rural
    users and women have thinner digital/credit footprints.

The default label is generated ONLY from behavioural/financial features. The
protected attributes (gender, region) influence those features (income gap,
digital-gap, thinner footprints), exactly as in the real world, so the model
can learn proxy disparities that the fairness audit must detect and mitigate.
Protected attributes are written to the CSV but kept out of the feature set.

Usage:
    python training/generate_synthetic_data.py --rows 80000 --seed 42
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.preprocessing import compute_sparsity_flag, estimate_emi  # noqa: E402

HERE = os.path.dirname(__file__)
DEFAULT_OUT = os.path.join(HERE, "..", "data", "synthetic_applicants.csv")


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def generate(n: int, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    # ---- protected attributes ---------------------------------------------------
    gender = rng.choice(["male", "female"], size=n, p=[0.64, 0.36])
    region = rng.choice(["urban", "rural"], size=n, p=[0.45, 0.55])
    is_f = gender == "female"
    is_r = region == "rural"

    # ---- demographics -----------------------------------------------------------
    age = np.clip(rng.normal(34, 9, n), 21, 65).round().astype(int)
    dependents = np.clip(rng.poisson(1.6 + 0.5 * is_r), 0, 7)

    edu_p_urban = [0.06, 0.44, 0.38, 0.12]
    edu_p_rural = [0.16, 0.58, 0.22, 0.04]
    education = np.where(
        is_r,
        rng.choice(["none", "secondary", "graduate", "postgraduate"], size=n, p=edu_p_rural),
        rng.choice(["none", "secondary", "graduate", "postgraduate"], size=n, p=edu_p_urban),
    )

    # PLFS-like employment mix, differing by region
    emp_urban = [0.42, 0.33, 0.10, 0.15]
    emp_rural = [0.14, 0.52, 0.28, 0.06]
    employment = np.where(
        is_r,
        rng.choice(["salaried", "self_employed", "casual_labour", "gig_worker"], size=n, p=emp_rural),
        rng.choice(["salaried", "self_employed", "casual_labour", "gig_worker"], size=n, p=emp_urban),
    )

    # ---- income proxy (INR / month) -------------------------------------------
    base = {"salaried": 10.45, "self_employed": 10.15, "casual_labour": 9.55, "gig_worker": 9.95}
    edu_bump = {"none": -0.18, "secondary": 0.0, "graduate": 0.22, "postgraduate": 0.40}
    mu = (
        np.vectorize(base.get)(employment)
        + np.vectorize(edu_bump.get)(education)
        - 0.28 * is_r
        - 0.15 * is_f
        + 0.012 * (age - 34)
    )
    income = np.round(np.exp(rng.normal(mu, 0.45)), -2)
    income = np.clip(income, 4000, 400000)

    # ---- digital behaviour (NPCI-like) -------------------------------------------
    tenure = np.clip(rng.gamma(2.4, 14 - 3 * is_r - 2.5 * is_f), 1, 120).round().astype(int)
    upi_lambda = np.exp(3.1 - 0.55 * is_r - 0.2 * is_f + 0.25 * np.log1p(tenure) / 2 + 0.15 * (np.log(income) - 10))
    upi_txn = rng.poisson(upi_lambda)

    stability = {"salaried": 0.85, "self_employed": 0.62, "casual_labour": 0.45, "gig_worker": 0.56}
    latent_discipline = rng.normal(0, 1, n)  # unobserved conscientiousness
    txn_reg = np.clip(
        rng.beta(5, 2.2, n) * 0.55 + np.vectorize(stability.get)(employment) * 0.35 + 0.05 * latent_discipline,
        0.02, 1.0,
    )
    bill_pay = np.clip(rng.beta(6, 1.8, n) * 0.8 + 0.12 * latent_discipline + 0.08, 0.0, 1.0)
    recharge = np.clip(0.55 * bill_pay + 0.35 * rng.beta(4, 2, n) + 0.05 * latent_discipline, 0.0, 1.0)
    savings = np.clip(rng.beta(2, 6, n) + 0.04 * latent_discipline + 0.03 * (np.log(income) - 10), 0.0, 0.8)
    balance = np.clip(np.round(income * (0.25 + 2.2 * savings) * rng.lognormal(0, 0.45, n), -1), 100, 2_000_000)

    existing = np.clip(rng.poisson(0.9 + 0.3 * (employment == "self_employed")), 0, 8)
    dti = np.clip(rng.gamma(2.0, 0.09, n) + 0.07 * existing, 0.0, 1.6)

    loan_amount = np.clip(np.round(income * rng.uniform(0.6, 5.5, n), -3), 5000, 1_500_000)
    tenure_opts = np.array([6, 12, 18, 24, 36, 48, 60])
    loan_tenure = rng.choice(tenure_opts, size=n, p=[0.12, 0.30, 0.14, 0.20, 0.14, 0.06, 0.04])

    sparsity = np.array([compute_sparsity_flag(t, u) for t, u in zip(tenure, upi_txn)])

    # ---- default generation (features only, with non-linear effects) -------------
    emi = estimate_emi(loan_amount, loan_tenure)
    emi_ratio = emi / income
    burden = dti + emi_ratio
    logit = (
        -3.55
        - 2.6 * (txn_reg - 0.7)
        - 3.1 * (bill_pay - 0.8)
        - 1.0 * (recharge - 0.7)
        + 2.4 * np.maximum(burden - 0.45, 0) ** 1.2 * 2.2   # threshold effect on repayment burden
        + 0.9 * burden
        - 2.0 * (savings - 0.2)
        - 0.35 * np.log1p(balance / income)
        + 0.85 * sparsity
        - 0.012 * np.minimum(tenure, 48)
        + 0.18 * existing
        + 0.008 * (age - 38) ** 2 / 10                        # U-shape in age
        + 0.25 * (employment == "casual_labour")
        + 0.12 * (employment == "gig_worker")
        - 0.15 * (employment == "salaried")
        + 0.06 * dependents
        + 1.6 * (txn_reg < 0.45) * (burden > 0.55)             # interaction: irregular AND stretched
        - 0.6 * latent_discipline                               # unobserved -> irreducible noise
    )
    p_default = sigmoid(logit)
    default = rng.binomial(1, p_default)

    return pd.DataFrame({
        "applicant_id": [f"SYN{i:06d}" for i in range(n)],
        "age": age,
        "monthly_income_proxy": income,
        "transaction_regularity": txn_reg.round(4),
        "monthly_upi_txn_count": upi_txn,
        "avg_monthly_balance": balance,
        "bill_payment_consistency": bill_pay.round(4),
        "mobile_recharge_regularity": recharge.round(4),
        "digital_tenure_months": tenure,
        "savings_ratio": savings.round(4),
        "existing_loans_count": existing,
        "debt_to_income": dti.round(4),
        "loan_amount_requested": loan_amount,
        "loan_tenure_months": loan_tenure,
        "dependents": dependents,
        "data_sparsity_flag": sparsity,
        "employment_type": employment,
        "education_level": education,
        "gender": gender,
        "region": region,
        "default": default,
    })


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", type=int, default=80_000)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default=DEFAULT_OUT)
    args = ap.parse_args()

    df = generate(args.rows, args.seed)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    df.to_csv(args.out, index=False)

    print(f"Wrote {len(df):,} rows -> {os.path.abspath(args.out)}")
    print(f"Default rate: {df['default'].mean():.3f}")
    print(df.groupby("gender")["default"].mean().rename("default_rate_by_gender"))
    print(df.groupby("region")["default"].mean().rename("default_rate_by_region"))
    print(f"Sparse-footprint share: {df['data_sparsity_flag'].mean():.3f}")


if __name__ == "__main__":
    main()
