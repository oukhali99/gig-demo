# DynamoDB table for Terraform state locking. State object path is
# var.terraform_state_bucket + var.terraform_state_key (see variables.tf).

resource "aws_dynamodb_table" "terraform_lock" {
  name         = "${var.name_prefix}-tf-lock-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}
