-- Goals V1: logical saving targets, intentionally isolated from financial transactions.
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  name text not null check (char_length(trim(name)) > 0),
  target_amount numeric(14,2) not null check (target_amount > 0),
  target_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  goal_id uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  amount numeric(14,2) not null check (amount > 0),
  contribution_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, goal_id) references public.goals(workspace_id, id) on delete cascade
);

create index goals_workspace_status_idx on public.goals(workspace_id, status);
create index goal_contributions_goal_date_idx on public.goal_contributions(goal_id, contribution_date desc);
create index goal_contributions_workspace_idx on public.goal_contributions(workspace_id);

create or replace function public.set_goal_audit_fields()
returns trigger language plpgsql set search_path = '' as $$
declare v_saved numeric(14,2);
begin
  new.workspace_id := old.workspace_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  if new.status <> 'cancelled' then
    select coalesce(sum(gc.amount), 0)::numeric(14,2) into v_saved
    from public.goal_contributions gc where gc.goal_id = old.id and gc.workspace_id = old.workspace_id;
    new.status := case when v_saved >= new.target_amount then 'completed' else 'active' end;
  end if;
  return new;
end;
$$;
create trigger set_goal_audit_fields before update on public.goals
  for each row execute function public.set_goal_audit_fields();

create or replace function public.sync_goal_status_from_contributions()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_goal_id uuid; v_workspace_id uuid; v_saved numeric(14,2);
begin
  v_goal_id := case when tg_op = 'DELETE' then old.goal_id else new.goal_id end;
  v_workspace_id := case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end;
  select coalesce(sum(gc.amount), 0)::numeric(14,2) into v_saved
  from public.goal_contributions gc where gc.goal_id = v_goal_id and gc.workspace_id = v_workspace_id;
  update public.goals g set status = case when v_saved >= g.target_amount then 'completed' else 'active' end
  where g.id = v_goal_id and g.workspace_id = v_workspace_id and g.status <> 'cancelled';
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger sync_goal_status_after_contribution after insert or update or delete on public.goal_contributions
  for each row execute function public.sync_goal_status_from_contributions();

create or replace function public.validate_goal_contribution()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.workspace_id := old.workspace_id; new.goal_id := old.goal_id;
    new.created_by := old.created_by; new.created_at := old.created_at;
  end if;
  if not exists (select 1 from public.goals g where g.id = new.goal_id and g.workspace_id = new.workspace_id) then
    raise exception 'Goal must belong to the contribution workspace';
  end if;
  return new;
end;
$$;
create trigger validate_goal_contribution before insert or update on public.goal_contributions
  for each row execute function public.validate_goal_contribution();

alter table public.goals enable row level security;
alter table public.goal_contributions enable row level security;

create policy "Members can view goals" on public.goals for select to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = goals.workspace_id and wm.user_id = auth.uid()));
create policy "Members can insert goals" on public.goals for insert to authenticated with check (created_by = auth.uid() and status = 'active' and exists (select 1 from public.workspace_members wm where wm.workspace_id = goals.workspace_id and wm.user_id = auth.uid()));
create policy "Members can update goals" on public.goals for update to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = goals.workspace_id and wm.user_id = auth.uid())) with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = goals.workspace_id and wm.user_id = auth.uid()));
create policy "Direct goal deletes are denied" on public.goals for delete to authenticated using (false);

create policy "Members can view goal contributions" on public.goal_contributions for select to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = goal_contributions.workspace_id and wm.user_id = auth.uid()));
create policy "Members can insert goal contributions" on public.goal_contributions for insert to authenticated with check (created_by = auth.uid() and exists (select 1 from public.workspace_members wm where wm.workspace_id = goal_contributions.workspace_id and wm.user_id = auth.uid()) and exists (select 1 from public.goals g where g.id = goal_id and g.workspace_id = goal_contributions.workspace_id and g.status <> 'cancelled'));
create policy "Members can update goal contributions" on public.goal_contributions for update to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = goal_contributions.workspace_id and wm.user_id = auth.uid())) with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = goal_contributions.workspace_id and wm.user_id = auth.uid()));
create policy "Members can delete goal contributions" on public.goal_contributions for delete to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = goal_contributions.workspace_id and wm.user_id = auth.uid()));
