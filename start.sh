#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

cd "$ROOT"
python3 -m venv venv
source venv/bin/activate
python3 run.py
