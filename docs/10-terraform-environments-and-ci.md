# Terraform environments, state, and CI

This doc explains **why** dev and prod share one `infra/` tree without Terraform workspaces, and how init lines up with apply—so reviewers see deliberate design, not accidental sameness.

---

## One module tree, two environments

**Decision:** A single Terraform root module describes the whole stack. Environment differences are **input variables** (`environment`, URLs, optional keys) plus **where state is stored**, not separate copies of `.tf` files.

**Why it helps**

- Drift between “dev Terraform” and “prod Terraform” is a common failure mode. One module forces every change to apply to both paths the same way.
- Code review stays focused: you review **one** graph of resources.
- Promotion is “same code, different tfvars + backend,” not a merge of two folders.

**Tradeoff:** You must be disciplined about **never** applying prod with dev tfvars (or vice versa). Scripts and CI encode the pairing (see below).

---

## Backend re-configuration (`-reconfigure`)

Remote state is determined at **`terraform init`**, not in `.tf` files (bucket, state key, lock table, region).

We always run:

```bash
terraform init -input=false -reconfigure -backend-config=...
```

**`-reconfigure`** matters when you switch environments on the same machine (or when CI reuses a workspace directory): Terraform discards the previous backend settings and applies the new `-backend-config` values. Without it, init can silently keep pointing at the **wrong** state file—dangerous for prod.

So:

- **Local prod:** `yarn tf:init` → `terraform-backend.prod.hcl`
- **Local dev:** `yarn tf:init:dev` → `terraform-backend.dev.hcl`
- **CI:** `yarn tf:init:ci` → `scripts/tf-init-ci.sh` passes `TF_STATE_BUCKET`, `TF_STATE_KEY`, `TF_LOCK_TABLE`, etc. (no committed `.hcl` in the build image)

Same `.tf` files; **different state backends** = isolated state per environment.

---

## Pairing backend with tfvars

The **state key** and **DynamoDB lock table** name must match what you pass to `terraform apply`:

| Path | Init | Apply |
|------|------|--------|
| Prod (local) | `terraform-backend.prod.hcl` | `-var-file=terraform.prod.tfvars` |
| Dev (local) | `terraform-backend.dev.hcl` | `-var-file=terraform.dev.tfvars` |
| CI | env from CodeBuild | `TF_VAR_*` only (no `-var-file`) |

`terraform_state_bucket`, `terraform_state_key`, and `terraform_lock_table` in tfvars should stay aligned with the backend config for that environment (documented in the root README and `.cursor` Terraform CI note).

---

## CI vs laptop

**CodeBuild** does not rely on gitignored `terraform-backend.*.hcl` or `terraform.*.tfvars`. `tf-init-ci.sh` reads **non-Terraform** env vars (`TF_STATE_BUCKET`, …) and passes them as `-backend-config=...`; apply uses **`TF_VAR_...`** for all root module variables.

**Locally**, developers use committed **examples** and copy to gitignored real files—secrets and account-specific names never need to live in the repo.

That split is intentional: **CI is reproducible from env alone**; **local dev is ergonomic with static files**.

---

## Diagram workflow (draw.io)

- **Source:** `docs/AWS Architecture.drawio` (AWS icon shapes, editable in [diagrams.net](https://app.diagrams.net/)).
- **README image:** export **File → Export as → SVG** to `docs/AWS Architecture.drawio.svg`; the root `README.md` embeds that file for GitHub.

---

## Related

- Root [README.md](../README.md) — deploy commands, CodeBuild env table.
- [03-architecture-overview.md](03-architecture-overview.md) — runtime behavior and Mermaid diagrams.
- [infra/pipeline.tf](../infra/pipeline.tf) — CodeBuild `environment_variable` wiring for `TF_VAR_*` and init.
