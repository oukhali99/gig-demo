# DynamoDB table for Terraform state locking. State itself lives in the existing
# S3 bucket named var.terraform_state_bucket.

locals {
  terraform_state_key = "${var.name_prefix}/${var.environment}/terraform.tfstate"
}

resource "aws_dynamodb_table" "terraform_lock" {
  name         = "${var.name_prefix}-tf-lock-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}
