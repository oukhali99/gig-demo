# Use cases

## Use case list

| Id | Name | Actor(s) | Goal |
|----|------|----------|------|
| UC-01 | Register | User | Create an account with email/password. |
| UC-02 | Login / refresh | User | Obtain JWTs for API access. |
| UC-03 | Create draft job | User | Describe a job before publishing. |
| UC-04 | Publish job | Job owner | Make job visible for bookings. |
| UC-05 | List / get jobs | User | Discover or inspect jobs (with filters). |
| UC-06 | Request booking | Worker (non-owner) | Express interest on a published job. |
| UC-07 | Confirm booking | Job owner | Accept a booking request. |
| UC-08 | Start work | Worker | Move confirmed booking to in progress. |
| UC-09 | Complete booking | Client or worker | Mark booking completed. |
| UC-10 | Cancel booking | Client or worker | Cancel from allowed states. |
| UC-11 | Payment hold (API) | Authenticated party | Create hold with idempotency (optional if auto-hold on confirm). |
| UC-12 | Release / refund payment | Client or worker (per rules) | Move payment state for demo flow. |
| UC-13 | List notifications | User | See inbox rows for past domain events. |
| UC-14 | Submit review | Booking party | Rate/text review after completion. |
| UC-15 | List reviews | Any authenticated user | List reviews for a user (`revieweeId`). |

---

## UC-06 — Request booking (detailed)

**Actor**: Authenticated user (worker).  
**Preconditions**: Job exists, status is `published`, worker is not the job owner.  

**Main scenario**:

1. Client sends `POST /bookings` with JSON `{ "jobId" }` and header `Idempotency-Key`.
2. API loads job from DynamoDB; validates published and distinct worker/owner.
3. API creates booking with status `requested` and stores idempotency key.
4. API fan-outs `booking.created` to notification inbox (see [06](06-domain-events-and-notifications.md)).
5. API returns `201` with booking, or `200` with same booking if idempotency key matches.

**Extensions**:

- 3a. Duplicate idempotency key — return existing booking (`200`).
- 3b. Job not published — `409 CONFLICT`.

---

## UC-07 — Confirm booking (detailed)

**Actor**: Job owner (client on the booking).  
**Preconditions**: Booking status is `requested`.  

**Main scenario**:

1. Client sends `POST /bookings/{id}/confirm` with JWT.
2. API updates booking to `confirmed`.
3. API fan-outs `booking.confirmed` to notifications.
4. API runs **payment hook**: creates demo hold if none exists, fan-outs `payment.hold.created`.
5. Returns `200` with updated booking.

---

## UC-09 / UC-10 — Complete and cancel (summary)

- **Complete**: From `confirmed` or `in_progress`; client or worker; fan-out `booking.completed`; payment hook may release hold.
- **Cancel**: From non-terminal states; fan-out `booking.cancelled`; payment hook may refund.

See [sequence-booking-payment.md](sequence-booking-payment.md) for ordering.
