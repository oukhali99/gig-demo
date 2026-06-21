locals {
  # AWS resource names: {name_prefix}-{environment}-{component} (e.g. gig-demo-prod-api).
  name_env = "${var.name_prefix}-${var.environment}"

  # CORS allow-list for the HTTP API. Production allows only the deployed SPA origin.
  # In dev we additionally allow the local Vite dev server so the frontend can call
  # the real API while running on localhost. Never added in prod.
  cors_allow_origins = concat(
    [trimsuffix(trimspace(var.frontend_public_url), "/")],
    var.environment == "dev" ? ["http://localhost:5173", "http://127.0.0.1:5173"] : [],
  )
}
