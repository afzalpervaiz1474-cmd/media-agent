# Modulate — AI automation & social media SaaS

Modulate is a full-stack Vite + React + TypeScript + Tailwind app backed by Supabase (Postgres + Auth + Storage). It is a real, opinionated content operations platform for creators and lean teams: upload once, generate AI metadata, route through approvals, then publish to YouTube, TikTok, Instagram and Facebook — with provider-confirmed status only.

## What's real

- **Real database** (Postgres via Supabase). Every action persists.
- **Real auth** (Supabase Auth: email/password + Google OAuth). Sessions restore, protected routes deny, RLS isolates per-user data.
- **Real jobs runtime.** State machine (`QUEUED → PROCESSING → WAITING_FOR_APPROVAL → COMPLETED / FAILED / CANCELLED`) with append-only event log, retries with backoff, cancellation, approvals.
- **Real AI provider adapter** (OpenRouter) that lives server-side only. Never shipped to the browser. When keys are missing, the app returns deterministic drafts (clearly labelled) instead of fabricating success.
- **Real provider configuration checks.** YouTube / TikTok / Meta requirements are surfaced as “Configuration required” with the exact env var names to add. The publish adapter refuses to fabricate provider success.

## What isn't in this build (yet, and honestly)

- The OAuth token exchange for YouTube, TikTok and Meta is not implemented in code because credentials require app registration and provider review. The UI reads real configuration state from env vars and shows exactly what's needed.
- FFmpeg / worker-side media processing is stubbed. `media.transcode` and `media.thumbnail` jobs fail with a clear message telling you to configure a worker. See **Workers** below.
- The in-process job runner executes jobs inside the API function. That's fine for AI steps and metadata; for long publish uploads and transcoding, run a dedicated worker.

## Local setup

```bash
npm install
npm run dev
```

The app expects the following env vars (see `.env` and `vercel.json`):

### Supabase (required, provided)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (frontend only)

### Google sign-in (provided by Design Arena proxy)
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_GOOGLE_AUTH_PROXY`

### AI provider (optional, but strongly recommended)
- `OPENROUTER_API_KEY` — enables real metadata / variants / thumbnail generation and the AI Helper agent.
- `OPENROUTER_MODEL` (optional) — defaults to `openai/gpt-4o-mini`.
- `OPENAI_API_KEY` — alternative provider if you plug one in.

Without these keys the UI still works end-to-end but shows a clearly labelled “draft mode” output.

### Social providers (required per-platform before publishing)
- YouTube: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI`
- TikTok: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`
- Meta (Instagram + Facebook): `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`

Documentation links are surfaced on the provider pages inside the app (`/youtube`, `/tiktok`, `/instagram`, `/facebook`).

## Data model

All tables live in Supabase Postgres with strict RLS (per-user isolation).

- `profiles(id, email, full_name, role, timezone, notif_email, notif_inapp, …)`
- `connected_accounts(id, user_id, provider, provider_account_id, handle, scopes, status, …)`
- `media_assets(id, user_id, filename, storage_path, public_url, mime_type, size_bytes, duration_sec, width, height, kind, metadata)`
- `content(id, user_id, title, topic, audience, tone, cta, platforms, description, hashtags, tags, thumbnail_concepts, platform_variants, media_asset_id, status, scheduled_for, approved_at, …)`
- `automations(id, user_id, name, description, trigger_type, schedule_cron, status, approval_required, config, run_count, last_run_at, …)`
- `automation_steps(id, automation_id, position, kind, name, config)`
- `jobs(id, user_id, automation_id, content_id, kind, status, progress, input, output, error, attempts, max_attempts, scheduled_for, started_at, finished_at, …)`
- `job_events(id, job_id, level, message, data, created_at)`
- `ai_conversations(id, user_id, title, context)`
- `ai_messages(id, conversation_id, user_id, role, content, tool_calls, metadata)`
- `notifications(id, user_id, kind, title, body, link, read_at)`
- `audit_logs(id, user_id, action, target_type, target_id, data)`

Storage bucket: `media` (public, 500 MB limit).

## Routes

Public: `/`, `/login`, `/signup`.

Authenticated (all protected by `ProtectedRoute`):
- `/dashboard`
- `/content`, `/content/new`, `/content/:id`
- `/uploads`
- `/accounts`, `/youtube`, `/tiktok`, `/instagram`, `/facebook`
- `/automations`, `/automations/new`, `/automations/:id`
- `/jobs`, `/jobs/:id`
- `/ai-helper`
- `/settings`, `/settings/profile`, `/settings/security`, `/settings/notifications`
- `*` → `NotFound`

All routes support refresh and deep-linking (SPA rewrite in `vercel.json`).

## API routes (Vercel serverless functions)

All require `Authorization: Bearer <supabase_access_token>` (via `apiFetch`) except `/api/health` and `POST /api/me` (called during signup).

- `GET /api/health`
- `GET/POST/PUT /api/me`
- `GET /api/dashboard`
- `GET/POST /api/content`, `GET/PUT/DELETE /api/content/:id`, `POST /api/content/:id/publish`
- `GET/POST /api/media`, `DELETE /api/media/:id`
- `GET/DELETE /api/accounts`
- `GET/POST /api/automations`, `GET/PUT/DELETE /api/automations/:id`, `POST /api/automations/:id/run`
- `GET /api/jobs`, `GET /api/jobs/:id`, `POST /api/jobs/:id/approve|cancel|retry|run`
- `POST /api/ai/generate` (metadata | variants | thumbnails)
- `GET/POST /api/ai/chat`, `GET/POST /api/ai/chat/:id`
- `GET/POST/PUT /api/notifications`

## Workers (recommended for production)

The current setup runs jobs inside the request that triggered them (fine for AI-only, up to ~10s). For real production usage of publish + FFmpeg jobs, wire a background worker:

1. Redis + BullMQ (or SQS, Cloud Tasks, etc).
2. Enqueue by inserting into `jobs` (already done); a worker process polls or subscribes to the queue.
3. Worker uses `api/_jobs.js#runJob` as the executor. Because state lives in Postgres, the worker just needs the job id.
4. FFmpeg / thumbnail extraction adapters go in `api/_media.js` (create it) using `fluent-ffmpeg`.

## Security

- Supabase Auth handles password hashing (bcrypt) and secure httpOnly-style tokens through its client SDK.
- Passwords are never stored by this app.
- Service-role key stays server-side.
- Every user-scoped table has RLS enforcing `auth.uid() = user_id`.
- API routes verify the bearer token via `supabase.auth.getUser(token)` before any DB access.
- CORS is permissive (this is a fullstack SPA on one origin); headers `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` are set on every response.
- `api/_auth.js#safeError` redacts obvious secret patterns before returning error messages.
- Uploads are MIME + size validated on both client and API.
- Every write goes through an `audit_logs` insert.

## Scripts

- `npm run dev` — local dev
- `npm run build` — typecheck + production build
- `npm run lint` — ESLint
- `npm run preview` — preview the built app

## Test account

A demo account is seeded automatically:

- Email: `demo@modulate.app`
- Password: `demo1234!`

Sign in with those credentials to see real content, jobs, automations and notifications loaded from Postgres.
