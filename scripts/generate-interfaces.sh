#!/usr/bin/env bash
# Create a minimal temp venv, install pyobs-core (without its heavy scientific
# deps — we only need the pure-Python interfaces module), run the generator,
# then clean up.
#
# Usage:
#   bash scripts/generate-interfaces.sh            # install pyobs-core from PyPI
#   bash scripts/generate-interfaces.sh ../pyobs-core  # use a local checkout
set -euo pipefail

PYOBS_CORE="${1:-pyobs-core}"   # PyPI package name or local path

VENV=$(mktemp -d)
trap 'rm -rf "$VENV"' EXIT

python3 -m venv "$VENV"
# single-source is the only runtime dep pyobs needs at import time;
# --no-deps skips scipy/astropy/numpy/… which are irrelevant here.
"$VENV/bin/pip" install --quiet --no-deps single-source "$PYOBS_CORE"

"$VENV/bin/python3" "$(dirname "$0")/generate-interfaces.py"
