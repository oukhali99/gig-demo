# Amazon DynamoDB — domain tables (jobs, bookings, payments, notifications, reviews).

resource "aws_dynamodb_table" "jobs" {
  name         = "${var.name_prefix}-jobs-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "jobId"

  attribute {
    name = "jobId"
    type = "S"
  }
  attribute {
    name = "status"
    type = "S"
  }
  attribute {
    name = "createdAt"
    type = "S"
  }
  attribute {
    name = "clientId"
    type = "S"
  }

  global_secondary_index {
    name            = "status-createdAt-index"
    hash_key        = "status"
    range_key       = "createdAt"
    projection_type = "ALL"
  }
  global_secondary_index {
    name            = "clientId-createdAt-index"
    hash_key        = "clientId"
    range_key       = "createdAt"
    projection_type = "ALL"
  }
}

resource "aws_dynamodb_table" "bookings" {
  name         = "${var.name_prefix}-bookings-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "bookingId"

  attribute {
    name = "bookingId"
    type = "S"
  }
  attribute {
    name = "jobId"
    type = "S"
  }
  attribute {
    name = "workerId"
    type = "S"
  }
  attribute {
    name = "status"
    type = "S"
  }
  attribute {
    name = "createdAt"
    type = "S"
  }
  attribute {
    name = "idempotencyKey"
    type = "S"
  }

  global_secondary_index {
    name            = "jobId-createdAt-index"
    hash_key        = "jobId"
    range_key       = "createdAt"
    projection_type = "ALL"
  }
  global_secondary_index {
    name            = "workerId-createdAt-index"
    hash_key        = "workerId"
    range_key       = "createdAt"
    projection_type = "ALL"
  }
  global_secondary_index {
    name            = "status-createdAt-index"
    hash_key        = "status"
    range_key       = "createdAt"
    projection_type = "ALL"
  }
  global_secondary_index {
    name            = "idempotencyKey-index"
    hash_key        = "idempotencyKey"
    projection_type = "ALL"
  }
}

resource "aws_dynamodb_table" "payments" {
  name         = "${var.name_prefix}-payments-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "paymentId"

  attribute {
    name = "paymentId"
    type = "S"
  }
  attribute {
    name = "bookingId"
    type = "S"
  }
  attribute {
    name = "createdAt"
    type = "S"
  }
  attribute {
    name = "idempotencyKey"
    type = "S"
  }

  global_secondary_index {
    name            = "bookingId-createdAt-index"
    hash_key        = "bookingId"
    range_key       = "createdAt"
    projection_type = "ALL"
  }
  global_secondary_index {
    name            = "idempotencyKey-index"
    hash_key        = "idempotencyKey"
    projection_type = "ALL"
  }
}

resource "aws_dynamodb_table" "notifications" {
  name         = "${var.name_prefix}-notifications-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "eventId"

  attribute {
    name = "userId"
    type = "S"
  }
  attribute {
    name = "eventId"
    type = "S"
  }
}

resource "aws_dynamodb_table" "reviews" {
  name         = "${var.name_prefix}-reviews-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "bookingId"
  range_key    = "reviewerId"

  attribute {
    name = "bookingId"
    type = "S"
  }
  attribute {
    name = "reviewerId"
    type = "S"
  }
  attribute {
    name = "revieweeId"
    type = "S"
  }
  attribute {
    name = "createdAt"
    type = "S"
  }

  global_secondary_index {
    name            = "revieweeId-createdAt-index"
    hash_key        = "revieweeId"
    range_key       = "createdAt"
    projection_type = "ALL"
  }
}
