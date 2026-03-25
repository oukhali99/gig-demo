# ADR-001: Single Lambda behind HTTP API

**Status**: Accepted  
**Date**: 2026-03-25

## Context

The product needs a serverless HTTP API with low operational overhead while the user base and team are small. Splitting into many deployables adds build pipelines, IAM boundaries, and release coordination.

## Decision

Use **one AWS Lambda function** (`handler.handler`) as the sole compute for all routes. **API Gateway HTTP API** invokes it with payload format 2.0. Domain logic is organized in **separate folders** under `app/api/src/` (identity, jobs, bookings, etc.) without separate Lambda per area.

## Consequences

- **Positive**: Simple deploy (one zip), one cold-start surface, easy local reasoning, Terraform stays small.
- **Negative**: Cannot scale or deploy domains independently; blast radius is the whole API; concurrency is shared.
- **Neutral**: Tables remain separate so a future split into multiple Lambdas or services reuses the same data boundaries.
