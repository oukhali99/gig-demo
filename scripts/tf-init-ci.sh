#!/usr/bin/env bash
# Terraform init for CI: backend config from env (no committed .hcl files).
# Required: TF_STATE_BUCKET, TF_STATE_KEY, TF_LOCK_TABLE
# Region: TF_BACKEND_REGION, or AWS_DEFAULT_REGION, or AWS_REGION
set -euo pipefail
: "${TF_STATE_BUCKET:?TF_STATE_BUCKET is required for CI init}"
: "${TF_STATE_KEY:?TF_STATE_KEY is required for CI init}"
: "${TF_LOCK_TABLE:?TF_LOCK_TABLE is required for CI init}"

REGION="${TF_BACKEND_REGION:-${AWS_DEFAULT_REGION:-${AWS_REGION:-}}}"
if [[ -z "$REGION" ]]; then
  echo "Set TF_BACKEND_REGION or AWS_DEFAULT_REGION (CodeBuild usually sets the latter)." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/infra"

terraform init -input=false -reconfigure \
  -backend-config="bucket=${TF_STATE_BUCKET}" \
  -backend-config="key=${TF_STATE_KEY}" \
  -backend-config="region=${REGION}" \
  -backend-config="dynamodb_table=${TF_LOCK_TABLE}" \
  -backend-config="encrypt=true"
