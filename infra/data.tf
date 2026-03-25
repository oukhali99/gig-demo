# Shared AWS data sources used across service files.

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}
