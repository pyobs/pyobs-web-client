#!/usr/bin/env bash
# Create a minimal temp venv, install the one package pyobs needs at import
# time (single-source), run the generator, then clean up.
set -euo pipefail

VENV=$(mktemp -d)
trap 'rm -rf "$VENV"' EXIT

python3 -m venv "$VENV"
"$VENV/bin/pip" install --quiet single-source

"$VENV/bin/python3" "$(dirname "$0")/generate-interfaces.py" "$@"
