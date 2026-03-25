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
  subgraph payment [Payment hooks]
    H[ensure hold]
    R[release]
    F[refund]
  end
  CF --> H
  CP --> R
  CX --> F
```

Exact rules live in `app/api/src/payments/booking-hooks.ts` and `payments/http.ts`.
