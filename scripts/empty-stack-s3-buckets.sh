#!/usr/bin/env bash
# Empty the three Terraform-managed S3 buckets (frontend SPA, job images, pipeline artifacts).
# Uses terraform output for names; requires terraform init, AWS credentials, aws CLI, and jq.
#
# Usage: ./scripts/empty-stack-s3-buckets.sh prod|dev
set -euo pipefail

usage() {
  echo "usage: $0 prod|dev" >&2
  exit 1
}

[[ "${1:-}" == "prod" || "${1:-}" == "dev" ]] || usage

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI is required." >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required (e.g. apt install jq / brew install jq)." >&2
  exit 1
fi

ENV="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INFRA="$ROOT/infra"
BACKEND="terraform-backend.${ENV}.hcl"

if [[ ! -f "$INFRA/$BACKEND" ]]; then
  echo "Missing $INFRA/$BACKEND (copy from *.example if needed)." >&2
  exit 1
fi

cd "$INFRA"
terraform init -input=false -reconfigure -backend-config="$BACKEND"

read_frontend=$(terraform output -raw frontend_bucket_name 2>/dev/null) || true
read_job=$(terraform output -raw job_images_bucket_name 2>/dev/null) || true
read_pipeline=$(terraform output -raw pipeline_artifacts_bucket_name 2>/dev/null) || true

if [[ -z "$read_frontend" || -z "$read_job" || -z "$read_pipeline" ]]; then
  echo "Could not read bucket names from terraform output. Is state initialized and applied?" >&2
  exit 1
fi

echo ""
echo "The following S3 buckets will be emptied (all objects, versions, and delete markers):"
echo "  - ${read_frontend}"
echo "  - ${read_job}"
echo "  - ${read_pipeline}"
echo ""
echo "Buckets are NOT deleted, only cleared. Terraform can remove empty buckets on destroy."
echo ""
read -r -p "Type yes to continue: " confirm
if [[ "$confirm" != "yes" ]]; then
  echo "Aborted."
  exit 1
fi

purge_bucket() {
  local bucket=$1
  echo ""
  echo "Emptying s3://${bucket} ..."
  while true; do
    local combined
    combined=$(aws s3api list-object-versions --bucket "$bucket" --max-keys 1000 --output json)
    local objs
    objs=$(echo "$combined" | jq -c '(.Versions // []) + (.DeleteMarkers // []) | map({Key: .Key, VersionId: .VersionId})')
    local n
    n=$(echo "$objs" | jq 'length')
    if [[ "$n" -eq 0 ]]; then
      break
    fi
    local del_json
    del_json=$(echo "$objs" | jq -c '{Objects: .}')
    aws s3api delete-objects --bucket "$bucket" --delete "$del_json" --output text >/dev/null
  done
  aws s3 rm "s3://${bucket}/" --recursive --only-show-errors 2>/dev/null || true
  echo "Done: s3://${bucket}"
}

purge_bucket "$read_frontend"
purge_bucket "$read_job"
purge_bucket "$read_pipeline"

echo ""
echo "All three buckets are empty."
