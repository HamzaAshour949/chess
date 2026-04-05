#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

cd "$ROOT"
source venv/bin/activate
python3 run.py
