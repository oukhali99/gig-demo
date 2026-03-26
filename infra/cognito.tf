# Amazon Cognito — user pool and app client (JWT for API Gateway).
#
# Usernames are emails (username_attributes). Cognito does not filter profanity in
# emails or standard attributes; password policy below is the only built-in content
# rules. For stricter checks, add a pre sign-up Lambda trigger on the user pool.

resource "aws_cognito_user_pool" "main" {
  name = "${local.name_env}-users"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }
  schema {
    name                = "custom:role"
    attribute_data_type = "String"
    required            = false
    mutable             = true
    string_attribute_constraints {
      min_length = 1
      max_length = 32
    }
  }

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }
}

resource "aws_cognito_user_pool_client" "main" {
  name         = "${local.name_env}-app"
  user_pool_id = aws_cognito_user_pool.main.id

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]
  generate_secret  = false
  read_attributes  = ["email"]
  write_attributes = ["email"]
}
