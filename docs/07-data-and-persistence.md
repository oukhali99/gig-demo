# Data and persistence

## Overview

| Store | Resource (Terraform) | Purpose |
|-------|----------------------|---------|
| DynamoDB | `aws_dynamodb_table.jobs` | Jobs |
| DynamoDB | `aws_dynamodb_table.bookings` | Bookings + idempotency GSI |
| DynamoDB | `aws_dynamodb_table.payments` | Payments + idempotency GSI |
| DynamoDB | `aws_dynamodb_table.notifications` | Inbox rows `(userId, eventId)` |
| DynamoDB | `aws_dynamodb_table.reviews` | Reviews; GSI by `revieweeId` |
| S3 | `aws_s3_bucket.job_images` | Private objects; keys under `jobs/...` and `bookings/...` |
| Cognito | User pool + app client | Users; JWT for API Gateway |

No shared database across “logical” services: **one table per domain**, all accessed from the same Lambda with IAM policies in `infra/iam.tf`.

---

## Identifiers

- **Public ids** in API and DynamoDB items: **UUIDs** (`jobId`, `bookingId`, `paymentId`, `reviewId`, Cognito `sub` as user id).
- Avoid exposing sequential numeric ids as primary keys for these entities.

---

## DynamoDB access patterns (summary)

| Entity | Primary key | GSIs (names in Terraform) |
|--------|-------------|----------------------------|
| Job | `jobId` | `status-createdAt-index`, `clientId-createdAt-index` |
| Booking | `bookingId` | `jobId-createdAt-index`, `workerId-createdAt-index`, `status-createdAt-index`, `idempotencyKey-index` |
| Payment | `paymentId` | `bookingId-createdAt-index`, `idempotencyKey-index` |
| Notification | `userId` + `eventId` | — (query by partition `userId`) |
| Review | `bookingId` + `reviewerId` | `revieweeId-createdAt-index` |

---

## S3

- Bucket is **private**; access via **presigned URLs** generated in Lambda (`shared/images.ts`).
- Job images: prefix `jobs/{jobId}/...`
- Booking images: prefix `bookings/{bookingId}/...`

---

## Field types

| Field | Type | Notes |
|-------|------|-------|
| `job.budget` | Integer (cents) | e.g. `5000` = $50.00. Frontend converts dollar input to cents on submit. |
| `payment.amount` | Integer (cents) | Matches the job budget at booking confirmation time. |
| `payment.stripePaymentIntentId` | String (optional) | Set when a Stripe PaymentIntent was created for this payment; used to capture or cancel the hold. |
| `payment.transferId` | String (optional) | Set when a Stripe Transfer to the worker's Express account succeeds. |
| `payment.status` | Enum | `hold_created` → `released` → `transferred` \| `transfer_failed` \| `refunded` |
| `cognito:custom:stripeAccountId` | String (optional) | Worker's Stripe Express account id. Stored as a Cognito custom attribute; included in the ID token JWT via `read_attributes`. |

---

## Sensitive data

- Passwords: handled by **Cognito** only; not stored in app tables.
- Tokens: returned to clients on login/refresh; not logged by design (avoid logging `Authorization` in application code).
- Stripe keys: stored as **SecureString** in SSM Parameter Store:
  - `/{env}/api/STRIPE_SECRET_KEY` — platform secret key
  - `/{env}/api/STRIPE_WEBHOOK_SECRET` — single webhook signing secret (covers both platform and Connect events — one endpoint registered with "Connected accounts" enabled)
  - Both are managed by Terraform from tfvars (gitignored). To rotate, update the value in tfvars and re-apply.
- `PLATFORM_FEE_PERCENT` stored as plain String in SSM (`/{env}/api/PLATFORM_FEE_PERCENT`). Default `10`.
- Worker `stripeAccountId` stored in Cognito `custom:stripeAccountId` — not DynamoDB. Included in JWT for zero-latency booking gate checks.
