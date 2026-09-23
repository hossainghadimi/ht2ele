#!/usr/bin/env bash
cd "$(dirname "$0")"
export H2E_HOST="${H2E_HOST:-0.0.0.0}"
export H2E_PORT="${H2E_PORT:-7788}"
exec python3 app.py
