-- Recurrences V1: rules materialize independent transaction occurrences.
create table public.recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  name text not null check (char_length(trim(name)) > 0),
  transaction_type text not null check (transaction_type in ('income', 'expense')),
  category_id uuid references public.categories(id) on delete set null,
  account_id uuid not null references public.accounts(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  amount_type text not null default 'fixed' check (amount_type in ('fixed', 'estimated')),
  frequency text not null default 'monthly' check (frequency in ('monthly')),
  day_of_month integer not null check (day_of_month between 1 and 31),
  start_date date not null,
  end_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  check (end_date is null or end_date >= start_date)
);

create index recurrence_rules_workspace_active_idx on public.recurrence_rules(workspace_id, active);

alter table public.transactions
  add column recurrence_rule_id uuid references public.recurrence_rules(id) on delete restrict,
  add column recurrence_reference_month date;

alter table public.transactions drop constraint if exists transactions_origin_check;
alter table public.transactions
  add constraint transactions_origin_check check (origin in ('manual', 'card_invoice_payment', 'recurrence'));
alter table public.transactions drop constraint if exists transactions_card_origin_reference_check;
alter table public.transactions
  add constraint transactions_origin_reference_check check (
    (origin = 'manual' and card_invoice_id is null and recurrence_rule_id is null and recurrence_reference_month is null)
    or (origin = 'card_invoice_payment' and card_invoice_id is not null and recurrence_rule_id is null and recurrence_reference_month is null)
    or (origin = 'recurrence' and card_invoice_id is null and recurrence_rule_id is not null
      and recurrence_reference_month = date_trunc('month', recurrence_reference_month)::date)
  );

create unique index transactions_recurrence_occurrence_key
  on public.transactions(recurrence_rule_id, recurrence_reference_month)
  where recurrence_rule_id is not null;

create or replace function public.validate_recurrence_rule_relations()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.workspace_id := old.workspace_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  if not exists (select 1 from public.accounts a where a.id = new.account_id and a.workspace_id = new.workspace_id) then
    raise exception 'Account must belong to the recurrence workspace';
  end if;
  if new.category_id is not null and not exists (
    select 1 from public.categories c where c.id = new.category_id and c.workspace_id = new.workspace_id
  ) then raise exception 'Category must belong to the recurrence workspace'; end if;
  return new;
end;
$$;

create trigger validate_recurrence_rule_relations before insert or update on public.recurrence_rules
  for each row execute function public.validate_recurrence_rule_relations();

alter table public.recurrence_rules enable row level security;
create policy "Members can view recurrence rules" on public.recurrence_rules for select to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = recurrence_rules.workspace_id and wm.user_id = auth.uid()));
create policy "Members can insert recurrence rules" on public.recurrence_rules for insert to authenticated
  with check (created_by = auth.uid() and exists (select 1 from public.workspace_members wm where wm.workspace_id = recurrence_rules.workspace_id and wm.user_id = auth.uid()));
create policy "Members can update recurrence rules" on public.recurrence_rules for update to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = recurrence_rules.workspace_id and wm.user_id = auth.uid()))
  with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = recurrence_rules.workspace_id and wm.user_id = auth.uid()));

create or replace function public.set_transaction_audit_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.origin not in ('manual', 'recurrence') then raise exception 'Generated transactions cannot be updated directly'; end if;
  if old.status = 'paid' then raise exception 'Paid transactions cannot be edited directly'; end if;
  if old.status = 'cancelled' then raise exception 'Cancelled transactions cannot be edited directly'; end if;
  if new.status not in ('pending', 'paid', 'cancelled') then raise exception 'Invalid transaction status'; end if;
  if new.status = 'paid' and new.paid_date is null then raise exception 'Payment date is required for paid transactions'; end if;
  if new.status in ('pending', 'cancelled') then new.paid_date := null; end if;
  new.workspace_id := old.workspace_id;
  new.created_by := old.created_by;
  new.origin := old.origin;
  new.card_invoice_id := old.card_invoice_id;
  new.recurrence_rule_id := old.recurrence_rule_id;
  new.recurrence_reference_month := old.recurrence_reference_month;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.ensure_recurrence_occurrences(p_workspace_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_rule public.recurrence_rules%rowtype;
  v_month date;
  v_date date;
  v_last_day integer;
  v_created integer := 0;
  v_inserted integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.workspace_members wm where wm.workspace_id = p_workspace_id and wm.user_id = auth.uid()) then
    raise exception 'Workspace is inaccessible';
  end if;
  for v_rule in select * from public.recurrence_rules where workspace_id = p_workspace_id and active = true loop
    for v_month in select (date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) + make_interval(months => n))::date from generate_series(0, 3) n loop
      v_last_day := extract(day from (v_month + interval '1 month - 1 day'))::integer;
      v_date := make_date(extract(year from v_month)::integer, extract(month from v_month)::integer, least(v_rule.day_of_month, v_last_day));
      if v_date >= v_rule.start_date and (v_rule.end_date is null or v_date <= v_rule.end_date) then
        insert into public.transactions (
          workspace_id, created_by, description, amount, transaction_type, category_id,
          account_id, transaction_date, paid_date, status, notes, origin,
          recurrence_rule_id, recurrence_reference_month
        ) values (
          v_rule.workspace_id, v_rule.created_by, v_rule.name, v_rule.amount, v_rule.transaction_type,
          v_rule.category_id, v_rule.account_id, v_date, null, 'pending', null,
          'recurrence', v_rule.id, v_month
        ) on conflict (recurrence_rule_id, recurrence_reference_month) where recurrence_rule_id is not null do nothing;
        get diagnostics v_inserted = row_count;
        v_created := v_created + v_inserted;
      end if;
    end loop;
  end loop;
  return v_created;
end;
$$;

revoke all on function public.ensure_recurrence_occurrences(uuid) from public;
grant execute on function public.ensure_recurrence_occurrences(uuid) to authenticated;
