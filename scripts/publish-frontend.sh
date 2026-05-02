#!/usr/bin/env bash
# Build the Vite SPA with VITE_API_URL from Terraform, sync to S3, invalidate CloudFront.
# Run from repo root after terraform apply (requires aws CLI, same credentials as Terraform).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/infra"
VITE_API_URL="$(terraform output -no-color -raw vite_api_url | head -n 1)"
BUCKET="$(terraform output -no-color -raw frontend_bucket_name | head -n 1)"
DIST_ID="$(terraform output -no-color -raw frontend_cloudfront_distribution_id | head -n 1)"
cd "$ROOT"
export VITE_API_URL
yarn workspace frontend build
aws s3 sync app/frontend/dist "s3://${BUCKET}/" --delete
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" >/dev/null
echo "Published frontend to s3://${BUCKET} and invalidated CloudFront ${DIST_ID}"
