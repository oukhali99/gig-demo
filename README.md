# Gig demo

A **serverless** gig marketplace: clients post small jobs, workers discover and complete them. The backend is **Node.js on Lambda** behind **API Gateway** (HTTP API, Cognito JWT), with **DynamoDB** tables per area (jobs, bookings, payments, notifications, reviews), **S3** for images, and **Cognito** for auth. One Lambda handles all HTTP routes today; tables stay separate so ownership stays clear when you grow.

The stack is entirely managed AWS services (no servers to run). Splitting into multiple deployables later is straightforward when traffic, teams, or boundaries warrant it—there is no need to pay that cost up front for a small serverless footprint.

**Documentation**: [docs/README.md](docs/README.md) — product, architecture, API contracts, sequences, flowcharts, and ADRs.

## Repo structure

```
├── app/
│   ├── api/           # API Lambda (TypeScript → dist → build/package for Terraform)
│   └── frontend/      # Vite SPA — install deps in this directory for local dev
├── docs/              # Product, architecture, contracts, diagrams, ADRs
├── buildspec.yml      # AWS CodeBuild: Lambda build, terraform apply, SPA publish
├── infra/             # Terraform (includes remote-state, pipeline, cloudfront, …)
├── scripts/           # update-frontend-env.sh, publish-frontend.sh
├── package.json       # Yarn workspace: app/api
└── yarn.lock
```

## Prerequisites

Node.js 20+, Yarn, Terraform 1.0+, AWS CLI configured.

## Deploy

Create `infra/terraform.tfvars` from `infra/terraform.tfvars.example` and set `frontend_public_url`, `api_public_url`, `route53_zone_id`, and the GitHub/CodeStar fields (`github_connection_arn`, `github_repository_id`, `github_branch`).

**Terraform state** goes in an **S3 bucket you create** (`terraform_state_bucket` in `terraform.tfvars`; enable versioning on that bucket in the console). DynamoDB locking is still created by Terraform (`infra/remote-state.tf`). The root module uses a partial `backend "s3" {}` configuration.

1. Create the S3 bucket, set `terraform_state_bucket` in `terraform.tfvars`, then from `infra/`: `terraform init -backend=false`, `terraform apply` (state stays **local** until step 2), or configure the backend first if the lock table already exists.
2. Copy `infra/terraform-backend.hcl.example` to `infra/terraform-backend.hcl`. Set `bucket` to your `terraform_state_bucket`, and `key` / `dynamodb_table` using `terraform output` (`terraform_state_key`, `terraform_lock_table`). Run `terraform init -backend-config=terraform-backend.hcl -migrate-state` so later applies (including **CodePipeline**) use remote state.

```bash
yarn install
yarn deploy
```

This builds the Lambda bundle, runs `terraform apply`, sets `app/frontend/.env` `VITE_API_URL` to the **API** URL (`terraform output -raw vite_api_url`), builds the SPA, syncs it to S3, and invalidates the **frontend** CloudFront distribution. Open `terraform output -raw frontend_cloudfront_url` for the site; the API is at `terraform output -raw api_cloudfront_url`.

### CodePipeline

Set `github_connection_arn` (create a **CodeStar connection** to GitHub under Developer Tools → Connections and approve it in the console), `github_repository_id` (`owner/repo`), and `github_branch` in `terraform.tfvars`. Every apply provisions the pipeline and CodeBuild project. Pushes to that branch run `buildspec.yml`: Lambda package build, `terraform apply` against the **remote** backend, then frontend build, S3 sync, and CloudFront invalidation. The CodeBuild role uses **AdministratorAccess** for simplicity; tighten the policy for production.

```bash
cd app/frontend && yarn install && yarn dev
```

**Destroy**: `yarn destroy`

## API

HTTP API v2 with JWT on protected routes: `/auth/*`, `/users/{id}`, `/jobs/*`, `/bookings/*`, `/payments/*`, `/notifications`, `/reviews`. Details: [docs/05-api-contracts.md](docs/05-api-contracts.md).

## Where to look

- **HTTP entrypoint**: [app/api/src/handler.ts](app/api/src/handler.ts)
- **Shared API helpers (Lambda)**: [app/api/src/lib/](app/api/src/lib/) — JSON responses, JWT claims, event envelope, `devLog`
- **Jobs**: [app/api/src/jobs/http.ts](app/api/src/jobs/http.ts), [app/api/src/jobs/repository.ts](app/api/src/jobs/repository.ts)
- **Bookings**: [app/api/src/bookings/http.ts](app/api/src/bookings/http.ts), [app/api/src/payments/booking-hooks.ts](app/api/src/payments/booking-hooks.ts)
- **Payments**: [app/api/src/payments/http.ts](app/api/src/payments/http.ts)
- **Notifications fan-out**: [app/api/src/broadcast.ts](app/api/src/broadcast.ts)
- **Identity**: [app/api/src/identity/http.ts](app/api/src/identity/http.ts), [app/api/src/identity/cognito.ts](app/api/src/identity/cognito.ts)
- **Infrastructure**: [infra/](infra/) — especially [infra/apigateway.tf](infra/apigateway.tf), [infra/lambda.tf](infra/lambda.tf)
- **Architecture & diagrams**: [docs/03-architecture-overview.md](docs/03-architecture-overview.md), [docs/sequence-booking-payment.md](docs/sequence-booking-payment.md), [docs/flow-booking-lifecycle.md](docs/flow-booking-lifecycle.md)
- **ADRs**: [docs/adr/README.md](docs/adr/README.md)

## Package manager

Use **Yarn** at the repo root and in `app/frontend` per project conventions.
