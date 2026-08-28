-- Adds transactions without changing existing tables.
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  description text not null check (char_length(trim(description)) > 0),
  amount numeric(14,2) not null check (amount > 0),
  transaction_type text not null check (transaction_type in ('income', 'expense')),
  category_id uuid references public.categories(id) on delete set null,
  account_id uuid not null references public.accounts(id) on delete restrict,
  transaction_date date not null,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_workspace_date_idx on public.transactions (workspace_id, transaction_date desc);
create index if not exists transactions_account_id_idx on public.transactions (account_id);
create index if not exists transactions_category_id_idx on public.transactions (category_id);

alter table public.transactions enable row level security;

create policy "Workspace members can view transactions" on public.transactions
  for select to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = transactions.workspace_id and wm.user_id = auth.uid()));

create policy "Workspace members can insert transactions" on public.transactions
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (select 1 from public.workspace_members wm where wm.workspace_id = transactions.workspace_id and wm.user_id = auth.uid())
    and exists (select 1 from public.accounts a where a.id = transactions.account_id and a.workspace_id = transactions.workspace_id)
    and (transactions.category_id is null or exists (select 1 from public.categories c where c.id = transactions.category_id and c.workspace_id = transactions.workspace_id))
  );

create policy "Workspace members can update transactions" on public.transactions
  for update to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = transactions.workspace_id and wm.user_id = auth.uid()))
  with check (
    exists (select 1 from public.workspace_members wm where wm.workspace_id = transactions.workspace_id and wm.user_id = auth.uid())
    and exists (select 1 from public.accounts a where a.id = transactions.account_id and a.workspace_id = transactions.workspace_id)
    and (transactions.category_id is null or exists (select 1 from public.categories c where c.id = transactions.category_id and c.workspace_id = transactions.workspace_id))
  );

create policy "Workspace members can delete transactions" on public.transactions
  for delete to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = transactions.workspace_id and wm.user_id = auth.uid()));

create or replace function public.set_transaction_audit_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.workspace_id := old.workspace_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_transactions_audit_fields before update on public.transactions
  for each row execute function public.set_transaction_audit_fields();
