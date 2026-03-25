# Frontend

React app for the gig platform: register/login (Cognito via identity API), list and create jobs, publish drafts, and manage bookings.

## Setup

```bash
yarn install
cp .env.example .env
```

After a deploy from repo root, `VITE_API_URL` is set automatically in `.env` by `scripts/update-frontend-env.sh`. To set it manually (e.g. before first deploy), use the value from `terraform output api_url`.

## Run

```bash
yarn dev
```

Open http://localhost:5173. Register or log in; then list jobs, post a job (draft), open the job and click “Publish job” to publish. From a published job you can “Book this job”; **My bookings** lists your bookings as worker or client (confirm, complete, cancel). Poster email is shown when you open a job detail. All API calls require a valid JWT (sent automatically after login).

## Build

```bash
yarn build
```

Output in `dist/`. Serve with any static host; ensure `VITE_API_URL` is set at build time so the app can call the API.
