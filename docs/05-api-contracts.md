# API contracts

HTTP API is exposed via **API Gateway** (HTTP API v2). This document matches the routes configured in `infra/apigateway.tf` and implemented under `app/api/src/`.

---

## Authentication

- **Protected routes**: `Authorization: Bearer <token>` (Cognito **access** or **ID** token per API Gateway JWT authorizer configuration).
- **Public routes** (no JWT on API Gateway): `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`.

---

## API list

### Identity

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/register` | Body: `email`, `password`. Returns `sub`. |
| POST | `/auth/login` | Body: `email`, `password`. Returns tokens. |
| POST | `/auth/refresh` | Body: `refreshToken`. Returns tokens. |
| GET | `/auth/me` | JWT required. Returns `sub`, `email`. |
| GET | `/users/{id}` | JWT required. Lookup by Cognito `sub`; returns `sub`, `email`. |

### Jobs

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/jobs` | Create draft job. Body: `title`, `categoryId`, `location`, `description`, `budget`, `scheduledAt`. |
| PUT | `/jobs/{id}` | Update job (owner, draft or published only). |
| GET | `/jobs/{id}` | Get job by id. |
| GET | `/jobs` | List jobs. Query: `status`, `category`, `location`, `limit`, `cursor`; `clientId=me` for current user’s jobs. |
| POST | `/jobs/{id}/publish` | Publish draft (owner). |
| POST | `/jobs/{id}/close` | Close draft or published job (owner). Body optional `reason`. |
| POST | `/jobs/{id}/images/upload-url` | Presigned PUT URL. Body optional `contentType`. |
| POST | `/jobs/{id}/images` | Attach image after upload; Rekognition moderation. Body: `imageKey`. |
| GET | `/jobs/{id}/images/urls` | Presigned GET URLs. Query: `keys=key1,key2`. Published or owner. |

### Bookings

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/bookings` | Create booking. Body: `jobId`. **Header `Idempotency-Key` required.** |
| GET | `/bookings/{id}` | Get booking. |
| GET | `/bookings` | List. Query: one of `jobId`, `workerId`, or `status` required; `limit`, `cursor`. Filtered to parties. |
| POST | `/bookings/{id}/confirm` | Owner confirms → payment auto-hold hook. |
| POST | `/bookings/{id}/start` | Worker: confirmed → in progress. |
| POST | `/bookings/{id}/complete` | Client or worker completes → payment release hook. |
| POST | `/bookings/{id}/cancel` | Client or worker cancels. Body optional `reason` → payment refund hook. |
| POST | `/bookings/{id}/images/upload-url` | Presigned PUT for booking image. |
| POST | `/bookings/{id}/images` | Attach image (participant). |
| GET | `/bookings/{id}/images/urls` | Presigned GET. Query: `keys=`. |

### Payments

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/payments/hold` | Body: `bookingId`, `amount`, optional `currency`. **Header `Idempotency-Key` required.** Caller must be booking party. |
| GET | `/payments/{id}` | Get payment (party only). |
| POST | `/payments/{id}/release` | Client releases hold. |
| POST | `/payments/{id}/refund` | Refund from `hold_created` or `released`. Body optional `reason`. |

### Notifications

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/notifications` | Query: `limit`. Current user’s inbox rows (newest first in response). |

### Reviews

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/reviews` | Body: `bookingId`, `rating` (1–5), `text`. Booking must be `completed`; reviewer must be party. |
| GET | `/reviews` | Query: **`revieweeId` required**; optional `limit`, `cursor`. |

---

## Idempotency

| Operation | Header |
|-----------|--------|
| `POST /bookings` | `Idempotency-Key` required |
| `POST /payments/hold` | `Idempotency-Key` required |

Same key returns the same stored resource when applicable (bookings by GSI on idempotency key; payments likewise).

---

## Common response shapes

- **Success**: `200` / `201` with JSON body; lists often `{ "items": [...], "nextCursor"?: string }`.
- **Validation**: `400` with `{ "errors": [{ "field", "message" }] }`.
- **Not found**: `404` with `{ "code": "NOT_FOUND", "message": "..." }`.
- **Forbidden**: `403` with `{ "code": "FORBIDDEN", "message": "..." }`.
- **Unauthorized**: `401` with `{ "code": "UNAUTHORIZED", "message": "..." }`.
- **Conflict**: `409` with `{ "code": "CONFLICT", "message": "..." }`.
- **Moderation**: `400` with `{ "code": "MODERATION_REJECTED", "message": "..." }`.
- **Server error**: `500` with `{ "code": "INTERNAL_ERROR", "message": "..." }`.

---

## CORS

Configured on the HTTP API for `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS` with `Authorization`, `Content-Type`, `X-Correlation-Id`, `Idempotency-Key`.
