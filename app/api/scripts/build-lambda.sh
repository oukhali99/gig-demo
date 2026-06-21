#!/usr/bin/env bash
# Builds the Lambda deployment package for Terraform.
#
# Strategy: type-check with tsc, then bundle each entrypoint with esbuild into a
# single self-contained ESM file. The AWS SDK v3 (@aws-sdk/*) is provided by the
# nodejs22.x managed runtime, so we mark it external rather than shipping it —
# this keeps the deploy zip small, which directly reduces cold-start latency.
# Everything else (e.g. stripe) is bundled in. No node_modules is shipped.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT="$(cd "$API_ROOT/../.." && pwd)"
cd "$ROOT"

yarn install

# Type-check only (esbuild strips types but does not type-check).
yarn workspace gig-api exec tsc --noEmit

PACKAGE_DIR="$API_ROOT/build/package"
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"

# Bundle both Lambda entrypoints. Output filenames must match the Terraform
# `handler` settings: handler.handler and image-moderation-handler.handler.
node "$SCRIPT_DIR/esbuild.mjs"

# Bundled files are ESM; mark the package so the runtime loads them as modules.
printf '{\n  "type": "module"\n}\n' > "$PACKAGE_DIR/package.json"

echo "Built Lambda package at $PACKAGE_DIR"
du -sh "$PACKAGE_DIR"
