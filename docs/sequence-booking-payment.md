# Sequence — booking lifecycle and payments

End-to-end view of **booking state changes**, **notification fan-out**, and **payment hooks** in the **same Lambda invocation** (no message bus).

---

## Confirm booking (creates Stripe hold)

The payment hold is created **before** the booking status is updated so that a Stripe failure keeps the booking in `requested` and leaves nothing to roll back.

```mermaid
sequenceDiagram
  participant C as Client (browser)
  participant SE as Stripe Elements
  participant G as API Gateway
  participant L as Lambda
  participant ST as Stripe API
  participant B as Bookings repo
  participant P as Payments repo
  participant E as broadcastEvent
  participant N as Notifications table

  C->>SE: enter card details
  SE-->>C: paymentMethod.id
  C->>G: POST /bookings/{id}/confirm {paymentMethodId} JWT
  G->>L: invoke
  L->>L: validate booking + ownership
  L->>L: fetch job.budget (cents)
  L->>ST: PaymentIntents.create (capture_method=manual, confirm=true)
  ST-->>L: PaymentIntent {id, status=requires_capture}
  L->>P: createPayment {stripePaymentIntentId, amount=budget, hold_created}
  P-->>L: payment saved
  L->>E: payment.hold.created envelope
  E->>N: PutItem client + worker notifications
  L->>B: updateBookingStatus confirmed
  B-->>L: booking
  L->>E: booking.confirmed envelope
  E->>N: PutItem worker notification
  L-->>G: 200 booking
  G-->>C: 200
```

If the PaymentIntent status is not `requires_capture` (e.g. card requires 3D Secure), Lambda returns `402 PAYMENT_REQUIRES_ACTION` and the booking stays `requested`.

---

## Complete booking (captures Stripe hold)

```mermaid
sequenceDiagram
  participant U as User client or worker
  participant L as Lambda
  participant ST as Stripe API
  participant B as Bookings
  participant P as Payments hooks
  participant E as broadcastEvent

  U->>L: POST /bookings/{id}/complete
  L->>B: status completed
  L->>E: booking.completed
  L->>P: onBookingCompleted(bookingId)
  P->>ST: PaymentIntents.capture(stripePaymentIntentId)
  ST-->>P: captured
  P->>P: updatePayment released
  P->>E: payment.completed
  L-->>U: 200
```

---

## Cancel booking (cancels Stripe hold)

```mermaid
sequenceDiagram
  participant U as User
  participant L as Lambda
  participant ST as Stripe API
  participant B as Bookings
  participant P as Payments hooks
  participant E as broadcastEvent

  U->>L: POST /bookings/{id}/cancel optional reason
  L->>B: status cancelled
  L->>E: booking.cancelled
  L->>P: onBookingCancelled
  P->>ST: PaymentIntents.cancel(stripePaymentIntentId)
  ST-->>P: cancelled
  P->>P: updatePayment refunded
  P->>E: payment.refunded
  L-->>U: 200
```

---

## Stripe webhook (async confirmation path)

Stripe delivers events to `POST /payments/webhook` (public route, no JWT). The signature is verified using `STRIPE_WEBHOOK_SECRET` before any processing.

| Event | Action |
|-------|--------|
| `payment_intent.canceled` | If the PaymentIntent was canceled externally, marks the corresponding payment `refunded` in DynamoDB. |

---

## Manual hold API (optional)

`POST /payments/hold` with idempotency can create a hold when booking is `confirmed` or `in_progress`. If `paymentMethodId` is provided, a Stripe PaymentIntent is created the same way as the confirm hook. Repository checks prevent duplicate active holds per booking.
