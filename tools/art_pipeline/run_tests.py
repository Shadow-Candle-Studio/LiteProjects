#!/usr/bin/env python3
"""
Run every CoinDuel art-pipeline test. One command, no network, no credentials.

    python tools/art_pipeline/run_tests.py

Covers the three things that actually break this pipeline:
  * the image logic (cutout, fill QA, shadow, frame windows)
  * the sheet formulas (VLOOKUP column indices, blank-vs-zero)
  * the n8n Code nodes (resolve/guard rails), executed against mock sheets
"""

from __future__ import annotations

import shutil
import socket
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent


def _service_up(port: int = 8787) -> bool:
    """True when serve.py is listening. The live suite is skipped when not."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.35)
        return s.connect_ex(("127.0.0.1", port)) == 0


SUITES = [
    ("image + QA pipeline", [sys.executable, str(HERE / "test_pipeline.py")], True),
    ("sheet formulas", [sys.executable, str(HERE / "test_sheet_formulas.py")], True),
    ("sheet builder (.xlsx values)", [sys.executable, str(HERE / "test_sheet_workbook.py")], True),
    ("sheet builder (Apps Script)", ["node", str(HERE / "test-build-sheet.js")],
     shutil.which("node") is not None),
    ("n8n workflow wiring", [sys.executable, str(ROOT / "tools" / "n8n" / "check-workflow.py")], True),
    ("n8n workflow logic", ["node", str(ROOT / "tools" / "n8n" / "test-workflow-logic.js")],
     shutil.which("node") is not None),
    # End-to-end against a live serve.py. Evaluates the REAL node expressions
    # from the workflow file, so wiring bugs (like the $binary.data.data one)
    # surface here instead of in a production run.
    ("n8n live chain (needs serve.py)", ["node", str(ROOT / "tools" / "n8n" / "test-live-chain.js")],
     shutil.which("node") is not None and _service_up()),
    # The browser port of the engine must agree with the Python original.
    ("web core <-> python parity", ["node", str(HERE / "test_js_parity.js")],
     shutil.which("node") is not None),
    # The inlined n8n node must produce the same verdicts as the Python service,
    # so the workflow needs no local process at all.
    ("n8n pipeline node (no Python)", ["node", str(ROOT / "tools" / "n8n" / "test_pipeline_node.js")],
     shutil.which("node") is not None),
    # Every Chinese label in the shipped scenes must have a runtime translation,
    # or English players see Chinese (this caught 剩餘 / 跳过教程 leaking).
    ("scene i18n coverage", ["node", str(HERE / "test_i18n_coverage.js")],
     shutil.which("node") is not None),
    # The published page must actually work: drives real Chrome over CDP.
    ("web checker UI (headless)", ["node", str(HERE / "test_web_ui.js")],
     shutil.which("node") is not None),
]


def main() -> int:
    failures = []
    for name, cmd, available in SUITES:
        print("=" * 68)
        print(f"  {name}")
        print("=" * 68)
        if not available:
            print("  SKIP  (node missing, or serve.py is not listening on 8787)\n")
            continue
        proc = subprocess.run(cmd, cwd=str(ROOT))
        if proc.returncode != 0:
            failures.append(name)
        print()

    print("=" * 68)
    if failures:
        print("  FAILED:", ", ".join(failures))
        return 1
    print("  All suites passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
