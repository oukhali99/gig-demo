# Frontend (React SPA)

**Vite + React + TypeScript** single-page app for the gig platform: auth, job listing and detail, drafts, bookings, and optional admin views. Calls the **same API Gateway** base URL as the Lambdas (`VITE_API_URL`).

---

## Stack

- React 18, React Router 6
- No global state library; `AuthContext` holds JWT + user from `/auth/me`
- API client in `src/api.ts` (fetch + `Authorization` header)

---

## Routes (high level)

| Path | Purpose |
|------|---------|
| `/` | Published jobs list (auth required in current app). |
| `/login`, `/register` | Cognito-backed auth via identity service. |
| `/jobs/new` | Create draft job. |
| `/jobs/:id` | Job detail; owner can publish draft, **delete draft**, add photos; workers can book when published. |
| `/drafts` | User’s draft jobs. |
| `/bookings` | User’s bookings + actions. |
| `/admin` | If `isAdmin` from `/auth/me`, overview tables (when enabled in backend). |

---

## Environment

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | API Gateway stage URL (no trailing slash required). Set by `scripts/update-frontend-env.sh` after deploy. |

---

## Build

```bash
cd app/frontend
yarn install   # if not hoisted from root
yarn build     # tsc -b && vite build → dist/
```

The frontend is **not** in the root Yarn workspaces list; build it separately or add it to workspaces if you want `yarn build` at root to include it.

---

## Related docs

- [API contracts](../../../docs/05-api-contracts.md)
- [Product / domain](../../../docs/01-product-and-domain.md)
