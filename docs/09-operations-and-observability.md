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
