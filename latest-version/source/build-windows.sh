#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export CGO_ENABLED=0 GOOS=windows GOARCH=amd64
go build -trimpath -ldflags="-s -w" -o dist/HTML2Elementor.exe .
echo "Built dist/HTML2Elementor.exe"
