create table if not exists public.assistant_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists assistant_events_created_at_idx
  on public.assistant_events (created_at desc);

create index if not exists assistant_events_event_type_idx
  on public.assistant_events (event_type);

alter table public.assistant_events enable row level security;

create policy "service role can manage assistant events"
  on public.assistant_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
