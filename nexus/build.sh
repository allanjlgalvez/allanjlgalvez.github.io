#!/usr/bin/env bash
# Compila NEXUS para Windows (y opcionalmente Linux/Mac) y arma el ZIP portable.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist/NEXUS
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o dist/NEXUS/nexus.exe .
cp LEEME.md actualizar.bat dist/NEXUS/
(cd dist && zip -qr NEXUS-windows.zip NEXUS)
echo "Listo: dist/NEXUS-windows.zip"
