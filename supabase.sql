-- Run once in Supabase → SQL Editor → New query.
create table if not exists public.records (
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  id text not null,
  kind text not null,
  data jsonb not null default '{}',
  deleted boolean not null default false,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists records_pull_idx on public.records (user_id, server_updated_at);

alter table public.records enable row level security;

drop policy if exists "own rows" on public.records;
create policy "own rows" on public.records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Stamp server time for pulls; keep the newer client edit when two devices race.
create or replace function public.records_stamp() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists records_stamp on public.records;
create trigger records_stamp before insert or update on public.records
  for each row execute function public.records_stamp();
