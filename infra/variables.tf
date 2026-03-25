variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
  default     = "gig-demo"
}

variable "terraform_state_bucket" {
  description = "Existing S3 bucket name for Terraform state (create it yourself; versioning recommended). Same value must be used in backend.hcl for init."
  type        = string
  validation {
    condition     = trimspace(var.terraform_state_bucket) != ""
    error_message = "terraform_state_bucket must be non-empty."
  }
}

variable "terraform_state_key" {
  description = "S3 object key for this stack's state file (e.g. gig-demo/prod/terraform.tfstate). Must match backend.hcl key= and stay stable across applies."
  type        = string
  validation {
    condition     = trimspace(var.terraform_state_key) != ""
    error_message = "terraform_state_key must be non-empty."
  }
}

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment: prod (default) or dev."
  type        = string
  default     = "prod"
  validation {
    condition     = contains(["prod", "dev"], var.environment)
    error_message = "environment must be \"prod\" or \"dev\"."
  }
}

variable "frontend_public_url" {
  description = "SPA public URL (e.g. https://app.example.com). Hostname becomes the CloudFront alternate domain."
  type        = string
  validation {
    condition     = trimspace(var.frontend_public_url) != ""
    error_message = "frontend_public_url must be non-empty."
  }
}

variable "api_public_url" {
  description = "API public URL (e.g. https://api.example.com). Hostname becomes the CloudFront alternate domain."
  type        = string
  validation {
    condition = trimspace(var.api_public_url) != "" && trimsuffix(
      replace(replace(lower(trimspace(var.frontend_public_url)), "https://", ""), "http://", ""),
      "/",
      ) != trimsuffix(
      replace(replace(lower(trimspace(var.api_public_url)), "https://", ""), "http://", ""),
      "/",
    )
    error_message = "api_public_url must be non-empty and must not match the frontend hostname."
  }
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID for ACM DNS validation and A/AAAA aliases (e.g. Z0123456789)."
  type        = string
  validation {
    condition     = trimspace(var.route53_zone_id) != ""
    error_message = "route53_zone_id must be non-empty."
  }
}

variable "github_connection_arn" {
  description = "AWS CodeStar Connections ARN for GitHub (Developer Tools > Connections)."
  type        = string
  validation {
    condition     = trimspace(var.github_connection_arn) != ""
    error_message = "github_connection_arn must be non-empty."
  }
}

variable "github_repository_id" {
  description = "GitHub repository as owner/repo (e.g. myorg/gig-demo)."
  type        = string
  validation {
    condition     = trimspace(var.github_repository_id) != ""
    error_message = "github_repository_id must be non-empty."
  }
}

variable "github_branch" {
  description = "Git branch the pipeline deploys from."
  type        = string
  default     = "main"
}
