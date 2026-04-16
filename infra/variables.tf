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

variable "terraform_lock_table" {
  description = "Existing DynamoDB table name for S3 state locking (hash key LockID, string). Create with scripts/bootstrap-terraform-state.sh; must match backend dynamodb_table=."
  type        = string
  validation {
    condition     = trimspace(var.terraform_lock_table) != ""
    error_message = "terraform_lock_table must be non-empty."
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

variable "images_public_url" {
  description = "HTTPS URL for job/booking images via CloudFront (e.g. https://images.example.com). Presigned GET URLs are rewritten to this host; uploads still use presigned S3 PUT."
  type        = string
  validation {
    condition = trimspace(var.images_public_url) != "" && trimsuffix(
      replace(replace(lower(trimspace(var.frontend_public_url)), "https://", ""), "http://", ""),
      "/",
      ) != trimsuffix(
      replace(replace(lower(trimspace(var.images_public_url)), "https://", ""), "http://", ""),
      "/",
      ) && trimsuffix(
      replace(replace(lower(trimspace(var.api_public_url)), "https://", ""), "http://", ""),
      "/",
      ) != trimsuffix(
      replace(replace(lower(trimspace(var.images_public_url)), "https://", ""), "http://", ""),
      "/",
    )
    error_message = "images_public_url must be non-empty and must not match the frontend or API hostname."
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

variable "images_cdn_base_url" {
  description = "Image CDN base URL without trailing slash, stored in SSM as IMAGES_CDN_BASE_URL. Empty uses images_public_url (trimmed)."
  type        = string
  default     = ""
}

variable "text_moderation_toxic_score_threshold" {
  description = "Comprehend toxicity score 0–1; stored in SSM for Lambda (TEXT_MODERATION_TOXIC_SCORE_THRESHOLD)."
  type        = number
  default     = 0.65

  validation {
    condition     = var.text_moderation_toxic_score_threshold >= 0 && var.text_moderation_toxic_score_threshold <= 1
    error_message = "text_moderation_toxic_score_threshold must be between 0 and 1 inclusive."
  }
}

variable "image_moderation_rekognition_min_confidence" {
  description = "Rekognition DetectModerationLabels MinConfidence (1–99). Stored in SSM (IMAGE_MODERATION_REKOGNITION_MIN_CONFIDENCE)."
  type        = number
  default     = 40

  validation {
    condition     = var.image_moderation_rekognition_min_confidence >= 1 && var.image_moderation_rekognition_min_confidence <= 99
    error_message = "image_moderation_rekognition_min_confidence must be between 1 and 99."
  }
}

variable "image_moderation_manual_review_min_confidence" {
  description = "Max label confidence in this band (inclusive) queues manual review; below auto-reject. SSM: IMAGE_MODERATION_MANUAL_REVIEW_MIN_CONFIDENCE."
  type        = number
  default     = 55

  validation {
    condition     = var.image_moderation_manual_review_min_confidence >= 0 && var.image_moderation_manual_review_min_confidence <= 100
    error_message = "image_moderation_manual_review_min_confidence must be between 0 and 100."
  }
}

variable "image_moderation_auto_reject_min_confidence" {
  description = "Max label confidence at or above this auto-deletes the object. SSM: IMAGE_MODERATION_AUTO_REJECT_MIN_CONFIDENCE."
  type        = number
  default     = 75

  validation {
    condition     = var.image_moderation_auto_reject_min_confidence >= 1 && var.image_moderation_auto_reject_min_confidence <= 100
    error_message = "image_moderation_auto_reject_min_confidence must be between 1 and 100."
  }
}

variable "assistant_bedrock_model_id" {
  description = "Bedrock foundation model ID for POST /assistant/chat (SSM: ASSISTANT_BEDROCK_MODEL_ID). Must be enabled in the account/region."
  type        = string
  default     = "anthropic.claude-3-haiku-20240307-v1:0"
}

variable "stripe_secret_key" {
  description = "Stripe secret key (sk_test_... or sk_live_...). Stored as SecureString in SSM (STRIPE_SECRET_KEY). Leave empty to disable Stripe."
  type        = string
  sensitive   = true
  default     = ""
}

variable "stripe_webhook_secret" {
  description = "Stripe webhook signing secret (whsec_...). Stored as SecureString in SSM (STRIPE_WEBHOOK_SECRET). Required for webhook signature verification."
  type        = string
  sensitive   = true
  default     = ""
}

variable "stripe_publishable_key" {
  description = "Stripe publishable key (pk_test_... or pk_live_...). Injected into the frontend build as VITE_STRIPE_PUBLISHABLE_KEY. Leave empty to disable Stripe card input."
  type        = string
  default     = ""
}

variable "platform_fee_percent" {
  description = "Percentage of each job's budget retained as a platform fee before transferring to the worker (0–100). Stored in SSM (PLATFORM_FEE_PERCENT). Default: 10."
  type        = number
  default     = 10
  validation {
    condition     = var.platform_fee_percent >= 0 && var.platform_fee_percent <= 100
    error_message = "platform_fee_percent must be between 0 and 100."
  }
}

variable "log_level" {
  description = "Minimum log level for the API Lambda. Stored in SSM (LOG_LEVEL). One of DEBUG, INFO, WARN, ERROR. Default: WARN."
  type        = string
  default     = "WARN"
  validation {
    condition     = contains(["DEBUG", "INFO", "WARN", "ERROR"], var.log_level)
    error_message = "log_level must be one of DEBUG, INFO, WARN, ERROR."
  }
}
