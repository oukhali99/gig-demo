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
      SSM_PARAMETER_PATH = "/${local.name_env}/api"
      # Changes when any SSM runtime param changes so Lambda config updates on apply.
      API_RUNTIME_SIGNATURE = sha256(join(",", [for k in sort(keys(aws_ssm_parameter.api_runtime)) : "${k}=${aws_ssm_parameter.api_runtime[k].value}"]))
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

resource "aws_lambda_function" "image_moderation" {
  function_name    = "${local.name_env}-image-moderation"
  role             = aws_iam_role.moderation_lambda.arn
  handler          = "image-moderation-handler.handler"
  runtime          = "nodejs20.x"
  timeout          = 60
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256

  environment {
    variables = {
      BUCKET_NAME                 = aws_s3_bucket.job_images.bucket
      SSM_PARAMETER_PATH          = "/${local.name_env}/api"
      IMAGE_MOD_RUNTIME_SIGNATURE = sha256(join(",", [for k in sort(keys(aws_ssm_parameter.api_runtime)) : "${k}=${aws_ssm_parameter.api_runtime[k].value}"]))
    }
  }
}

resource "aws_lambda_permission" "image_moderation_s3" {
  statement_id  = "AllowS3InvokeImageModeration"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.image_moderation.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.job_images.arn
}
