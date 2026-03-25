# ADR-002: Cognito + API Gateway JWT authorizer

**Status**: Accepted  
**Date**: 2026-03-25

## Context

Clients need authenticated sessions. API Gateway should reject unauthenticated calls before Lambda runs where possible.

## Decision

Use **Amazon Cognito User Pools** for registration and password login. Configure **HTTP API JWT authorizer** with issuer and audience matching the user pool and app client. Public auth routes (`/auth/register`, `/auth/login`, `/auth/refresh`) have **no** JWT requirement at the gateway; protected routes require `Authorization: Bearer <token>`.

## Consequences

- **Positive**: No custom token service; API Gateway validates JWT; Lambda reads `sub` from request context.
- **Negative**: Vendor lock-in to Cognito JWT shape; authorizer config must stay in sync with pool/client ids.
- **Neutral**: Admin APIs or M2M would need a separate pattern if added later.
