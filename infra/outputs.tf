output "api_url" {
  description = "Direct API Gateway invoke URL (debugging)"
  value       = aws_apigatewayv2_stage.api.invoke_url
}

output "frontend_cloudfront_url" {
  description = "HTTPS URL of the SPA (custom domain from frontend_public_url)"
  value       = "https://${local.frontend_host}"
}

output "api_cloudfront_url" {
  description = "HTTPS URL of the API (custom domain from api_public_url)"
  value       = "https://${local.api_host}"
}

output "vite_api_url" {
  description = "Set VITE_API_URL for production builds (matches api_cloudfront_url)"
  value       = "https://${local.api_host}"
}

output "frontend_bucket_name" {
  description = "S3 bucket for static frontend assets"
  value       = aws_s3_bucket.frontend.id
}

output "frontend_cloudfront_distribution_id" {
  description = "SPA distribution ID (S3 publish invalidations)"
  value       = aws_cloudfront_distribution.frontend.id
}

output "api_cloudfront_distribution_id" {
  description = "API distribution ID (optional invalidations)"
  value       = aws_cloudfront_distribution.api.id
}

output "cognito_user_pool_id" {
  description = "Cognito user pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  description = "Cognito app client ID"
  value       = aws_cognito_user_pool_client.main.id
}

output "resource_group_name" {
  description = "AWS Resource Group name (Console: Resource Groups > Saved groups) — lists stack resources by StackId tag"
  value       = aws_resourcegroups_group.stack.name
}

output "stack_id_tag" {
  description = "Value of the StackId tag on all taggable resources in this stack"
  value       = "${var.name_prefix}-${var.environment}"
}

output "terraform_state_bucket" {
  description = "S3 bucket for Terraform state (same as var.terraform_state_bucket; echoed for backend.hcl / docs)"
  value       = var.terraform_state_bucket
}

output "terraform_state_key" {
  description = "S3 object key for this stack's state file (same as var.terraform_state_key)"
  value       = var.terraform_state_key
}

output "terraform_lock_table" {
  description = "DynamoDB table used for Terraform state locking"
  value       = aws_dynamodb_table.terraform_lock.name
}

output "codepipeline_name" {
  description = "CodePipeline name"
  value       = aws_codepipeline.main.name
}

output "codebuild_project_name" {
  description = "CodeBuild deploy project name"
  value       = aws_codebuild_project.deploy.name
}
