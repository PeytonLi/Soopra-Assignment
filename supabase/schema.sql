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

create table if not exists public.pickup_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text not null,
  customer_name text not null,
  pickup_time text not null,
  status text not null default 'submitted',
  items jsonb not null default '[]'::jsonb,
  total_nutrition jsonb not null default '{}'::jsonb,
  allergy_warnings jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '{}'::jsonb
);

create index if not exists pickup_orders_created_at_idx
  on public.pickup_orders (created_at desc);

create index if not exists pickup_orders_status_idx
  on public.pickup_orders (status);

alter table public.pickup_orders enable row level security;

create policy "service role can manage pickup orders"
  on public.pickup_orders
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
