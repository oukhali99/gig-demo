# AWS IAM — execution roles and inline policies for the API and image-moderation Lambdas.

resource "aws_iam_role" "api_lambda" {
  name = "${local.name_env}-api-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "api_lambda_dynamodb" {
  name = "dynamodb"
  role = aws_iam_role.api_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
          "dynamodb:DeleteItem",
          "dynamodb:ConditionCheckItem"
        ]
        Resource = [
          aws_dynamodb_table.jobs.arn,
          "${aws_dynamodb_table.jobs.arn}/index/*",
          aws_dynamodb_table.bookings.arn,
          "${aws_dynamodb_table.bookings.arn}/index/*",
          aws_dynamodb_table.payments.arn,
          "${aws_dynamodb_table.payments.arn}/index/*",
          aws_dynamodb_table.notifications.arn,
          aws_dynamodb_table.reviews.arn,
          "${aws_dynamodb_table.reviews.arn}/index/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "api_lambda_s3" {
  name = "s3-images"
  role = aws_iam_role.api_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = aws_s3_bucket.job_images.arn
        Condition = {
          StringLike = {
            "s3:prefix" = ["jobs/", "bookings/", "jobs", "bookings"]
          }
        }
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:HeadObject",
          "s3:GetObjectTagging",
          "s3:PutObjectTagging"
        ]
        Resource = "${aws_s3_bucket.job_images.arn}/*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "api_lambda_rekognition" {
  name = "rekognition"
  role = aws_iam_role.api_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "rekognition:DetectModerationLabels"
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "api_lambda_comprehend" {
  name = "comprehend-toxicity"
  role = aws_iam_role.api_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "comprehend:DetectToxicContent"
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "api_lambda_cognito" {
  name = "cognito"
  role = aws_iam_role.api_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:SignUp",
          "cognito-idp:AdminConfirmSignUp",
          "cognito-idp:InitiateAuth",
          "cognito-idp:ListUsers",
          "cognito-idp:AdminUpdateUserAttributes"
        ]
        Resource = [aws_cognito_user_pool.main.arn]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "api_lambda_logs" {
  role       = aws_iam_role.api_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "api_lambda_ssm" {
  name = "ssm-api-config"
  role = aws_iam_role.api_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParametersByPath",
          "ssm:GetParameter",
          "ssm:GetParameters"
        ]
        Resource = "arn:${data.aws_partition.current.partition}:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/${local.name_env}/api/*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "api_lambda_bedrock" {
  name = "bedrock-assistant"
  role = aws_iam_role.api_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ]
        Resource = [
          "arn:${data.aws_partition.current.partition}:bedrock:${data.aws_region.current.name}::foundation-model/${var.assistant_bedrock_model_id}"
        ]
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# Image moderation Lambda — minimal role (S3, Rekognition, DynamoDB subset,
# SSM read, CloudWatch Logs only — no Cognito, Comprehend, or Bedrock).
# ---------------------------------------------------------------------------

resource "aws_iam_role" "moderation_lambda" {
  name = "${local.name_env}-moderation-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "moderation_lambda_logs" {
  role       = aws_iam_role.moderation_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "moderation_lambda_s3" {
  name = "s3-images"
  role = aws_iam_role.moderation_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:GetObjectTagging",
          "s3:PutObjectTagging"
        ]
        Resource = "${aws_s3_bucket.job_images.arn}/*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "moderation_lambda_rekognition" {
  name = "rekognition"
  role = aws_iam_role.moderation_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "rekognition:DetectModerationLabels"
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "moderation_lambda_dynamodb" {
  name = "dynamodb-image-keys"
  role = aws_iam_role.moderation_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["dynamodb:UpdateItem"]
        Resource = [
          aws_dynamodb_table.jobs.arn,
          aws_dynamodb_table.bookings.arn,
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "moderation_lambda_ssm" {
  name = "ssm-config"
  role = aws_iam_role.moderation_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParametersByPath",
          "ssm:GetParameter",
          "ssm:GetParameters"
        ]
        Resource = "arn:${data.aws_partition.current.partition}:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/${local.name_env}/api/*"
      }
    ]
  })
}
