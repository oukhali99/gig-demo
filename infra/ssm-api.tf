# Runtime config for the API Lambda: SSM String parameters under /{name_env}/api/*.
# Tunable values use variables (tfvars); infra IDs are wired from Terraform resources.

locals {
  images_cdn_base_url_effective = var.images_cdn_base_url != "" ? trimsuffix(trimspace(var.images_cdn_base_url), "/") : trimsuffix(trimspace(var.images_public_url), "/")
}

resource "aws_ssm_parameter" "api_runtime" {
  for_each = {
    JOBS_TABLE_NAME                               = aws_dynamodb_table.jobs.name
    BOOKINGS_TABLE_NAME                           = aws_dynamodb_table.bookings.name
    PAYMENTS_TABLE_NAME                           = aws_dynamodb_table.payments.name
    NOTIFICATIONS_TABLE_NAME                      = aws_dynamodb_table.notifications.name
    REVIEWS_TABLE_NAME                            = aws_dynamodb_table.reviews.name
    BUCKET_NAME                                   = aws_s3_bucket.job_images.bucket
    IMAGES_CDN_BASE_URL                           = local.images_cdn_base_url_effective
    USER_POOL_ID                                  = aws_cognito_user_pool.main.id
    CLIENT_ID                                     = aws_cognito_user_pool_client.main.id
    ENVIRONMENT                                   = var.environment
    TEXT_MODERATION_TOXIC_SCORE_THRESHOLD         = tostring(var.text_moderation_toxic_score_threshold)
    IMAGE_MODERATION_REKOGNITION_MIN_CONFIDENCE   = tostring(var.image_moderation_rekognition_min_confidence)
    IMAGE_MODERATION_MANUAL_REVIEW_MIN_CONFIDENCE = tostring(var.image_moderation_manual_review_min_confidence)
    IMAGE_MODERATION_AUTO_REJECT_MIN_CONFIDENCE   = tostring(var.image_moderation_auto_reject_min_confidence)
    ASSISTANT_BEDROCK_MODEL_ID                    = var.assistant_bedrock_model_id
    FRONTEND_PUBLIC_URL                           = trimsuffix(trimspace(var.frontend_public_url), "/")
    LOG_LEVEL                                     = var.log_level
  }

  name  = "/${local.name_env}/api/${each.key}"
  type  = "String"
  value = each.value
}

resource "aws_ssm_parameter" "stripe_secret_key" {
  name  = "/${local.name_env}/api/STRIPE_SECRET_KEY"
  type  = "SecureString"
  value = var.stripe_secret_key != "" ? var.stripe_secret_key : "disabled"
}

resource "aws_ssm_parameter" "stripe_webhook_secret" {
  name  = "/${local.name_env}/api/STRIPE_WEBHOOK_SECRET"
  type  = "SecureString"
  value = var.stripe_webhook_secret != "" ? var.stripe_webhook_secret : "disabled"
}

resource "aws_ssm_parameter" "platform_fee_percent" {
  name  = "/${local.name_env}/api/PLATFORM_FEE_PERCENT"
  type  = "String"
  value = tostring(var.platform_fee_percent)
}
