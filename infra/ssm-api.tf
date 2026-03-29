# Runtime config for the API Lambda: SSM String parameters under /{name_env}/api/*.
# Tunable values use variables (tfvars); infra IDs are wired from Terraform resources.

locals {
  images_cdn_base_url_effective = var.images_cdn_base_url != "" ? trimsuffix(trimspace(var.images_cdn_base_url), "/") : trimsuffix(trimspace(var.images_public_url), "/")
}

resource "aws_ssm_parameter" "api_runtime" {
  for_each = {
    JOBS_TABLE_NAME                                = aws_dynamodb_table.jobs.name
    BOOKINGS_TABLE_NAME                            = aws_dynamodb_table.bookings.name
    PAYMENTS_TABLE_NAME                            = aws_dynamodb_table.payments.name
    NOTIFICATIONS_TABLE_NAME                       = aws_dynamodb_table.notifications.name
    REVIEWS_TABLE_NAME                             = aws_dynamodb_table.reviews.name
    BUCKET_NAME                                    = aws_s3_bucket.job_images.bucket
    IMAGES_CDN_BASE_URL                            = local.images_cdn_base_url_effective
    USER_POOL_ID                                   = aws_cognito_user_pool.main.id
    CLIENT_ID                                      = aws_cognito_user_pool_client.main.id
    ENVIRONMENT                                    = var.environment
    TEXT_MODERATION_TOXIC_SCORE_THRESHOLD          = tostring(var.text_moderation_toxic_score_threshold)
    IMAGE_MODERATION_REKOGNITION_MIN_CONFIDENCE   = tostring(var.image_moderation_rekognition_min_confidence)
    IMAGE_MODERATION_MANUAL_REVIEW_MIN_CONFIDENCE = tostring(var.image_moderation_manual_review_min_confidence)
    IMAGE_MODERATION_AUTO_REJECT_MIN_CONFIDENCE   = tostring(var.image_moderation_auto_reject_min_confidence)
    ASSISTANT_BEDROCK_MODEL_ID                     = var.assistant_bedrock_model_id
  }

  name  = "/${local.name_env}/api/${each.key}"
  type  = "String"
  value = each.value
}

# Operator-only: compare to X-Image-Moderation-Admin-Key on approve/reject routes.
# Omit resource when var is empty: SSM does not allow zero-length values; API treats missing param as disabled (403).
resource "aws_ssm_parameter" "image_moderation_admin_api_key" {
  count = trimspace(var.image_moderation_admin_api_key) != "" ? 1 : 0

  name  = "/${local.name_env}/api/IMAGE_MODERATION_ADMIN_API_KEY"
  type  = "String"
  value = trimspace(var.image_moderation_admin_api_key)

  lifecycle {
    precondition {
      condition     = var.image_moderation_manual_review_min_confidence < var.image_moderation_auto_reject_min_confidence
      error_message = "image_moderation_manual_review_min_confidence must be less than image_moderation_auto_reject_min_confidence."
    }
    precondition {
      condition     = var.image_moderation_rekognition_min_confidence <= var.image_moderation_manual_review_min_confidence
      error_message = "image_moderation_rekognition_min_confidence must be <= image_moderation_manual_review_min_confidence so borderline labels are visible to Rekognition."
    }
  }
}
