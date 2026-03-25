#!/usr/bin/env bash
# Updates app/frontend/.env with VITE_API_URL from Terraform output (run from repo root after terraform apply).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
API_URL=$(cd infra && terraform output -raw vite_api_url)
ENV_FILE="$ROOT/app/frontend/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "# API base URL (API CloudFront URL; set by yarn deploy: vite_api_url)" > "$ENV_FILE"
  echo "VITE_API_URL=$API_URL" >> "$ENV_FILE"
else
  if grep -q '^VITE_API_URL=' "$ENV_FILE"; then
    if [[ "$(uname -s)" == "Darwin" ]]; then
      sed -i '' "s|^VITE_API_URL=.*|VITE_API_URL=$API_URL|" "$ENV_FILE"
    else
      sed -i "s|^VITE_API_URL=.*|VITE_API_URL=$API_URL|" "$ENV_FILE"
    fi
  else
    echo "VITE_API_URL=$API_URL" >> "$ENV_FILE"
  fi
fi
echo "Updated $ENV_FILE with VITE_API_URL=$API_URL"
