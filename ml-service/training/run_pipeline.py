"""
Runs the whole Phase 1 pipeline in order:

    generate data -> train XGBoost -> evaluate -> compare models -> SHAP -> fairness

Usage:
    python training/run_pipeline.py            # full run (80k rows)
    python training/run_pipeline.py --quick    # 20k rows, fewer search iterations, no per-model CV
"""
import argparse
import subprocess
import sys
import time
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def run(script, *args):
    print(f"\n>>> {script} {' '.join(args)}", flush=True)
    t0 = time.time()
    subprocess.run([sys.executable, os.path.join(HERE, script), *args], check=True)
    print(f"<<< {script} done in {time.time() - t0:.0f}s", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--rows", type=int, default=80_000)
    ap.add_argument("--skip-data", action="store_true", help="reuse existing CSV")
    a = ap.parse_args()

    rows = 20_000 if a.quick else a.rows
    if not a.skip_data:
        run("generate_synthetic_data.py", "--rows", str(rows))
    run("train_model.py", "--n-iter", "4" if a.quick else "14")
    run("evaluate.py")
    run("compare_models.py", *(["--skip-cv"] if a.quick else []))
    run("explain.py")
    run("fairness_audit.py")
    print("\nPipeline complete. Artifacts are in ml-service/models/")


if __name__ == "__main__":
    main()
