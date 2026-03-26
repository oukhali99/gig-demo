# Operations and observability

## Deploy and destroy

| Action | Command |
|--------|---------|
| Install deps | `yarn` at repo root |
| Build TypeScript | `yarn build` |
| Build Lambda zip | `yarn workspace gig-api build:lambda` |
| Apply infra + update frontend `.env` | `yarn deploy` |
| Dev environment | `yarn deploy:dev` (Terraform `environment=dev`) |
| Destroy | `yarn destroy` |

Terraform outputs (`infra/outputs.tf`):

- `api_url` — base URL for the HTTP API
- `cognito_user_pool_id`, `cognito_client_id`
- `resource_group_name`, `stack_id_tag` — for console grouping (tags from `providers.tf` `default_tags`)

---

## Logging

- Lambda sends logs to **CloudWatch Logs** (`/aws/lambda/<function-name>`).
- **`ENVIRONMENT=dev`** (Terraform variable) enables verbose `devLog` JSON lines from `app/api/src/lib/logger.ts`.

---

## AI tooling notes

- Development uses Cursor AI + LLM assistance for implementation speed and documentation quality.
- Runtime uses AWS AI services for moderation:
  - **Comprehend** for text toxicity checks.
  - **Rekognition** for image moderation checks.
- S3 image uploads (`jobs/` and `bookings/` prefixes) trigger a dedicated Lambda (`image-moderation-handler`) to moderate new objects immediately after upload.
- Image keys are attached immediately after upload; image URL endpoints only return URLs for moderation-approved objects and return `null` for pending/removed ones.
- Raw S3 image reads are blocked for viewers: `job_images` bucket serves reads via CloudFront OAC only, and only when object tag `moderation=approved`.
- Both Lambda functions (`api` and `image-moderation-handler`) receive shared runtime config via SSM (`SSM_PARAMETER_PATH` + TTL cache), so future shared config reads work consistently.
- Keep model thresholds and moderation behavior documented when changed.

---

## Metrics and alarms

- Not defined in Terraform in this repo. Recommended later: Lambda errors/throttles, API Gateway `5XX`, DynamoDB throttling (on-demand rarely needs it at small scale).

---

## Tracing

- AWS X-Ray not enabled on the function in current Terraform; add `tracing_config` if you need distributed traces.

---

## Resource grouping

- Provider **`default_tags`** set `StackId`, `Environment`, `ManagedBy` on taggable resources.
- **`aws_resourcegroups_group.stack`** (`infra/resourcegroups.tf`) defines a saved group in the AWS console filtered by `StackId`.

---

## Disaster recovery

- RPO/RTO not formalized for this demo. For production: enable point-in-time recovery on DynamoDB if required, S3 versioning/lifecycle as needed, and document restore runbooks.
