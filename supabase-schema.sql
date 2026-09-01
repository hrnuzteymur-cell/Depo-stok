create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.workspace_state (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_state enable row level security;

revoke all on public.workspaces, public.workspace_members, public.workspace_state from anon;
grant select on public.workspaces, public.workspace_members, public.workspace_state to authenticated;
grant insert, update on public.workspace_state to authenticated;

create policy "members read workspaces" on public.workspaces
for select to authenticated using (
  exists (select 1 from public.workspace_members m where m.workspace_id = id and m.user_id = auth.uid())
);

create policy "members read memberships" on public.workspace_members
for select to authenticated using (
  exists (select 1 from public.workspace_members mine where mine.workspace_id = workspace_id and mine.user_id = auth.uid())
);

create policy "members read state" on public.workspace_state
for select to authenticated using (
  exists (select 1 from public.workspace_members m where m.workspace_id = workspace_id and m.user_id = auth.uid())
);

create policy "editors update state" on public.workspace_state
for update to authenticated using (
  exists (select 1 from public.workspace_members m where m.workspace_id = workspace_id and m.user_id = auth.uid() and m.role in ('owner','editor'))
) with check (
  exists (select 1 from public.workspace_members m where m.workspace_id = workspace_id and m.user_id = auth.uid() and m.role in ('owner','editor'))
);

create or replace function public.create_workspace(workspace_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  insert into public.workspaces(name, owner_id) values (trim(workspace_name), auth.uid()) returning id into new_id;
  insert into public.workspace_members(workspace_id, user_id, role) values (new_id, auth.uid(), 'owner');
  insert into public.workspace_state(workspace_id, payload, updated_by) values (new_id, '{}'::jsonb, auth.uid());
  return new_id;
end;
$$;

revoke all on function public.create_workspace(text) from public, anon;
grant execute on function public.create_workspace(text) to authenticated;
