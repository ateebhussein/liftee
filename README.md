# Liftee

A workout tracker that syncs every set you log straight to a Google Sheet
in your own Drive — with rest timers, warm-up sets, workout history, and a
Strong-CSV importer. Liftee itself has no database of your workout data; it
only ever talks to the Google Sheet you connect.

Anyone can sign up for their own account. Each account connects its own
Google Sheet — nobody else's data is ever visible to another account.

## How it's built

- **Frontend**: a single `index.html` (no build step, no framework) hosted
  on **Cloudflare Pages**.
- **Backend**: a handful of serverless **Cloudflare Pages Functions** under
  `functions/api/google/`, same-origin with the frontend. They broker
  Google OAuth tokens and never see your workout data.
- **Accounts**: **Supabase** (email/password auth + a small Postgres
  database) holds your account, your app preferences, and your encrypted
  Google connection.
- **Your workout data**: lives only in the Google Sheet you create or pick —
  Liftee's own database never stores it.

Google access is intentionally narrow: the OAuth scope is `drive.file`
only, which means Liftee can only ever see the one sheet you create or
explicitly pick — never your whole Drive.

Setup takes about 20-30 minutes across three free accounts (Supabase,
Google Cloud, Cloudflare) and is a one-time thing.

---

## 1. Supabase — accounts + database

1. Create a project at [supabase.com](https://supabase.com) (free tier is
   plenty).
2. Open the **SQL Editor** and run the contents of
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
   This creates two tables:
   - `profiles` — your app preferences (units, rest timer default,
     onboarding flags). Readable/writable only by you, via Row Level
     Security.
   - `google_connections` — holds your Google refresh token and chosen
     spreadsheet. Locked down so **no** client (not even your own logged-in
     browser) can read or write it directly — only the Pages Functions can,
     using the service role key from step 4.
3. Go to **Authentication → Sign In / Providers** and confirm **Email**
   is enabled with **Confirm email** turned on (this is Liftee's default —
   new users must click a confirmation link before they can log in).
4. Go to **Authentication → URL Configuration** and set:
   - **Site URL**: your Cloudflare Pages production URL (you'll get this
     in step 3 below — come back and set it once you know it).
   - **Redirect URLs**: add the same URL.
5. Go to **Project Settings → API** and copy three values for later:
   - **Project URL** (`SUPABASE_URL`)
   - **anon / public key** (`SUPABASE_ANON_KEY`) — safe to expose in the
     frontend, protected by Row Level Security.
   - **service_role key** (`SUPABASE_SERVICE_ROLE_KEY`) — **secret**, never
     put this in `index.html` or any client-reachable file. It's only used
     by the Pages Functions, set as a Cloudflare secret in step 4.

## 2. Google Cloud — OAuth + Picker

1. In the [Google Cloud Console](https://console.cloud.google.com), use an
   existing project or create one.
2. **Enable APIs**: Google Sheets API, Google Drive API, and **Google
   Picker API**.
3. **OAuth Client**: under APIs & Services → Credentials, create (or reuse)
   an OAuth 2.0 Client ID of type **Web application**.
   - Copy the **Client ID** (`GOOGLE_CLIENT_ID`) and **Client Secret**
     (`GOOGLE_CLIENT_SECRET` — secret, Cloudflare-only, see step 4).
   - Leave **Authorized redirect URIs** and **Authorized JavaScript
     origins** for now — you'll add the real Pages URL in step 3.
4. **Picker API key**: under Credentials, create an **API key**.
   - Restrict it: **Application restrictions → HTTP referrers**, add your
     Pages production URL (again, come back once you know it).
   - **API restrictions** → restrict it to **Google Picker API** only.
   - This key (`PICKER_API_KEY`) is safe to put directly in `index.html` —
     it's not a secret like the Client Secret, it's locked to your domain
     and to one narrow API.

## 3. Cloudflare Pages — hosting + backend

1. Push this repo to GitHub (private, as already set up), then in the
   [Cloudflare dashboard](https://dash.cloudflare.com) create a **Pages**
   project connected to it.
   - Build command: none.
   - Build output directory: `/` (repo root — `index.html` lives there).
   - Cloudflare auto-detects `functions/` at the repo root and deploys
     each route under `functions/api/google/*.js` as `/api/google/*`.
2. Once deployed, copy the project's `*.pages.dev` URL (or your custom
   domain, if you attach one) — this is `PUBLIC_SITE_URL`. Go back and:
   - Set it as **Site URL** and a **Redirect URL** in Supabase (step 1.4).
   - Add `PUBLIC_SITE_URL` (as an Authorized JavaScript origin) and
     `{PUBLIC_SITE_URL}/api/google/callback` (as an Authorized redirect
     URI) to the Google OAuth Client (step 2.3).
   - Set it as the HTTP referrer restriction on the Picker API key (step
     2.4).
3. In the Pages project's **Settings → Environment variables**, add:
   - Plain variables: `GOOGLE_CLIENT_ID`, `SUPABASE_URL`,
     `SUPABASE_ANON_KEY`, `PUBLIC_SITE_URL` (same values as
     `wrangler.toml`'s `[vars]` — either edit that file and redeploy, or
     set them in the dashboard, both work).
   - **Secrets** (mark as "Encrypt" / use `wrangler pages secret put` from
     the CLI): `GOOGLE_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, and
     `STATE_SIGNING_SECRET` (any long random string you generate yourself —
     e.g. `openssl rand -base64 32` — used to sign the OAuth `state`
     parameter so `/api/google/callback` can trust which account is
     connecting).
4. Redeploy after setting the variables (Pages picks up new env vars on
   the next deploy).

## 4. Wire the frontend

In `index.html`, near the top of the `<script>` block, fill in:
```js
const SUPABASE_URL = "...";          // from step 1.5
const SUPABASE_ANON_KEY = "...";     // from step 1.5
const PICKER_API_KEY = "...";        // from step 2.4
```
Commit and push — Cloudflare Pages redeploys automatically.

## That's it

Sign up, confirm your email, log in, connect Google (you'll see Google's
consent screen — this happens once per account, by design, so a refresh
token is reliably issued), then create a new sheet or pick an existing one.
From then on, logging in on any device skips straight past both Google
screens to Home.

## If something goes wrong

- **"Setup needed" banner on the login screen**: `SUPABASE_URL` or
  `SUPABASE_ANON_KEY` in `index.html` still has a placeholder value.
- **"Backend not configured yet" / Google button does nothing**: same as
  above, or the Pages environment variables from step 3.3 aren't set yet.
- **`redirect_uri_mismatch` from Google**: the Authorized redirect URI in
  Google Cloud Console doesn't exactly match
  `{PUBLIC_SITE_URL}/api/google/callback` — check for a trailing slash or
  `http` vs `https` mismatch.
- **Picker doesn't open / silently fails**: check the Picker API key's
  HTTP referrer restriction matches your exact Pages domain, and that the
  Google Picker API is enabled (step 2.2).
- **Stuck signed in but reload shows the wrong screen**: check your
  browser console for an error, and `wrangler pages deployment tail` for
  the Functions' own logs while you reproduce it.
- **A user's Google access gets revoked externally** (e.g. they remove
  Liftee's access in their Google Account settings): the next sheet sync
  automatically detects this and routes them back to "Connect Google
  Sheets" — no manual recovery needed.
