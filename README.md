# Saral Credit: XGBoost Credit Scoring + SHAP + Fairness Audit on MERN

An explainable, fairness-audited credit-scoring platform for thin-file borrowers.
A Python ML microservice (FastAPI + XGBoost + SHAP + Fairlearn) is orchestrated by a
Node/Express API with MongoDB, and used through a React front end.

```
React (client/)  ──REST──▶  Express (server/)  ──REST──▶  FastAPI ML service (ml-service/)
                               │                          XGBoost + SHAP + Fairlearn
                               ▼
                          MongoDB (applicants, decisions, audit logs, fairness audits)
```

| Folder        | What it is                                                                 |
|---------------|-----------------------------------------------------------------------------|
| `ml-service/` | Model: data generation, training, comparison, SHAP, fairness, FastAPI app   |
| `server/`     | Backend: Express API, JWT auth and roles, MongoDB models, audit trail        |
| `client/`     | Frontend: React (Vite), JSX + CSS Modules + `variables.css` design tokens    |
| `docs/`       | `SETUP_GUIDE.md` and `MODULE_DOCUMENTATION.md`                               |

## Results on the included 80,000-row synthetic dataset (held-out 16,000 rows)

| Model                  | AUC-ROC | F1    | Brier  |
|------------------------|---------|-------|--------|
| LightGBM               | 0.8648  | 0.6051| 0.1030 |
| **XGBoost (tuned, production)** | **0.8647** | **0.6045** | **0.1029** |
| Hist Gradient Boosting | 0.8638  | 0.6001| 0.1034 |
| Logistic Regression    | 0.8613  | 0.5998| 0.1037 |
| Random Forest          | 0.8599  | 0.5982| 0.1054 |
| Neural Network (MLP)   | 0.8580  | 0.5964| 0.1054 |
| K-Nearest Neighbours   | 0.8474  | 0.5827| 0.1145 |
| Naive Bayes            | 0.8332  | 0.5672| 0.1398 |
| Decision Tree          | 0.8181  | 0.5551| 0.1151 |

XGBoost and LightGBM are statistically tied on AUC (overlapping 95% bootstrap intervals);
XGBoost has the best Brier score and the best 5-fold CV AUC (0.8668 ± 0.004), so it is the
production model. Synthetic-data metrics are illustrative, not production performance.


Demo logins after seeding: `admin@demo.com / Admin@1234`, `officer@demo.com / Officer@1234`,
`applicant@demo.com / Applicant@1234`.
