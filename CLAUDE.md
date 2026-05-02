# gig-demo

Serverless gig marketplace (Gigboard) — clients post small jobs, workers discover and complete them.

## Stack

**Backend** (`app/api/`)
- Node.js 22 + TypeScript, deployed as AWS Lambda (HTTP API)
- AWS SDK v3: DynamoDB, S3, Cognito, Comprehend, Rekognition, Bedrock, SSM
- Second Lambda for image moderation (S3-event-triggered)
- No test framework yet — `yarn test` is a placeholder

**Frontend** (`app/frontend/`)
- React 18 + TypeScript + Vite SPA
- React Router v6, no state management library
- Hosted on S3 + CloudFront

**Infrastructure** (`infra/`)
- Terraform 1.x, two environments: `prod` / `dev`
- AWS: API Gateway HTTP API, Cognito (JWT auth), DynamoDB (5 tables), S3, CloudFront (OAC), SSM Parameter Store, CodePipeline + CodeBuild CI/CD

## Build & Run

```bash
# Install all workspaces from repo root (always use yarn, never npm)
yarn install

# API
yarn workspace gig-api build               # tsc compile
yarn workspace gig-api build:lambda        # bundle for Lambda deployment
yarn workspace gig-api seed:dummy          # seed DynamoDB with test data

# Frontend
yarn workspace frontend dev                # Vite dev server
yarn workspace frontend build              # Production build

# Infrastructure
cd infra
terraform init
terraform fmt -check
terraform validate
terraform plan
terraform apply             # REQUIRES human approval
```

## Architecture

- **Routing**: Single Lambda, hand-rolled router in `handler.ts` dispatches by path prefix to domain modules (`/jobs`, `/bookings`, `/payments`, `/notifications`, `/reviews`, `/assistant`, `/admin`, `/auth`, `/users`)
- **Auth**: All routes except `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh` are protected by Cognito JWT authorizer at API Gateway level. Admin ops gated on `custom:role=admin` claim in application code
- **Events**: No EventBridge — `broadcast.ts` writes directly to the notifications DynamoDB table
- **Config**: SSM Parameter Store, loaded once per container lifetime (cached in module scope) via `app/api/src/config/ssm.ts`
- **Image moderation**: Upload to S3 → triggers moderation Lambda → Rekognition labels → tag or delete object; CloudFront only serves approved objects
- **AI**: Comprehend for text toxicity, Rekognition for image labels, Bedrock (Claude Haiku) for writing assistant

## DynamoDB Tables

| Table | Primary Key | Notable GSIs |
|---|---|---|
| jobs | `jobId` | `status-createdAt-index`, `clientId-createdAt-index` |
| bookings | `bookingId` | `jobId-createdAt-index`, `workerId-createdAt-index`, `clientId-createdAt-index`, `status-createdAt-index`, `idempotencyKey-index` |
| payments | `paymentId` | `bookingId-createdAt-index`, `clientId-createdAt-index`, `workerId-createdAt-index`, `idempotencyKey-index` |
| notifications | `userId` + `eventId` | — (query by partition `userId`) |
| reviews | `bookingId` + `reviewerId` | `revieweeId-createdAt-index` |

## Conventions

- **Package manager: Yarn only** — never use `npm install` or `npm ci`. Use `yarn` / `yarn workspace <name> <script>` from the repo root. Do not create `package-lock.json`.
- TypeScript throughout — no `any`
- AWS SDK v3 (modular imports, not v2)
- ESM (`"type": "module"`) in both packages
- Conventional commits
- Branch strategy: `main` (prod), `development` (default working branch), feature branches off `development`
- **Env var checklist** — when adding any new environment variable, update ALL of the following that apply:
  - `app/frontend/.env.example` — for new `VITE_*` vars
  - `infra/terraform.dev.tfvars.example` and `infra/terraform.prod.tfvars.example` — for new Terraform input variables
  - `infra/variables.tf` — declare the variable
  - `infra/outputs.tf` — expose as output if the frontend or a script needs to read it
  - `scripts/update-frontend-env.sh` — if the var must be written to `app/frontend/.env` at deploy time
  - `infra/pipeline.tf` — add a `TF_VAR_*` CodeBuild environment variable so CI can pass it to `terraform apply`
  - **SecureString SSM parameters** — if the new var is a `SecureString`, also add its full ARN to the `kms:EncryptionContext:PARAMETER_ARN` list in the `api_lambda_ssm` policy in `infra/iam.tf`. Without this the Lambda cannot decrypt it and it will silently be absent from `process.env`.
- **SSM config** — always call `ensureLambdaConfigFromSsm()` at the top of every Lambda handler entry point before reading `process.env`. It loads all SSM params into `process.env` once per container lifetime. Forgetting this means env vars are undefined on cold starts.
- **Docs checklist** — when behavior, schema, or contract changes, update the matching doc in the same change:
  - HTTP route added/removed or query/body shape changed → `docs/05-api-contracts.md`
  - DynamoDB attribute, GSI, or primary key changed → `docs/07-data-and-persistence.md` AND the `## DynamoDB Tables` table in this file
  - New domain event or notification type → `docs/06-domain-events-and-notifications.md`
  - Booking lifecycle, role permissions, or payment flow changed → `docs/flow-booking-lifecycle.md` and `docs/sequence-booking-payment.md`
  - AWS service swap, runtime bump, or new component → `docs/03-architecture-overview.md`, the architecture mention in this file, and `README.md` if user-facing
  - Bounded-context boundaries or module map changed → `docs/04-bounded-contexts-and-code-map.md`
  - Security/auth model changed → `docs/08-security-and-compliance.md`
  - Operational runbook (logs, alarms, SSM params) changed → `docs/09-operations-and-observability.md`
  - Terraform environment, CI pipeline, or backend config changed → `docs/10-terraform-environments-and-ci.md`
- **Logging** — never use `console.log`, `console.error`, or `console.warn` directly. Always use `logger` from `app/api/src/lib/logger.ts`:
  - `logger.debug(msg, data?)` — verbose, dev only (filtered out in prod by default)
  - `logger.info(msg, data?)` — notable events (Stripe webhook received, image moderation decision)
  - `logger.warn(msg, data?)` — recoverable non-critical failures (S3 cleanup failed)
  - `logger.error(msg, data?)` — unexpected errors that need investigation
  - Level is controlled by `LOG_LEVEL` env var (SSM), configured per environment via `log_level` in tfvars. Default: `WARN`. Dev default: `DEBUG`. Output is structured JSON.
  - The `data` param must be `Record<string, unknown>` — do not pass `Error` objects or raw strings directly; serialize them: `{ error: String(err) }`.

## Workflow

After **every** code or infrastructure change, verify it compiles/validates before considering the task done:

| Changed area | Verification command |
|---|---|
| `app/api/` | `yarn workspace gig-api build` |
| `app/frontend/` | `yarn workspace frontend build` |
| `infra/` | `cd infra && terraform fmt -check && terraform validate` |

Run only the command(s) relevant to what was changed. Fix any errors before finishing.

## Safety Rules (CRITICAL)

- **NEVER `terraform apply`** without explicit human approval — infrastructure changes affect live AWS resources
- **NEVER `terraform plan`** against prod without confirming the environment first (`-var-file=prod.tfvars`)
- The CodeBuild IAM role has a scoped IAM policy — treat CI credentials as high-privilege
- **Stripe is integrated** — `POST /bookings/{id}/confirm` now requires a `paymentMethodId` in production and creates a real Stripe PaymentIntent hold; completion captures it

## Known Issues (see `docs/audit-report.md`)

- Refresh token not persisted to `localStorage` after silent refresh — users silently log out
- No tests

## Known Gotchas

- The `routeMap` in domain HTTP handlers documents routes but does **not** perform routing — real routing is the `if/else` fallthrough below it
- `clientId` parsed from request body in job creation is silently discarded — JWT `sub` is always used
- `budget` (jobs) and `amount` (payments) are **integer cents** (e.g. 5000 = $50.00) — frontend converts dollars to cents on input
- `listJobs` filters category/location **client-side** after DynamoDB returns a page — returned page may be smaller than requested limit
- Category/location post-filtering means `nextCursor` can be present even when no more matching items exist
- **Stripe booking gate requires a fresh JWT** — after a worker completes Stripe onboarding, their existing token does not yet carry `custom:stripeAccountId`. They need a token refresh (or new sign-in) before the `POST /bookings` gate will pass. Do not "fix" this by switching the gate to a Cognito API call — the JWT-claim approach is intentional for zero-latency checks.
- **`transfer_failed` does not roll back the booking** — if the Stripe transfer fails on booking completion, `booking.status` is `completed` and `payment.status` is `transfer_failed`. The booking is done; the operator resolves the transfer via Stripe dashboard. Do not add rollback logic here.
