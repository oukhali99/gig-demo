# AWS IAM — execution role and inline policies for the monolith Lambda.

resource "aws_iam_role" "api_lambda" {
  name = "${var.name_prefix}-api-lambda-role-${var.environment}"

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
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:HeadObject"
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
          "cognito-idp:ListUsers"
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
