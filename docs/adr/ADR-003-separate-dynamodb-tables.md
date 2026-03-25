# ADR-003: One DynamoDB table per domain

**Status**: Accepted  
**Date**: 2026-03-25

## Context

Even with one Lambda, data for jobs, bookings, payments, notifications, and reviews has different access patterns and lifecycle. A single shared table would mix concerns and complicate IAM and future extraction.

## Decision

Provision **five DynamoDB tables** (jobs, bookings, payments, notifications, reviews) with GSIs as needed. Lambda receives table names via environment variables. Code uses **separate repository modules** per table.

## Consequences

- **Positive**: Clear ownership per entity; IAM can scope policies per table; ready for split deployables later.
- **Negative**: More Terraform and more items in the AWS console than one mega-table.
- **Neutral**: Cross-entity operations use in-process calls, not cross-table transactions (not required for current flows).
