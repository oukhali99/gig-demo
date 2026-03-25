# Amazon S3 — job/booking images (private; presigned PUT to bucket, presigned GET via CloudFront) and SPA (OAC).

resource "aws_s3_bucket" "frontend" {
  bucket = "${var.name_prefix}-frontend-${var.environment}-${substr(md5(data.aws_caller_identity.current.account_id), 0, 8)}"
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket" "job_images" {
  bucket = "${var.name_prefix}-job-images-${var.environment}-${substr(md5(data.aws_caller_identity.current.account_id), 0, 8)}"
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
