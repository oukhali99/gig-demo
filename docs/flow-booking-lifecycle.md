# Flow — booking lifecycle

## State diagram

```mermaid
stateDiagram-v2
  [*] --> requested: POST /bookings
  requested --> confirmed: Owner POST .../confirm
  requested --> cancelled: Party POST .../cancel
  confirmed --> in_progress: Worker POST .../start
  confirmed --> completed: Party POST .../complete
  confirmed --> cancelled: Party POST .../cancel
  in_progress --> completed: Party POST .../complete
  in_progress --> cancelled: Party POST .../cancel
  completed --> [*]
  cancelled --> [*]
```

---

## Decision: who may act

```mermaid
flowchart TD
  A[Booking action] --> B{Which route?}
  B -->|confirm| O[Only job owner clientId]
  B -->|start| W[Only workerId]
  B -->|complete| P[clientId or workerId]
  B -->|cancel| P
```

---

## Payment side effects (summary)

```mermaid
flowchart LR
  subgraph booking [Booking event]
    CF[confirmed]
    CP[completed]
    CX[cancelled]
  end
  subgraph payment [Payment hooks → Stripe]
    H["create PaymentIntent hold\ncapture_method=manual"]
    R["capture PaymentIntent\nworker gets paid"]
    F["cancel PaymentIntent\nclient refunded"]
  end
  CF --> H
  CP --> R
  CX --> F
```

- **confirmed**: Stripe PaymentIntent created (`capture_method: manual`). Card held, not charged. Requires `paymentMethodId` from Stripe Elements in the confirm flow.
- **completed**: PaymentIntent captured — funds move to Stripe balance.
- **cancelled**: PaymentIntent cancelled — hold released, client not charged.

When Stripe is not configured or `paymentMethodId` is absent, a $0 placeholder payment record is created with no Stripe side effects (local dev path).

Exact rules live in `app/api/src/payments/booking-hooks.ts` and `payments/http.ts`.
