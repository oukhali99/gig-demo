# Terraform CI (CodeBuild) and `tf-init-ci.sh`

## Two different env mechanisms

1. **`terraform init` (remote backend)** — `scripts/tf-init-ci.sh` reads non-Terraform env vars and passes them as `-backend-config=...`:
   - `TF_STATE_BUCKET`, `TF_STATE_KEY`, `TF_LOCK_TABLE`, `TF_BACKEND_REGION` (or `AWS_DEFAULT_REGION` / `AWS_REGION`)

2. **`terraform apply`** — root module variables come from **`TF_VAR_<variable_name>`** (same spelling as `variables.tf`, including underscores). No `-var-file` in CI.

## `terraform_lock_table` must appear twice in `pipeline.tf`

- **`TF_LOCK_TABLE`** — used only by `tf-init-ci.sh` for backend `dynamodb_table=`
- **`TF_VAR_terraform_lock_table`** — same table name as a root input for `terraform apply`

If you add one and omit the other, init can succeed while apply fails with _"No value for required variable terraform_lock_table"_.

## Checklist when changing CI Terraform

- Editing `tf-init-ci.sh`: keep backend env names aligned with `pipeline.tf` and document new required env vars in README
- Adding a **required** variable in `variables.tf`: add matching `TF_VAR_...` to `aws_codebuild_project.deploy` in `pipeline.tf` unless it has a default CI should use
- `yarn deploy:ci` in `package.json` runs init then apply with no tfvars — all required inputs must arrive via CodeBuild env
