# API contracts

HTTP API is exposed via **API Gateway** (HTTP API v2). This document matches the routes configured in `infra/apigateway.tf` and implemented under `app/api/src/`.

---

## Authentication

- **Protected routes**: `Authorization: Bearer <token>` (Cognito **access** or **ID** token per API Gateway JWT authorizer configuration).
- **Public routes** (no JWT on API Gateway): `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`.
- **Platform admin**: Cognito custom attribute **`custom:role`** (string). When trimmed it equals **`admin`**, the user may call **image moderation** routes under `/admin/moderation/*` (JWT required). The user pool app client must include `custom:role` in **read attributes** so the claim appears on the **ID token** (required for the JWT authorizer and `GET /auth/me`). Admins are created like any other user; set `custom:role` to `admin` in the Cognito console or via `AdminUpdateUserAttributes`. There is no self-signup path to admin. After changing attributes or client settings, users need a **new sign-in** (or token refresh that reissues the ID token) for the claim to appear.

---

## API list

### Identity

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/register` | Body: `email`, `password`. Returns `sub`. |
| POST | `/auth/login` | Body: `email`, `password`. Returns tokens. |
| POST | `/auth/refresh` | Body: `refreshToken`. Returns tokens. |
| GET | `/auth/me` | JWT required. Returns `sub`, `email`, and optional `role` (string from claim `custom:role`, e.g. `admin`) when present. |
| GET | `/users/{id}` | JWT required. Lookup by Cognito `sub`; returns `sub`, `email`. |

### Jobs

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/jobs` | Create draft job. Body: `title`, `categoryId`, `location`, `description`, `budget`, `scheduledAt`. |
| PUT | `/jobs/{id}` | Update job (owner, draft or published only). |
| DELETE | `/jobs/{id}` | Permanently delete a **draft** job (owner only). `409` if not draft. `204` empty body on success; attached job images are removed from S3 best-effort after delete. |
| GET | `/jobs/{id}` | Get job by id. |
| GET | `/jobs` | List jobs. Query: `status`, `category`, `location`, `limit`, `cursor`; `clientId=me` for current user’s jobs. |
| POST | `/jobs/{id}/publish` | Publish draft (owner). |
| POST | `/jobs/{id}/close` | Close draft or published job (owner). Body optional `reason`. |
| POST | `/jobs/{id}/images/upload-url` | Single API call for upload+attach. Reserves a key and adds it to job `imageKeys`, then returns presigned PUT URL. Body optional `contentType`. Upload triggers async Lambda moderation on S3 object create. |
| GET | `/jobs/{id}/images/urls` | CDN image URLs (not S3 presigned GET). Query: `keys=key1,key2`. Published or owner. Returns `{ urls: { "<key>": "<url-or-null>" } }`; `null` means pending AI check, awaiting manual review, or removed by moderation. |

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
| POST | `/bookings/{id}/images/upload-url` | Single API call for upload+attach. Reserves a key and adds it to booking `imageKeys`, then returns presigned PUT URL. Upload triggers async Lambda moderation on S3 object create. |
| GET | `/bookings/{id}/images/urls` | CDN image URLs. Query: `keys=`. Returns `url-or-null` per key; `null` means pending, in manual review, or removed by moderation. |

### Image moderation (platform admin — JWT)

JWT required on API Gateway; Lambda checks `custom:role` (trimmed) === `admin`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/moderation/pending` | Lists S3 objects under `jobs/` or `bookings/` whose object tagging reports moderation state `pending_review` (see shared image helpers). Query: optional `prefix` = `jobs` or `bookings` (default `jobs`); optional `cursor` (S3 list continuation token from prior response `nextCursor`). Work per request is capped (bounded list + tag reads); response `{ items: { key, lastModified? }[], nextCursor?, prefix }`. |
| POST | `/admin/moderation/approve` | Body: `{ "key": "<s3 object key>" }` (must be under `jobs/` or `bookings/`). Sets tag `moderation=approved` when the object is in manual review. |
| POST | `/admin/moderation/reject` | Same body. Deletes the object when it is in manual review (same outcome as auto-reject for bad scores). |

Rekognition label confidence bands (0–100) are configurable via Terraform / SSM: `IMAGE_MODERATION_REKOGNITION_MIN_CONFIDENCE`, `IMAGE_MODERATION_MANUAL_REVIEW_MIN_CONFIDENCE`, `IMAGE_MODERATION_AUTO_REJECT_MIN_CONFIDENCE`. Defaults: 40 / 55 / 75 — max label confidence below the manual threshold auto-approves; between manual and auto-reject queues for admin review; at or above auto-reject deletes the upload.

### Payments

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/payments/hold` | Body: `bookingId`, `amount`, optional `currency`. **Header `Idempotency-Key` required.** Caller must be booking party. |
| GET | `/payments` | List payments for the current user (as client or worker). Query: optional `limit` (default 50, max 100). Response `{ items: Payment[] }` sorted by `createdAt` descending. |
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

- **Success**: `200` / `201` with JSON body; lists often `{ "items": [...], "nextCursor"?: string }`. **`204`** for `DELETE /jobs/{id}` (no JSON body).
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
