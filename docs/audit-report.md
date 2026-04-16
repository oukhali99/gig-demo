# Gig Demo — Code Audit Report

**Date**: 2026-04-02 (last updated 2026-04-03)
**Scope**: Full codebase review (`app/api`, `app/frontend`, `infra`)
**Summary**: The project is a well-structured serverless demo with real architectural thought behind it, but has several security vulnerabilities and missing safeguards that must be addressed before production use.

---

## Severity Legend

| Level | Meaning |
|---|---|
| **Critical** | Exploitable or causes data loss/privilege escalation |
| **High** | Significant risk, likely to cause real-world harm |
| **Medium** | Architectural weakness or inconsistency |
| **Low** | Minor issue, code quality, or missing best practice |

---

## Security Vulnerabilities

### ~~[CRITICAL] `canAccessPayment` defaults to allow~~ ✅ Fixed

**File**: `app/api/src/payments/http.ts:111`

~~If a payment record is missing `clientId` or `workerId` (e.g., partial write, data corruption), any authenticated user can read, hold, release, or refund that payment.~~

**Resolution**: Changed `return true` to `return false`. Access is now denied whenever either party field is absent.

---

### ~~[CRITICAL] CodeBuild IAM role has `AdministratorAccess`~~ ✅ Fixed

**File**: `infra/pipeline.tf`

~~The CodeBuild execution role is granted the AWS-managed `AdministratorAccess` policy — full control over the entire AWS account. A compromised build (supply-chain attack, malicious PR, secrets leak) results in full account compromise.~~

**Resolution**: Replaced `AdministratorAccess` with a scoped inline policy (`aws_iam_role_policy.codebuild`). The policy grants only the actions needed by `terraform apply` and the frontend publish scripts, restricted to project-prefixed resources (`${local.name_env}-*`) wherever ARNs are predictable. Services with no stable pre-creation ARN (CloudFront, ACM, Route53, Resource Groups) are scoped to the minimum required actions.

---

### ~~[HIGH] SSM parameters fetched with `WithDecryption: false`~~ ✅ Fixed

**File**: `app/api/src/config/ssm.ts:22`

~~All SSM parameters are fetched without decryption. If any parameter is ever upgraded to `SecureString` (the appropriate type for secrets), the Lambda will silently receive an encrypted ciphertext blob as the value and proceed without error.~~

**Resolution**: Set `WithDecryption: true` in the `GetParametersByPathCommand` call.

---

### ~~[HIGH] All users are auto-confirmed on registration~~ ✅ Fixed

**File**: `app/api/src/identity/cognito.ts:79`

~~`AdminConfirmSignUpCommand` is called immediately after every `SignUpCommand`, bypassing Cognito's email verification flow entirely. Any email address (real or fake) can be registered and immediately used.~~

**Resolution**: `AdminConfirmSignUpCommand` is now gated to `ENVIRONMENT === 'dev'` only. In production, Cognito's standard email verification flow applies — users receive a 6-digit code and must confirm before they can log in. Frontend updated with a verification code input on both the registration and login flows, plus a resend option. A new public `POST /auth/confirm` endpoint handles code submission and `POST /auth/resend-confirmation` handles resends.

---

### ~~[HIGH] Draft jobs visible to any authenticated user~~ ✅ Fixed

**File**: `app/api/src/jobs/http.ts` — `handleGetJob`

~~`GET /jobs/{id}` returns any job regardless of status (draft, published, closed) to any authenticated caller. A client's draft job is readable by anyone who knows or guesses the UUID.~~

**Resolution**: `handleGetJob` now checks ownership for any non-published job — unauthenticated callers get 401, non-owners get 403 (worded as "Job not found" to avoid confirming existence). `handleListJobs` now rejects `?status=draft` (or any non-`published` status) unless `clientId=me` is also set, preventing enumeration of all draft jobs across users.

---

### ~~[HIGH] Bookings accessible to any authenticated user~~ ✅ Fixed

**File**: `app/api/src/bookings/http.ts:83` — `handleGetBooking`

~~`GET /bookings/{id}` returns a booking record to any authenticated user. Only the client and worker parties should have access.~~

**Resolution**: `handleGetBooking` now verifies the caller is either `clientId` or `workerId` on the booking. Unauthenticated callers get 401; anyone else gets 403 worded as "Booking not found" to avoid confirming existence.

---

### ~~[HIGH] Bedrock IAM allows invoking any foundation model~~ ✅ Fixed

**File**: `infra/iam.tf:178`

~~The API Lambda's Bedrock policy uses `Resource: "arn:...:foundation-model/*"`, granting permission to invoke every available foundation model in the account/region — not just the one configured in SSM.~~

**Resolution**: Resource ARN now uses `var.assistant_bedrock_model_id` directly — the same variable that populates the `ASSISTANT_BEDROCK_MODEL_ID` SSM parameter — so the IAM permission and the runtime config always stay in sync.

---

### ~~[MEDIUM] Both Lambdas share the same IAM role~~ ✅ Fixed

**File**: `infra/lambda.tf:9,35`

~~The API Lambda and image moderation Lambda both use `aws_iam_role.api_lambda`. The moderation Lambda does not need Cognito, Comprehend, Bedrock, or notifications table access but inherits all of those permissions.~~

**Resolution**: Created `aws_iam_role.moderation_lambda` in `infra/iam.tf` with a minimal policy: S3 (GetObject, DeleteObject, GetObjectTagging, PutObjectTagging on the images bucket only), Rekognition (DetectModerationLabels), DynamoDB (UpdateItem on jobs and bookings tables only), SSM read, and CloudWatch Logs. No Cognito, Comprehend, Bedrock, payments, notifications, or reviews access.

---

### ~~[MEDIUM] CORS wildcard (`*`) on all responses~~ ✅ Fixed

**Files**: `infra/apigateway.tf:7`, `app/api/src/lib/api-helpers.ts:5`

~~`Access-Control-Allow-Origin: *` is set at both infrastructure and application level. Since auth uses `Authorization` headers (not cookies), this is acceptable for JWT-protected routes. However, it allows any origin to make unauthenticated requests to public endpoints (`GET /jobs`).~~

**Resolution**: API Gateway `cors_configuration.allow_origins` now uses `var.frontend_public_url` (the deployed frontend URL). `FRONTEND_PUBLIC_URL` is added to the SSM parameter set and read lazily at invocation time in `json()`, replacing the hardcoded `*`. Falls back to `*` only if the env var is absent (local dev without SSM).

---

## Architecture Issues

### ~~[HIGH] Payment system has no real money movement~~ ✅ Fixed

**File**: `app/api/src/payments/`, `app/api/src/bookings/booking-hooks.ts`

~~The entire payment system is a state machine over DynamoDB records. No Stripe integration. `DEFAULT_HOLD_AMOUNT` is `'0'` and `amount` is a free-form string.~~

**Resolution**: Integrated Stripe Payment Intents with `capture_method: manual`. At booking confirmation, the client provides a card via Stripe Elements and a PaymentIntent is created as a hold. On completion, the hold is captured (worker gets paid). On cancellation, the hold is cancelled (client refunded). `budget` on jobs and `amount` on payments are now integer cents. `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are stored as SecureString SSM parameters. A public `POST /payments/webhook` endpoint handles Stripe event delivery. When `VITE_STRIPE_PUBLISHABLE_KEY` is unset, the confirm flow works without card collection (for local dev).

---

### [MEDIUM] SSM config reloaded every Lambda invocation

**File**: `app/api/src/config/ssm.ts`

Config is fetched from SSM on every invocation with no caching. Under load this adds latency, cost, and a hard dependency on SSM availability — an SSM outage fails every API call, not just cold starts.

**Fix**: Cache the config in a module-level variable with a TTL (e.g., 5 minutes), or use the AWS Parameters and Secrets Lambda Extension.

---

### [MEDIUM] Review text bypasses content moderation

**File**: `app/api/src/reviews/http.ts`

Job titles, descriptions, and booking close reasons are moderated via Amazon Comprehend toxicity detection, but review text (up to 2000 characters) is saved directly to DynamoDB without moderation. The infrastructure to moderate it already exists.

**Fix**: Call `textMod.moderateTextFields` on review body text before saving.

---

### [MEDIUM] Admin image moderation is O(N × M) — per-object tag fetches

**File**: `app/api/src/shared/images.ts:182`

The admin moderation endpoint fetches a page of up to 40 S3 objects, then issues a separate `GetObjectTagging` call for each one to check moderation state. Under load with many pending objects, this is slow and expensive.

**Fix**: Store moderation state in DynamoDB alongside the image key, eliminating the per-object S3 tag lookup.

---

### [LOW] `budget` and `amount` are free-form strings

Job `budget` and payment `amount` fields accept arbitrary strings (`"$50"`, `"negotiable"`, `"banana"`). There is no normalization, numeric validation, or currency handling. Sorting or filtering by budget is impossible.

**Fix**: Define `budget` as a numeric field with a separate `currency` field. Validate on input.

---

### [LOW] `listJobs` post-filters client-side after DynamoDB page

**File**: `app/api/src/jobs/` — `listJobs`

Category and location filters are applied in-memory after DynamoDB returns a page. This means the actual returned page may be smaller than the requested limit, and `nextCursor` may be present even when no more matching items exist.

**Fix**: Add GSIs for category and location, or accept the limitation and document it.

---

### [LOW] Notification table has no TTL

Notifications accumulate in DynamoDB indefinitely. There is no `ttl` attribute or `ttl_specification` on the table.

**Fix**: Add a `expiresAt` TTL attribute (e.g., 90 days after creation) and enable DynamoDB TTL on the notifications table.

---

### [LOW] No DynamoDB point-in-time recovery (PITR)

None of the five DynamoDB tables have `point_in_time_recovery { enabled = true }` configured in Terraform. For a marketplace with bookings and payment records, PITR is important for disaster recovery.

**Fix**: Add `point_in_time_recovery { enabled = true }` to all tables in `infra/dynamodb.tf`.

---

## Bugs & Error Handling

### [HIGH] Refresh token not persisted after silent refresh

**File**: `app/frontend/src/AuthContext.tsx:55`

After a successful token refresh, the new refresh token is never written back to `localStorage`. Cognito may rotate refresh tokens; the stale token will eventually expire and the user will be silently logged out.

**Fix**: After a successful refresh, call `localStorage.setItem(REFRESH_KEY, newRefreshToken)`.

---

### [MEDIUM] Image deletion errors silently swallowed

**File**: `app/api/src/image-moderation-handler.ts:60`

```ts
await deleteObjectInBucket(bucket, key).catch(() => {});
```

If deletion of an auto-rejected image fails, the error is swallowed. The image remains in S3 with no moderation tag (stuck in `pending` state) and is now orphaned from any job/booking record — there is no retry path.

**Fix**: At minimum, log the error. Ideally, send failed deletions to a dead-letter queue or SNS topic for operator review.

---

### [MEDIUM] SSM errors not caught in Lambda handler

**File**: `app/api/src/config/ssm.ts` / `app/api/src/handler.ts`

`ensureLambdaConfigFromSsm()` can throw (network issue, IAM error, SSM throttle). The error is not caught in the Lambda handler, resulting in an unhandled exception and a 500 for all callers.

**Fix**: Wrap the SSM fetch in a try/catch in `handler.ts` and return a structured `503 Service Unavailable` with a log entry.

---

### [LOW] Notification sort is redundant and pagination-unsafe

**File**: `app/api/src/notifications/http.ts:43`

DynamoDB is queried with `ScanIndexForward: false` (descending order), then the result is immediately re-sorted in-memory by `createdAt`. The sort is redundant today and will produce incorrect results if cursor-based pagination is ever added.

**Fix**: Remove the in-memory sort.

---

## Code Quality

### [MEDIUM] Hand-rolled router is misleading

**Files**: Domain HTTP handlers (e.g., `app/api/src/jobs/http.ts:372`)

The `routeMap` uses `{id}` placeholder keys (e.g., `"GET /jobs/{id}"`) that never match real request paths (which contain actual UUIDs). The map serves as documentation only — actual routing is the `if/else` fallthrough below it. This will mislead future contributors.

**Fix**: Either remove `routeMap` and document routes with comments, or adopt a proper routing library.

---

### [LOW] `clientId` parsed from request body in job creation is dead code

**File**: `app/api/src/jobs/http.ts:31`

`validateCreate` parses `body.clientId`, but the job object always uses `clientId: sub` (the JWT sub). The parsed value is silently discarded.

**Fix**: Remove `clientId` from `validateCreate` body parsing.

---

### [LOW] `scheduledAt` accepts any non-empty string

No validation that `scheduledAt` is a valid ISO date or that it is in the future. A request with `scheduledAt: "banana"` will be saved successfully.

**Fix**: Parse and validate `scheduledAt` as a date on input.

---

## Missing

### [CRITICAL] No tests

`app/api/package.json` `test` script: `echo "No tests yet"`. There are zero unit, integration, or end-to-end tests. The booking/payment state machine, image moderation classification, and access control logic are complex and have no coverage.

**Priority targets for first tests**:
- `canAccessPayment` — pure function, trivial to unit test
- `classifyImageModerationFromLabels` — pure function
- Booking lifecycle state machine
- Auth token refresh flow

---

## Informational

- **Tokens stored in `localStorage`**: XSS risk, though React's default escaping and absence of `dangerouslySetInnerHTML` keeps the surface low. `httpOnly` cookies would be more secure.
- **DynamoDB tables not encrypted with customer-managed KMS key**: AWS-owned key encryption is the default and acceptable, but explicit CMK configuration is recommended for compliance.
- **CORS**: Wildcard origin is set in both API Gateway and response helpers. Intentional for a public marketplace but worth revisiting for production.
