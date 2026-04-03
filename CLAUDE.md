# gig-demo

Serverless gig marketplace (Gigboard) — clients post small jobs, workers discover and complete them.

## Stack

**Backend** (`app/api/`)
- Node.js 20 + TypeScript, deployed as AWS Lambda (HTTP API)
- AWS SDK v3: DynamoDB, S3, Cognito, Comprehend, Rekognition, Bedrock, SSM
- Second Lambda for image moderation (S3-event-triggered)
- No test framework yet — `npm test` is a placeholder

**Frontend** (`app/frontend/`)
- React 18 + TypeScript + Vite SPA
- React Router v6, no state management library
- Hosted on S3 + CloudFront

**Infrastructure** (`infra/`)
- Terraform 1.x, two environments: `prod` / `dev`
- AWS: API Gateway HTTP API, Cognito (JWT auth), DynamoDB (5 tables), S3, CloudFront (OAC), SSM Parameter Store, CodePipeline + CodeBuild CI/CD

## Build & Run

```bash
# API
cd app/api
npm install
npm run build               # tsc compile
npm run build:lambda        # bundle for Lambda deployment
npm run seed:dummy          # seed DynamoDB with test data

# Frontend
cd app/frontend
npm install
npm run dev                 # Vite dev server
npm run build               # Production build

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
- **Config**: SSM Parameter Store, loaded per-invocation (no cache) via `app/api/src/config/ssm.ts`
- **Image moderation**: Upload to S3 → triggers moderation Lambda → Rekognition labels → tag or delete object; CloudFront only serves approved objects
- **AI**: Comprehend for text toxicity, Rekognition for image labels, Bedrock (Claude Haiku) for writing assistant

## DynamoDB Tables

| Table | Primary Key | Notable GSIs |
|---|---|---|
| jobs | `id` | `clientId-index`, `status-index` |
| bookings | `id` | `jobId-index`, `workerId-index` |
| payments | `id` | `bookingId-index` |
| notifications | `id` | `userId-index` |
| reviews | `id` | `jobId-index`, `revieweeId-index` |

## Conventions

- TypeScript throughout — no `any`
- AWS SDK v3 (modular imports, not v2)
- ESM (`"type": "module"`) in both packages
- Conventional commits
- Branch strategy: `main` (prod), `development` (default working branch), feature branches off `development`

## Workflow

After **every** code or infrastructure change, verify it compiles/validates before considering the task done:

| Changed area | Verification command |
|---|---|
| `app/api/` | `cd app/api && npm run build` |
| `app/frontend/` | `cd app/frontend && npm run build` |
| `infra/` | `cd infra && terraform fmt -check && terraform validate` |

Run only the command(s) relevant to what was changed. Fix any errors before finishing.

## Safety Rules (CRITICAL)

- **NEVER `terraform apply`** without explicit human approval — infrastructure changes affect live AWS resources
- **NEVER `terraform plan`** against prod without confirming the environment first (`-var-file=prod.tfvars`)
- The CodeBuild IAM role has `AdministratorAccess` — treat CI credentials as high-privilege
- Payment system tracks state in DynamoDB only — **no real money movement** (no Stripe/payment processor integrated)

## Known Issues (see `docs/audit-report.md`)

- `canAccessPayment` fallback allows access when `clientId`/`workerId` are missing — should be `return false`
- Draft jobs and bookings have no authorization check on `GET /{resource}/{id}`
- SSM loaded with `WithDecryption: false` — will silently receive ciphertext for `SecureString` params
- All users are auto-confirmed on registration (email verification bypassed)
- Refresh token not persisted to `localStorage` after silent refresh — users silently log out
- No tests

## Known Gotchas

- The `routeMap` in domain HTTP handlers documents routes but does **not** perform routing — real routing is the `if/else` fallthrough below it
- `clientId` parsed from request body in job creation is silently discarded — JWT `sub` is always used
- `budget` and `amount` fields are free-form strings — no numeric validation or normalization
- `listJobs` filters category/location **client-side** after DynamoDB returns a page — returned page may be smaller than requested limit
- Category/location post-filtering means `nextCursor` can be present even when no more matching items exist
