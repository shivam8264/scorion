"""
Single source of truth for the feature contract.

Both the training scripts (training/*.py) and the serving API (app/main.py)
import from this module, which guarantees feature parity between training
and inference (guide section 6, "Feature parity between training and serving").
"""

# Raw inputs collected from the applicant form (model features only).
NUMERIC_FEATURES = [
    "age",
    "monthly_income_proxy",
    "transaction_regularity",
    "monthly_upi_txn_count",
    "avg_monthly_balance",
    "bill_payment_consistency",
    "mobile_recharge_regularity",
    "digital_tenure_months",
    "savings_ratio",
    "existing_loans_count",
    "debt_to_income",
    "loan_amount_requested",
    "loan_tenure_months",
    "dependents",
]

BOOLEAN_FEATURES = ["data_sparsity_flag"]

CATEGORICAL_FEATURES = {
    "employment_type": ["salaried", "self_employed", "casual_labour", "gig_worker"],
    "education_level": ["none", "secondary", "graduate", "postgraduate"],
}

# Derived in preprocessing (never typed in by the user).
ENGINEERED_FEATURES = [
    "estimated_emi",
    "emi_to_income",
    "loan_to_annual_income",
    "balance_to_income",
    "log_income",
]

RAW_FEATURES = NUMERIC_FEATURES + BOOLEAN_FEATURES + list(CATEGORICAL_FEATURES)

# Protected attributes: stored ONLY for the fairness audit, never passed to the model.
PROTECTED_ATTRIBUTES = {
    "gender": ["male", "female"],
    "region": ["urban", "rural"],
}

TARGET = "default"

# Decision bands on probability of default (guide section 4, Phase 2 sketch).
DECLINE_THRESHOLD = 0.60
REFER_THRESHOLD = 0.30

# Human readable names used in explanations and the UI.
FEATURE_LABELS = {
    "age": "Age",
    "monthly_income_proxy": "Monthly income (proxy)",
    "transaction_regularity": "Transaction regularity",
    "monthly_upi_txn_count": "Monthly UPI transactions",
    "avg_monthly_balance": "Average monthly balance",
    "bill_payment_consistency": "Bill-payment consistency",
    "mobile_recharge_regularity": "Mobile recharge regularity",
    "digital_tenure_months": "Digital payment history length",
    "savings_ratio": "Savings ratio",
    "existing_loans_count": "Existing loans",
    "debt_to_income": "Debt-to-income ratio",
    "loan_amount_requested": "Loan amount requested",
    "loan_tenure_months": "Loan tenure",
    "dependents": "Dependents",
    "data_sparsity_flag": "Thin digital footprint",
    "employment_type": "Employment type",
    "education_level": "Education level",
    "estimated_emi": "Estimated monthly instalment",
    "emi_to_income": "Instalment-to-income ratio",
    "loan_to_annual_income": "Loan-to-annual-income ratio",
    "balance_to_income": "Balance-to-income ratio",
    "log_income": "Income level",
}

# Plain-language templates. Key: (feature, direction) where direction is
# "up" (pushes risk up) or "down" (pushes risk down).
REASON_TEMPLATES = {
    ("transaction_regularity", "down"): "Your monthly transaction inflows are regular, which signals stable cash flow.",
    ("transaction_regularity", "up"): "Your monthly transaction inflows are irregular, which makes repayment capacity harder to predict.",
    ("bill_payment_consistency", "down"): "You pay utility bills on time consistently.",
    ("bill_payment_consistency", "up"): "Several utility bills were paid late or missed.",
    ("mobile_recharge_regularity", "down"): "Your mobile recharges are regular.",
    ("mobile_recharge_regularity", "up"): "Your mobile recharges are irregular.",
    ("digital_tenure_months", "down"): "You have a long digital payment history.",
    ("digital_tenure_months", "up"): "Your digital payment history is short, so there is less evidence to assess.",
    ("debt_to_income", "down"): "Your existing debt is low relative to your income.",
    ("debt_to_income", "up"): "Your existing debt is high relative to your income.",
    ("emi_to_income", "down"): "The new instalment would be a small share of your income.",
    ("emi_to_income", "up"): "The new instalment would take a large share of your monthly income.",
    ("loan_to_annual_income", "down"): "The loan amount is modest compared with your annual income.",
    ("loan_to_annual_income", "up"): "The loan amount is large compared with your annual income.",
    ("savings_ratio", "down"): "You save a healthy share of your income.",
    ("savings_ratio", "up"): "You save little of your monthly income.",
    ("avg_monthly_balance", "down"): "You keep a healthy average account balance.",
    ("avg_monthly_balance", "up"): "Your average account balance is low.",
    ("balance_to_income", "down"): "Your account balance is healthy relative to your income.",
    ("balance_to_income", "up"): "Your account balance is low relative to your income.",
    ("monthly_upi_txn_count", "down"): "You use digital payments actively.",
    ("monthly_upi_txn_count", "up"): "You make few digital payments each month.",
    ("existing_loans_count", "down"): "You have few other active loans.",
    ("existing_loans_count", "up"): "You already have several active loans.",
    ("data_sparsity_flag", "up"): "Your digital footprint is thin, so the assessment has less data.",
    ("data_sparsity_flag", "down"): "You have enough digital history for a confident assessment.",
    ("monthly_income_proxy", "down"): "Your estimated income supports this loan.",
    ("monthly_income_proxy", "up"): "Your estimated income is low for this loan.",
    ("log_income", "down"): "Your estimated income level supports this loan.",
    ("log_income", "up"): "Your estimated income level is low for this loan.",
    ("estimated_emi", "down"): "The monthly instalment is small.",
    ("estimated_emi", "up"): "The monthly instalment is high.",
    ("loan_amount_requested", "down"): "The requested amount is small.",
    ("loan_amount_requested", "up"): "The requested amount is high.",
    ("loan_tenure_months", "down"): "The loan tenure suits your profile.",
    ("loan_tenure_months", "up"): "The loan tenure adds risk for this amount.",
    ("employment_type", "down"): "Your type of employment indicates steadier earnings.",
    ("employment_type", "up"): "Your type of employment usually has less predictable earnings.",
    ("education_level", "down"): "Your education level is associated with lower risk.",
    ("education_level", "up"): "Your education level is associated with higher risk in our data.",
    ("age", "down"): "Your age group has historically repaid reliably.",
    ("age", "up"): "Your age group has historically shown higher repayment risk.",
    ("dependents", "down"): "Your number of dependents keeps household costs manageable.",
    ("dependents", "up"): "A larger number of dependents raises household expenses.",
}


def reason_for(feature: str, contribution: float) -> str:
    direction = "up" if contribution > 0 else "down"
    text = REASON_TEMPLATES.get((feature, direction))
    if text:
        return text
    label = FEATURE_LABELS.get(feature, feature)
    return f"{label} {'increased' if direction == 'up' else 'decreased'} your risk score."
