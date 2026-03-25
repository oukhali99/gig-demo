# Sequence — booking lifecycle and payments

End-to-end view of **booking state changes**, **notification fan-out**, and **payment hooks** in the **same Lambda invocation** (no message bus).

---

## Confirm booking (creates demo hold)

```mermaid
sequenceDiagram
  participant C as Client owner
  participant G as API Gateway
  participant L as Lambda
  participant B as Bookings repo
  participant E as broadcastEvent
  participant N as Notifications table
  participant P as Payments repo hooks

  C->>G: POST /bookings/{id}/confirm JWT
  G->>L: invoke
  L->>B: update status confirmed
  B-->>L: booking
  L->>E: booking.confirmed envelope
  E->>N: PutItem worker notification
  L->>P: onBookingConfirmed
  P->>P: createPayment hold if missing
  P->>E: payment.hold.created envelope
  E->>N: PutItem client + worker
  L-->>G: 200 booking
  G-->>C: 200
```

---

## Complete booking (release hold)

```mermaid
sequenceDiagram
  participant U as User client or worker
  participant L as Lambda
  participant B as Bookings
  participant E as broadcastEvent
  participant P as Payments hooks

  U->>L: POST /bookings/{id}/complete
  L->>B: status completed
  L->>E: booking.completed
  L->>P: onBookingCompleted(bookingId)
  P->>P: updatePayment released if hold
  P->>E: payment.completed
  L-->>U: 200
```

---

## Cancel booking (refund path)

```mermaid
sequenceDiagram
  participant U as User
  participant L as Lambda
  participant B as Bookings
  participant E as broadcastEvent
  participant P as Payments hooks

  U->>L: POST /bookings/{id}/cancel optional reason
  L->>B: status cancelled
  L->>E: booking.cancelled
  L->>P: onBookingCancelled
  P->>P: refund if hold or released
  P->>E: payment.refunded
  L-->>U: 200
```

---

## Manual hold API (optional)

`POST /payments/hold` with idempotency can create a hold when booking is `confirmed` or `in_progress`; automatic hold on confirm may already exist—repository checks prevent duplicate active holds per booking where enforced in code.
