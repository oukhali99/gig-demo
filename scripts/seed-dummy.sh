#!/usr/bin/env bash
# Resolves DynamoDB table names from Terraform state, then runs the seed script.
# Expects terraform init for the right backend already run (see yarn seed:dummy:dev / seed:dummy:prod).
# Usage: scripts/seed-dummy.sh dev | prod
# Optional: SEED_CLIENT_SUB / SEED_WORKER_SUB for Cognito subs (see seed-dummy-data.mjs).
# Optional: SEED_TOTAL_ITEMS=500 (default 200) — split across jobs/bookings/payments.

set -euo pipefail

ENV="${1:-}"
if [[ "$ENV" != "dev" && "$ENV" != "prod" ]]; then
  echo "Usage: $0 dev|prod"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INFRA="$ROOT/infra"
BACKEND="terraform-backend.${ENV}.hcl"

if [[ ! -f "$INFRA/$BACKEND" ]]; then
  echo "Missing $INFRA/$BACKEND"
  exit 1
fi

cd "$INFRA"

TABLE_JSON=$(terraform output -json dynamodb_table_names)
REGION=$(terraform output -raw aws_region)

export AWS_REGION="$REGION"
eval "$(echo "$TABLE_JSON" | node -e "
const fs = require('fs');
const wrapped = JSON.parse(fs.readFileSync(0, 'utf8'));
const v = wrapped.value !== undefined ? wrapped.value : wrapped;
const map = {
  jobs: 'JOBS_TABLE_NAME',
  bookings: 'BOOKINGS_TABLE_NAME',
  payments: 'PAYMENTS_TABLE_NAME',
  notifications: 'NOTIFICATIONS_TABLE_NAME',
  reviews: 'REVIEWS_TABLE_NAME',
};
for (const [k, envKey] of Object.entries(map)) {
  const val = v[k];
  if (typeof val === 'string' && val.length) {
    console.log('export ' + envKey + '=' + JSON.stringify(val));
  }
}
")"

cd "$ROOT"
echo "Seeding stack: $ENV (region $AWS_REGION)"
exec yarn workspace gig-api seed:dummy
