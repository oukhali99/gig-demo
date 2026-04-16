#!/usr/bin/env bash
# Updates app/frontend/.env with Vite env vars from Terraform outputs (run from repo root after terraform apply).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
API_URL=$(cd infra && terraform output -raw vite_api_url)
STRIPE_PK=$(cd infra && terraform output -raw vite_stripe_publishable_key)
ENV_FILE="$ROOT/app/frontend/.env"

upsert_env_var() {
  local key="$1" val="$2" file="$3"
  if grep -q "^${key}=" "$file"; then
    if [[ "$(uname -s)" == "Darwin" ]]; then
      sed -i '' "s|^${key}=.*|${key}=${val}|" "$file"
    else
      sed -i "s|^${key}=.*|${key}=${val}|" "$file"
    fi
  else
    echo "${key}=${val}" >> "$file"
  fi
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "# Frontend env vars (set by yarn deploy via Terraform outputs)" > "$ENV_FILE"
  echo "VITE_API_URL=$API_URL" >> "$ENV_FILE"
  echo "VITE_STRIPE_PUBLISHABLE_KEY=$STRIPE_PK" >> "$ENV_FILE"
else
  upsert_env_var "VITE_API_URL" "$API_URL" "$ENV_FILE"
  upsert_env_var "VITE_STRIPE_PUBLISHABLE_KEY" "$STRIPE_PK" "$ENV_FILE"
fi
echo "Updated $ENV_FILE with VITE_API_URL=$API_URL VITE_STRIPE_PUBLISHABLE_KEY=$STRIPE_PK"
