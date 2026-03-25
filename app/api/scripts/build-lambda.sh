#!/usr/bin/env bash
# Builds the Lambda deployment package for Terraform.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT="$(cd "$API_ROOT/../.." && pwd)"
cd "$ROOT"
yarn install
yarn build
PACKAGE_DIR="$API_ROOT/build/package"
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"
cp -r "$API_ROOT/dist/"* "$PACKAGE_DIR/"
cp "$API_ROOT/package.json" "$PACKAGE_DIR/"
cd "$PACKAGE_DIR" && yarn install --production
echo "Built Lambda package at $PACKAGE_DIR"
