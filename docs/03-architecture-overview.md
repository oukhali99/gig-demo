# Architecture overview

For an **AWS service diagram** with official-style icons (draw.io source + optional SVG export for the repo README), see [AWS Architecture.drawio](AWS%20Architecture.drawio) and [10-terraform-environments-and-ci.md](10-terraform-environments-and-ci.md).

## High-level design

Clients use the **Vite/React** SPA (or any HTTP client). All traffic goes through **API Gateway (HTTP API)** with a **JWT authorizer** (Cognito). A single **Lambda** function handles every route and calls domain code under `app/api/src/`. **DynamoDB** stores domain data in separate tables; **S3** stores images; **Rekognition** moderates uploads. There is **no EventBridge/SNS** bus: after state changes, the app builds **event envelopes** and writes **notification rows** in process.

```mermaid
flowchart TB
  subgraph clients [Clients]
    Web[Web SPA]
  end
  subgraph edge [Edge]
    APIGW[API Gateway HTTP API]
    COG[JWT authorizer Cognito]
  end
  subgraph compute [Compute]
    L[Lambda handler.handler]
    subgraph domains [Domain handlers in-process]
      H[identity jobs bookings payments notifications reviews]
    end
    L --> domains
  end
  subgraph data [Data]
    DDB[(DynamoDB tables)]
    S3[(S3 bucket)]
    CGO[Cognito User Pool]
  end
  Web -->|HTTPS| APIGW
  APIGW --> COG
  COG --> L
  domains --> DDB
  domains --> S3
  domains --> CGO
```

### Request path (sequence)

```mermaid
sequenceDiagram
  participant C as Client
  participant G as API Gateway
  participant L as Lambda
  participant D as DynamoDB

  C->>G: HTTP + Authorization Bearer JWT
  G->>G: Validate JWT optional routes skip
  G->>L: Invoke proxy event
  L->>L: Route by path prefix
  L->>D: Read/write domain table
  D-->>L: Result
  L-->>G: JSON response
  G-->>C: HTTP status + body
```

### Create job (sequence)

```mermaid
sequenceDiagram
  participant C as Client
  participant G as API Gateway
  participant L as Lambda
  participant J as Jobs repo
  participant D as DynamoDB jobs table
  participant B as broadcastEvent
  participant N as DynamoDB notifications

  C->>G: POST /jobs JWT
  G->>L: invoke
  L->>J: createJob
  J->>D: PutItem
  D-->>J: ok
  J-->>L: job
  L->>B: job.created envelope
  B->>N: PutItem per user idempotent
  L-->>G: 201 job
  G-->>C: 201 job
```

---

## Decoupling strategy (current)

| Style | Use in this repo |
|-------|-------------------|
| **Synchronous HTTP** | All client and integration behavior; single Lambda dispatches internally. |
| **In-process calls** | Bookings reads jobs repo; payments reads bookings repo; reviews reads bookings repo; payment hooks after booking transitions. |
| **Async message bus** | Not used. Notification delivery is **synchronous writes** to the notifications table from the same Lambda invocation. |

Future splits (e.g. multiple Lambdas or services) can reintroduce a bus or direct HTTP between units without changing the product contracts documented in [05-api-contracts.md](05-api-contracts.md).

---

## AWS services (as implemented)

| Area | Services |
|------|----------|
| **Compute** | Lambda (Node.js 20), one function for API + one for image moderation |
| **API** | API Gateway HTTP API v2 |
| **Auth** | Cognito User Pool + app client; JWT authorizer on protected routes; email verification flow |
| **Data** | DynamoDB (on-demand) per table: jobs, bookings, payments, notifications, reviews |
| **Objects** | S3 private bucket; presigned URLs from Lambda |
| **ML / safety** | Rekognition image moderation; Comprehend text toxicity detection; Bedrock (Claude Haiku) writing assistant |
| **Payments** | Stripe Payment Intents (`capture_method: manual`); `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` in SSM SecureString |
| **Config** | SSM Parameter Store (all runtime config loaded per invocation with `WithDecryption: true`) |
| **CI/CD** | CodePipeline + CodeBuild (scoped IAM, not AdministratorAccess) |
| **Grouping** | Resource Groups (tag `StackId` from Terraform provider `default_tags`) |
| **IaC** | Terraform (`infra/*.tf`) |

---

## Deployment

- **Build**: `yarn workspace gig-api build:lambda` produces `app/api/build/package`.
- **Apply**: `yarn deploy` (or `terraform apply` under `infra/`) uploads the zip and updates AWS resources.
- **Frontend env**: `scripts/update-frontend-env.sh` sets `VITE_API_URL` and `VITE_STRIPE_PUBLISHABLE_KEY` from Terraform outputs after every apply.

See root [README.md](../README.md) for commands.
