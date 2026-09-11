-- Liftee: initial schema
-- Paste this into your Supabase project's SQL editor once, after creating
-- the project (see README.md). Safe to run once; re-running will error on
-- the "already exists" objects rather than silently duplicating anything.

-- ============================================================
-- profiles: cross-device app preferences + onboarding flags.
-- Readable/writable by the owning user via normal RLS — no
-- service-role access is needed for this table.
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  unit text not null default 'kg' check (unit in ('kg','lb')),
  rest_default_seconds integer not null default 90,
  unit_setup_done boolean not null default false,
  import_prompted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- No insert/delete policy for authenticated: rows are created only by the
-- trigger below and never deleted directly by end users.

-- Auto-create a profile row the moment someone signs up. Runs as the
-- table owner (security definer), so this needs no service-role key.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at current on every profile edit.
create function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================
-- google_connections: holds the Google refresh token and the
-- chosen spreadsheet. NEVER exposed to the anon/authenticated
-- client roles — only Cloudflare Pages Functions using the
-- service-role key may read or write this table. The frontend
-- asks a Function (/api/google/status) for a redacted view
-- instead of querying this table directly.
-- ============================================================
create table public.google_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  spreadsheet_id text,
  spreadsheet_name text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_connections enable row level security;

-- Zero policies + enabled RLS already default-denies anon/authenticated on
-- every operation; the explicit revoke removes any ambiguity if a future
-- migration ever adds a policy here by mistake.
revoke all on public.google_connections from anon, authenticated;

create trigger google_connections_set_updated_at
  before update on public.google_connections
  for each row execute function public.set_updated_at();
