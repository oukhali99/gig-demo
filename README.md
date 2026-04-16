# Gig demo

A **serverless** gig marketplace: clients post small jobs, workers discover and complete them. The backend is **Node.js on Lambda** behind **API Gateway** (HTTP API, Cognito JWT), with **DynamoDB** tables per area (jobs, bookings, payments, notifications, reviews), **S3** for images, and **Cognito** for auth. One Lambda handles all HTTP routes today; tables stay separate so ownership stays clear when you grow.

The stack is entirely managed AWS services (no servers to run). Splitting into multiple deployables later is straightforward when traffic, teams, or boundaries warrant it—there is no need to pay that cost up front for a small serverless footprint.

**Documentation**: [docs/README.md](docs/README.md) — product, architecture, API contracts, sequences, flowcharts, and ADRs.

## AWS architecture

![AWS Architecture](docs/AWS%20Architecture.drawio.svg)

**Source:** [docs/AWS Architecture.drawio](docs/AWS%20Architecture.drawio) — edit in **[diagrams.net](https://app.diagrams.net/)**; after changes, **File → Export as → SVG…** → `docs/AWS Architecture.drawio.svg` so this image stays current. Icons use the built-in AWS shape library (`mxgraph.aws4.*`).

**Terraform environments** (one module tree, backend `reconfigure`, CI vs local): [docs/10-terraform-environments-and-ci.md](docs/10-terraform-environments-and-ci.md).

## AI tools used

- **Cursor AI (Agent mode)** — used to accelerate implementation, refactors, and doc updates.
- **LLM assistance (via Cursor chat/agent)** — used for drafting explanations, API summaries, and consistency checks in docs.
- **Amazon Comprehend** — runtime AI moderation for job text (`DetectToxicContent`).
- **Amazon Rekognition** — runtime AI moderation for uploaded images (`DetectModerationLabels`).

These AI tools assist development and runtime moderation, but human review remains required for final architecture and product decisions.

## Repo structure

```
├── app/
│   ├── api/           # API Lambda (TypeScript → dist → build/package for Terraform)
│   └── frontend/      # Vite SPA — install deps in this directory for local dev
├── docs/              # Product, architecture, contracts, diagrams, ADRs
├── buildspec.yml      # AWS CodeBuild: Lambda build, terraform apply, SPA publish
├── infra/             # Terraform (pipeline, cloudfront, …)
├── scripts/           # bootstrap-terraform-state.sh, tf-init-ci.sh, frontend publish
├── package.json       # Yarn workspaces: app/api, app/frontend
└── yarn.lock
```

## Prerequisites

Node.js 20+, Yarn, Terraform 1.0+, AWS CLI configured.

## Terraform state backend (first time)

Create the S3 bucket and DynamoDB lock table **before** the first `terraform init` with a remote backend:

```bash
./scripts/bootstrap-terraform-state.sh my-company-terraform-state us-east-1 gig-demo-tf-lock-prod
# or: yarn tf:bootstrap -- my-company-terraform-state us-east-1 gig-demo-tf-lock-prod
```

Use the same bucket, region, and `dynamodb_table` name in `infra/terraform-backend.*.hcl` and set `terraform_state_bucket`, `terraform_state_key`, and `terraform_lock_table` in your `terraform.*.tfvars`. For dev, reuse the bucket with a different state key and lock table (see `*.example` files).

## Deploy

Use separate config files for prod and dev:

- `infra/terraform.prod.tfvars` + `infra/terraform-backend.prod.hcl`
- `infra/terraform.dev.tfvars` + `infra/terraform-backend.dev.hcl`

Examples are provided for each:

- `infra/terraform.prod.tfvars.example`
- `infra/terraform.dev.tfvars.example`
- `infra/terraform-backend.prod.hcl.example`
- `infra/terraform-backend.dev.hcl.example`

Copy each `*.example` to the matching path without `.example` (those four files are **gitignored** so you don’t commit account-specific values). If they were ever committed, run `git rm --cached` on them once.

Set `terraform_state_bucket`, `terraform_state_key`, and `terraform_lock_table` in each tfvars file, and keep backend `key` / `dynamodb_table` aligned with the same environment's tfvars. Both the bucket and lock table are created outside Terraform (see **Terraform state backend** above).

```bash
yarn install
yarn tf:init       # prod backend init
yarn deploy        # prod apply + frontend publish
yarn tf:init:dev   # dev backend init
yarn deploy:dev    # dev apply + frontend publish
```

This builds the Lambda bundle, runs `terraform apply`, sets `app/frontend/.env` `VITE_API_URL` to the **API** URL (`terraform output -raw vite_api_url`), builds the SPA, syncs it to S3, and invalidates the **frontend** CloudFront distribution. Set **`images_public_url`** in tfvars to a third hostname (e.g. `https://images.example.com`) in the same Route 53 zone; image **GET** URLs use that CloudFront distribution (CORS for the SPA), while **PUT** uploads still use presigned S3 URLs. Outputs: `frontend_cloudfront_url`, `api_cloudfront_url`, `images_cloudfront_url`.

### Stripe payments

Add your Stripe keys to the tfvars file for each environment:

```hcl
stripe_secret_key      = "sk_test_..."
stripe_webhook_secret  = "whsec_..."
stripe_publishable_key = "pk_test_..."
```

`stripe_secret_key` and `stripe_webhook_secret` are stored as **SecureString** in SSM (`/{env}/api/STRIPE_SECRET_KEY`, `/{env}/api/STRIPE_WEBHOOK_SECRET`). `stripe_publishable_key` is passed through as a Terraform output and injected into `app/frontend/.env` as `VITE_STRIPE_PUBLISHABLE_KEY` automatically by `scripts/update-frontend-env.sh` during every deploy — no manual `.env` edit needed.

Register `POST /payments/webhook` in the Stripe dashboard (**Developers → Webhooks → Add endpoint**) pointing at your API URL. Enable **"Listen to events on Connected accounts"** and subscribe to:
- `payment_intent.canceled`
- `account.updated`

Use the signing secret from that single registration as `stripe_webhook_secret`. Without Stripe keys, the booking confirm flow works without card collection (local dev / demo mode).

### CodePipeline

Set `github_connection_arn` (create a **CodeStar connection** to GitHub under Developer Tools → Connections and approve it in the console), `github_repository_id` (`owner/repo`), and `github_branch` in both environment tfvars files as needed. Every apply provisions the pipeline and CodeBuild project. Pushes to that branch run `buildspec.yml`, which calls **`yarn deploy:ci`** (no committed backend `.hcl` or `terraform.*.tfvars` required).

CodeBuild receives backend and module inputs from environment variables (wired in `infra/pipeline.tf` from your Terraform variables). For a one-off CI run outside that project, set at least:

| Variable | Purpose |
|----------|---------|
| `TF_STATE_BUCKET`, `TF_STATE_KEY`, `TF_LOCK_TABLE` | S3 backend + DynamoDB lock |
| `TF_BACKEND_REGION` | Region for the state bucket (and init); CodeBuild also sets `AWS_DEFAULT_REGION` |
| `TF_VAR_terraform_state_bucket`, `TF_VAR_terraform_state_key`, `TF_VAR_terraform_lock_table` | State bucket/key + lock table name (must match `TF_LOCK_TABLE`) |
| `TF_VAR_aws_region` | AWS provider region for resources |
| `TF_VAR_environment` | `prod` or `dev` |
| `TF_VAR_frontend_public_url`, `TF_VAR_api_public_url`, `TF_VAR_images_public_url`, `TF_VAR_route53_zone_id` | URLs and hosted zone |
| `TF_VAR_github_connection_arn`, `TF_VAR_github_repository_id`, `TF_VAR_github_branch` | Pipeline source |

Local deploys still use `yarn deploy` / `yarn deploy:dev` with your gitignored `*.hcl` and `terraform.*.tfvars` files.

```bash
yarn install && yarn workspace frontend dev
```

**Destroy**: `yarn destroy` (prod) or `yarn destroy:dev` (dev)

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

Use **Yarn** at the repo root; workspaces include `app/api` and `app/frontend`.
