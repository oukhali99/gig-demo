locals {
  # AWS resource names: {name_prefix}-{environment}-{component} (e.g. gig-demo-prod-api).
  name_env = "${var.name_prefix}-${var.environment}"
}
