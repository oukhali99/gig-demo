# Amazon S3 — job/booking images (private; presigned PUT to bucket, presigned GET via CloudFront) and SPA (OAC).

resource "aws_s3_bucket" "frontend" {
  bucket = "${local.name_env}-frontend-${substr(md5(data.aws_caller_identity.current.account_id), 0, 8)}"
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket" "job_images" {
  bucket = "${local.name_env}-job-images-${substr(md5(data.aws_caller_identity.current.account_id), 0, 8)}"
}

resource "aws_s3_bucket_public_access_block" "job_images" {
  bucket = aws_s3_bucket.job_images.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "job_images" {
  bucket = aws_s3_bucket.job_images.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD", "PUT"]
    allowed_origins = [trimsuffix(trimspace(var.frontend_public_url), "/")]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_notification" "job_images_uploads" {
  bucket = aws_s3_bucket.job_images.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.image_moderation.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "jobs/"
  }

  lambda_function {
    lambda_function_arn = aws_lambda_function.image_moderation.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "bookings/"
  }

  depends_on = [aws_lambda_permission.image_moderation_s3]
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontServicePrincipal"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      }
    ]
  })

  depends_on = [aws_cloudfront_distribution.frontend]
}

resource "aws_s3_bucket_policy" "job_images" {
  bucket = aws_s3_bucket.job_images.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontApprovedImagesOnly"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.job_images.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn"                   = aws_cloudfront_distribution.job_images.arn
            "s3:ExistingObjectTag/moderation" = "approved"
          }
        }
      }
    ]
  })

  depends_on = [aws_cloudfront_distribution.job_images]
}
