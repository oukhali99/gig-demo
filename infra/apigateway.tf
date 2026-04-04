# Amazon API Gateway — HTTP API, JWT authorizer, Lambda proxy integration, routes.

resource "aws_apigatewayv2_api" "api" {
  name          = "${local.name_env}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization", "X-Correlation-Id", "Idempotency-Key"]
  }
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.api.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito-authorizer"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.main.id]
    issuer   = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  }
}

resource "aws_apigatewayv2_stage" "api" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

locals {
  jwt_routes = {
    "GET /jobs"                             = true
    "POST /jobs"                            = true
    "GET /jobs/{id}"                        = true
    "PUT /jobs/{id}"                        = true
    "DELETE /jobs/{id}"                     = true
    "POST /jobs/{id}/publish"               = true
    "POST /jobs/{id}/close"                 = true
    "POST /jobs/{id}/images/upload-url"     = true
    "GET /jobs/{id}/images/urls"            = true
    "POST /bookings"                        = true
    "GET /bookings"                         = true
    "GET /bookings/{id}"                    = true
    "POST /bookings/{id}/confirm"           = true
    "POST /bookings/{id}/start"             = true
    "POST /bookings/{id}/complete"          = true
    "POST /bookings/{id}/cancel"            = true
    "POST /bookings/{id}/images/upload-url" = true
    "GET /bookings/{id}/images/urls"        = true
    "POST /payments/hold"                   = true
    "GET /payments"                         = true
    "GET /payments/{id}"                    = true
    "POST /payments/{id}/release"           = true
    "POST /payments/{id}/refund"            = true
    "GET /notifications"                    = true
    "POST /reviews"                         = true
    "GET /reviews"                          = true
    "GET /auth/me"                          = true
    "GET /users/{id}"                       = true
    "PUT /users/{id}"                       = true
    "POST /assistant/chat"                  = true
    "GET /admin/moderation/pending"         = true
    "GET /admin/moderation/preview-url"     = true
    "POST /admin/moderation/approve"        = true
    "POST /admin/moderation/reject"         = true
  }
}

resource "aws_apigatewayv2_route" "routes" {
  for_each = local.jwt_routes

  api_id             = aws_apigatewayv2_api.api.id
  route_key          = each.key
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "auth_register" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /auth/register"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_route" "auth_login" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /auth/login"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_route" "auth_refresh" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /auth/refresh"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_route" "auth_confirm" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /auth/confirm"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_route" "auth_resend_confirmation" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /auth/resend-confirmation"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}
