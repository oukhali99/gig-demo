# ADR-004: In-process notification fan-out (no EventBridge)

**Status**: Accepted  
**Date**: 2026-03-25

## Context

Users need an inbox of notable events. A managed event bus adds cost, IAM, and asynchronous failure modes for a demo-sized deployment.

## Decision

After persisting domain state, code builds an **`EventEnvelope`** and calls **`broadcastEvent`**, which writes **notification rows** to DynamoDB with idempotent `PutItem` on `(userId, eventId)`. **Payment automation** tied to booking lifecycle runs in the **same request** via `payments/booking-hooks.ts`.

## Consequences

- **Positive**: No EventBridge rules or second consumer Lambda; easier to trace in one log stream; lower AWS surface area.
- **Negative**: Request latency includes notification writes; no replay bus; scaling hot spots land on the single Lambda.
- **Neutral**: Envelope shape remains useful if a bus is introduced later—producers could publish the same payload to SNS/EventBridge instead.
