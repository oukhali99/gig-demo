# AWS Lambda — monolith API function (build output from app/api).

data "archive_file" "api" {
  type        = "zip"
  source_dir  = "${path.module}/../app/api/build/package"
  output_path = "${path.module}/../app/api/build/package.zip"
}

resource "aws_lambda_function" "api" {
  function_name    = "${local.name_env}-api"
  role             = aws_iam_role.api_lambda.arn
  handler          = "handler.handler"
  runtime          = "nodejs20.x"
  timeout          = 30
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256

  environment {
    variables = {
      JOBS_TABLE_NAME          = aws_dynamodb_table.jobs.name
      BOOKINGS_TABLE_NAME      = aws_dynamodb_table.bookings.name
      PAYMENTS_TABLE_NAME      = aws_dynamodb_table.payments.name
      NOTIFICATIONS_TABLE_NAME = aws_dynamodb_table.notifications.name
      REVIEWS_TABLE_NAME       = aws_dynamodb_table.reviews.name
      BUCKET_NAME              = aws_s3_bucket.job_images.bucket
      IMAGES_CDN_BASE_URL      = "https://${local.images_host}"
      USER_POOL_ID             = aws_cognito_user_pool.main.id
      CLIENT_ID                = aws_cognito_user_pool_client.main.id
      ENVIRONMENT              = var.environment
    }
  }
}

resource "aws_lambda_permission" "api_apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
