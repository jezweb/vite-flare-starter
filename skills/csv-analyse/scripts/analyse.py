"""
csv-analyse — profile a CSV read from stdin.

Output: a single JSON object to stdout with keys:
  shape              — [rows, cols]
  columns            — list of column names in order
  dtypes             — {column: inferred dtype}
  missing            — {column: missing_count}
  missing_percent    — {column: percent_missing}
  numeric_summary    — {column: {count, mean, std, min, 25%, 50%, 75%, max}}
  categorical_summary — {column: {unique_count, top_values: [[value, count], ...]}}
  head               — first 5 rows as list of dicts

Reads from sys.stdin (populated by run_skill_script). Exits non-zero on unparseable input.
"""
from __future__ import annotations

import io
import json
import sys

import pandas as pd


def main() -> int:
    raw = sys.stdin.read()
    if not raw.strip():
        print(json.dumps({"error": "no input on stdin"}))
        return 1

    try:
        df = pd.read_csv(io.StringIO(raw))
    except Exception as exc:
        print(json.dumps({"error": f"pandas failed to parse CSV: {exc}"}))
        return 1

    numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
    categorical_cols = [c for c in df.columns if c not in numeric_cols]

    missing = df.isna().sum().astype(int).to_dict()
    missing_percent = {
        col: round(float(count) / max(len(df), 1) * 100, 2)
        for col, count in missing.items()
    }

    numeric_summary: dict[str, dict[str, float]] = {}
    if numeric_cols:
        desc = df[numeric_cols].describe()
        for col in numeric_cols:
            numeric_summary[col] = {
                k: (None if pd.isna(v) else round(float(v), 6))
                for k, v in desc[col].to_dict().items()
            }

    categorical_summary: dict[str, dict] = {}
    for col in categorical_cols:
        vc = df[col].value_counts(dropna=True).head(10)
        categorical_summary[col] = {
            "unique_count": int(df[col].nunique(dropna=True)),
            "top_values": [[str(v), int(c)] for v, c in vc.items()],
        }

    head = json.loads(df.head(5).to_json(orient="records"))

    result = {
        "shape": list(df.shape),
        "columns": df.columns.tolist(),
        "dtypes": {c: str(t) for c, t in df.dtypes.to_dict().items()},
        "missing": missing,
        "missing_percent": missing_percent,
        "numeric_summary": numeric_summary,
        "categorical_summary": categorical_summary,
        "head": head,
    }
    print(json.dumps(result, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
