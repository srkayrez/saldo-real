-- Budgets V1: monthly category spending plans.
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  reference_month date not null check (reference_month = date_trunc('month', reference_month)::date),
  limit_amount numeric(14,2) not null check (limit_amount >= 0),
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, category_id, reference_month)
);

create index budgets_workspace_month_idx on public.budgets(workspace_id, reference_month);

create or replace function public.validate_budget_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.workspace_id := old.workspace_id;
    new.category_id := old.category_id;
    new.reference_month := old.reference_month;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  if not exists (
    select 1 from public.categories c
    where c.id = new.category_id and c.workspace_id = new.workspace_id
  ) then raise exception 'Category must belong to the budget workspace'; end if;
  return new;
end;
$$;

create trigger validate_budget_fields before insert or update on public.budgets
  for each row execute function public.validate_budget_fields();

alter table public.budgets enable row level security;
create policy "Members can view budgets" on public.budgets for select to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = budgets.workspace_id and wm.user_id = auth.uid()));
create policy "Members can insert budgets" on public.budgets for insert to authenticated
  with check (created_by = auth.uid() and exists (select 1 from public.workspace_members wm where wm.workspace_id = budgets.workspace_id and wm.user_id = auth.uid()));
create policy "Members can update budgets" on public.budgets for update to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = budgets.workspace_id and wm.user_id = auth.uid()))
  with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = budgets.workspace_id and wm.user_id = auth.uid()));
create policy "Members can delete budgets" on public.budgets for delete to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = budgets.workspace_id and wm.user_id = auth.uid()));
