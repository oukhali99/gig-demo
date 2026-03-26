# Gig demo — documentation index

Product, architecture, contracts, and decisions for this repo. Start here, then read numbered docs and ADRs as needed.

---

## Index

| # | Document | Description |
|---|----------|-------------|
| 01 | [01-product-and-domain.md](01-product-and-domain.md) | Problem, goals, personas, core flows, bounded contexts. |
| 02 | [02-use-cases.md](02-use-cases.md) | Use case list and detailed scenarios. |
| 03 | [03-architecture-overview.md](03-architecture-overview.md) | Runtime architecture, AWS services, deployment, diagrams. |
| 04 | [04-bounded-contexts-and-code-map.md](04-bounded-contexts-and-code-map.md) | Logical domains and where they live in `app/api`. |
| 05 | [05-api-contracts.md](05-api-contracts.md) | HTTP routes, auth, idempotency, response shapes. |
| 06 | [06-domain-events-and-notifications.md](06-domain-events-and-notifications.md) | Event envelopes, notification fan-out (no message bus). |
| 07 | [07-data-and-persistence.md](07-data-and-persistence.md) | DynamoDB tables, S3, identifiers. |
| 08 | [08-security-and-compliance.md](08-security-and-compliance.md) | Auth, API exposure, secrets, encryption. |
| 09 | [09-operations-and-observability.md](09-operations-and-observability.md) | Logging, metrics, deploy, resource groups. |
| — | [sequence-booking-payment.md](sequence-booking-payment.md) | Sequence: booking lifecycle and payment side effects. |
| — | [flow-booking-lifecycle.md](flow-booking-lifecycle.md) | State diagram and flowcharts for bookings. |
| — | [adr/](adr/) | Architecture decision records ([index](adr/README.md)). |

---

## AI tools used

| Tool | Where used | Purpose |
|------|------------|---------|
| Cursor AI (agent/chat) | Development workflow | Implement changes faster and keep docs/code aligned. |
| LLM assistance in Cursor | Documentation process | Draft and refine technical explanations and contract summaries. |
| Amazon Comprehend | API runtime (`app/api/src/shared/text-moderation.ts`) | Toxicity moderation for job text. |
| Amazon Rekognition | API runtime (`app/api/src/shared/images.ts`) | Moderation for uploaded images. |

Notes:

- AI output in docs/code is reviewed by maintainers before merge.
- Runtime moderation thresholds are configurable and should be tuned with product policy.

---

## Glossary

| Term | Definition |
|------|------------|
| **Booking** | Assignment of a worker to a job; status lifecycle (requested → confirmed → in progress → completed or cancelled). |
| **Job** | Unit of work posted by a user (category, location, budget, schedule); draft / published / closed. |
| **Event envelope** | Structured object (`eventId`, `eventType`, `payload`, …) used for notification fan-out after domain actions. |
| **Idempotency** | Repeating the same request with the same idempotency key yields the same outcome without duplicate side effects. |
