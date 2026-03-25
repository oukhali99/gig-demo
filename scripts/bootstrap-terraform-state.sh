#!/usr/bin/env bash
# One-time (or idempotent) AWS setup for Terraform remote state: S3 bucket + DynamoDB lock table.
# Requires: AWS CLI v2, credentials with s3:CreateBucket, dynamodb:CreateTable, etc.
#
# Usage:
#   ./scripts/bootstrap-terraform-state.sh <s3-bucket-name> <aws-region> <dynamodb-lock-table-name>
#   yarn tf:bootstrap -- <s3-bucket-name> <aws-region> <dynamodb-lock-table-name>
#
# Example (match names to infra/terraform-backend.prod.hcl and terraform.prod.tfvars):
#   yarn tf:bootstrap -- my-company-terraform-state us-east-1 gig-demo-tf-lock-prod
#
# After this, set terraform_state_bucket, terraform_state_key, terraform_lock_table in tfvars
# and dynamodb_table in backend .hcl to the same names. Then terraform init / apply.
#
# If you previously let Terraform create aws_dynamodb_table.terraform_lock, migrate once:
#   cd infra && terraform state rm aws_dynamodb_table.terraform_lock
#   Add terraform_lock_table to tfvars (same name as the existing table), then apply.

set -euo pipefail

usage() {
  echo "usage: $0 <s3-bucket-name> <aws-region> <dynamodb-lock-table-name>" >&2
  exit 1
}

[[ $# -eq 3 ]] || usage

BUCKET="$1"
REGION="$2"
LOCK_TABLE="$3"

if [[ -z "$BUCKET" || -z "$REGION" || -z "$LOCK_TABLE" ]]; then
  usage
fi

echo "==> S3 bucket: $BUCKET (region $REGION)"
if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "    Bucket already exists; skipping create."
else
  if [[ "$REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
  else
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
      --create-bucket-configuration "LocationConstraint=${REGION}"
  fi
  echo "    Created bucket."
fi

aws s3api put-bucket-versioning --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket "$BUCKET" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
echo "    Versioning, encryption, and public access block applied."

echo "==> DynamoDB lock table: $LOCK_TABLE"
if aws dynamodb describe-table --table-name "$LOCK_TABLE" --region "$REGION" &>/dev/null; then
  echo "    Table already exists; skipping create."
else
  aws dynamodb create-table \
    --table-name "$LOCK_TABLE" \
    --billing-mode PAY_PER_REQUEST \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --region "$REGION" \
    --tags "Key=Purpose,Value=terraform-state-lock"
  aws dynamodb wait table-exists --table-name "$LOCK_TABLE" --region "$REGION"
  echo "    Created table (hash key LockID, PAY_PER_REQUEST)."
fi

echo
echo "Done. Use these in backend .hcl / tfvars / CI:"
echo "  bucket          = \"$BUCKET\""
echo "  region          = \"$REGION\""
echo "  dynamodb_table  = \"$LOCK_TABLE\""
