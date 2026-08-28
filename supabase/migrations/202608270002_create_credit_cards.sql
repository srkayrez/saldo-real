-- Credit cards V1. This migration is additive and does not change existing financial rules.
create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  name text not null check (char_length(trim(name)) > 0),
  limit_amount numeric(14,2) not null check (limit_amount >= 0),
  closing_day integer not null check (closing_day between 1 and 31),
  due_day integer not null check (due_day between 1 and 31),
  payment_account_id uuid references public.accounts(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create table public.card_purchases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  credit_card_id uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  category_id uuid references public.categories(id) on delete set null,
  description text not null check (char_length(trim(description)) > 0),
  total_amount numeric(14,2) not null check (total_amount > 0),
  purchase_date date not null,
  installment_count integer not null default 1 check (installment_count >= 1),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, credit_card_id, id),
  foreign key (workspace_id, credit_card_id)
    references public.credit_cards(workspace_id, id) on delete cascade
);

create table public.card_invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  credit_card_id uuid not null,
  reference_month date not null check (reference_month = date_trunc('month', reference_month)::date),
  closing_date date not null,
  due_date date not null check (due_date > closing_date),
  status text not null default 'open' check (status in ('open', 'closed', 'paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (credit_card_id, reference_month),
  unique (workspace_id, id),
  unique (workspace_id, credit_card_id, id),
  foreign key (workspace_id, credit_card_id)
    references public.credit_cards(workspace_id, id) on delete cascade
);

create table public.card_installments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  purchase_id uuid not null,
  credit_card_id uuid not null,
  invoice_id uuid not null,
  installment_number integer not null check (installment_number >= 1),
  installment_total integer not null check (installment_total >= 1),
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (purchase_id, installment_number),
  check (installment_number <= installment_total),
  foreign key (workspace_id, credit_card_id, purchase_id)
    references public.card_purchases(workspace_id, credit_card_id, id) on delete cascade,
  foreign key (workspace_id, credit_card_id, invoice_id)
    references public.card_invoices(workspace_id, credit_card_id, id) on delete cascade
);

create index credit_cards_workspace_idx on public.credit_cards(workspace_id);
create index card_purchases_card_date_idx on public.card_purchases(credit_card_id, purchase_date desc);
create index card_purchases_workspace_idx on public.card_purchases(workspace_id);
create index card_invoices_card_month_idx on public.card_invoices(credit_card_id, reference_month desc);
create index card_invoices_workspace_idx on public.card_invoices(workspace_id);
create index card_installments_invoice_idx on public.card_installments(invoice_id);
create index card_installments_card_status_idx on public.card_installments(credit_card_id, status);
create index card_installments_workspace_idx on public.card_installments(workspace_id);

create or replace function public.validate_credit_card_payment_account()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.payment_account_id is not null and not exists (
    select 1 from public.accounts a
    where a.id = new.payment_account_id and a.workspace_id = new.workspace_id
  ) then
    raise exception 'Payment account must belong to the credit card workspace';
  end if;

  return new;
end;
$$;

create or replace function public.validate_card_purchase_category()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.categories c
    where c.id = new.category_id and c.workspace_id = new.workspace_id
  ) then
    raise exception 'Category must belong to the purchase workspace';
  end if;

  return new;
end;
$$;

create trigger validate_credit_card_payment_account
  before insert or update on public.credit_cards
  for each row execute function public.validate_credit_card_payment_account();
create trigger validate_card_purchase_category
  before insert or update on public.card_purchases
  for each row execute function public.validate_card_purchase_category();

create or replace function public.set_card_owner_audit_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.workspace_id := old.workspace_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.set_card_invoice_audit_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.workspace_id := old.workspace_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_credit_cards_audit_fields before update on public.credit_cards
  for each row execute function public.set_card_owner_audit_fields();
create trigger set_card_purchases_audit_fields before update on public.card_purchases
  for each row execute function public.set_card_owner_audit_fields();
create trigger set_card_invoices_audit_fields before update on public.card_invoices
  for each row execute function public.set_card_invoice_audit_fields();

alter table public.credit_cards enable row level security;
alter table public.card_purchases enable row level security;
alter table public.card_invoices enable row level security;
alter table public.card_installments enable row level security;

create policy "Members can view credit cards" on public.credit_cards for select to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = credit_cards.workspace_id and wm.user_id = auth.uid()));
create policy "Members can insert credit cards" on public.credit_cards for insert to authenticated
  with check (created_by = auth.uid() and exists (select 1 from public.workspace_members wm where wm.workspace_id = credit_cards.workspace_id and wm.user_id = auth.uid()) and (payment_account_id is null or exists (select 1 from public.accounts a where a.id = payment_account_id and a.workspace_id = credit_cards.workspace_id)));
create policy "Members can update credit cards" on public.credit_cards for update to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = credit_cards.workspace_id and wm.user_id = auth.uid()))
  with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = credit_cards.workspace_id and wm.user_id = auth.uid()) and (payment_account_id is null or exists (select 1 from public.accounts a where a.id = payment_account_id and a.workspace_id = credit_cards.workspace_id)));
create policy "Members can delete credit cards" on public.credit_cards for delete to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = credit_cards.workspace_id and wm.user_id = auth.uid()));

create policy "Members can view card purchases" on public.card_purchases for select to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = card_purchases.workspace_id and wm.user_id = auth.uid()));
create policy "Members can insert card purchases" on public.card_purchases for insert to authenticated
  with check (created_by = auth.uid() and exists (select 1 from public.workspace_members wm where wm.workspace_id = card_purchases.workspace_id and wm.user_id = auth.uid()) and exists (select 1 from public.credit_cards cc where cc.id = credit_card_id and cc.workspace_id = card_purchases.workspace_id) and (category_id is null or exists (select 1 from public.categories c where c.id = category_id and c.workspace_id = card_purchases.workspace_id)));
create policy "Members can update card purchases" on public.card_purchases for update to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = card_purchases.workspace_id and wm.user_id = auth.uid()))
  with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = card_purchases.workspace_id and wm.user_id = auth.uid()) and exists (select 1 from public.credit_cards cc where cc.id = credit_card_id and cc.workspace_id = card_purchases.workspace_id) and (category_id is null or exists (select 1 from public.categories c where c.id = category_id and c.workspace_id = card_purchases.workspace_id)));
create policy "Members can delete card purchases" on public.card_purchases for delete to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = card_purchases.workspace_id and wm.user_id = auth.uid()));

create policy "Members can view card invoices" on public.card_invoices for select to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = card_invoices.workspace_id and wm.user_id = auth.uid()));
create policy "Members can insert card invoices" on public.card_invoices for insert to authenticated
  with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = card_invoices.workspace_id and wm.user_id = auth.uid()) and exists (select 1 from public.credit_cards cc where cc.id = credit_card_id and cc.workspace_id = card_invoices.workspace_id));
create policy "Members can update card invoices" on public.card_invoices for update to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = card_invoices.workspace_id and wm.user_id = auth.uid()))
  with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = card_invoices.workspace_id and wm.user_id = auth.uid()) and exists (select 1 from public.credit_cards cc where cc.id = credit_card_id and cc.workspace_id = card_invoices.workspace_id));
create policy "Members can delete card invoices" on public.card_invoices for delete to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = card_invoices.workspace_id and wm.user_id = auth.uid()));

create policy "Members can view card installments" on public.card_installments for select to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = card_installments.workspace_id and wm.user_id = auth.uid()));
create policy "Members can insert card installments" on public.card_installments for insert to authenticated
  with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = card_installments.workspace_id and wm.user_id = auth.uid()) and exists (select 1 from public.card_purchases cp where cp.id = purchase_id and cp.credit_card_id = credit_card_id and cp.workspace_id = card_installments.workspace_id) and exists (select 1 from public.card_invoices ci where ci.id = invoice_id and ci.credit_card_id = credit_card_id and ci.workspace_id = card_installments.workspace_id));
create policy "Members can update card installments" on public.card_installments for update to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = card_installments.workspace_id and wm.user_id = auth.uid()))
  with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = card_installments.workspace_id and wm.user_id = auth.uid()) and exists (select 1 from public.card_purchases cp where cp.id = purchase_id and cp.credit_card_id = credit_card_id and cp.workspace_id = card_installments.workspace_id) and exists (select 1 from public.card_invoices ci where ci.id = invoice_id and ci.credit_card_id = credit_card_id and ci.workspace_id = card_installments.workspace_id));
create policy "Members can delete card installments" on public.card_installments for delete to authenticated
  using (exists (select 1 from public.workspace_members wm where wm.workspace_id = card_installments.workspace_id and wm.user_id = auth.uid()));

create or replace function public.card_date_for_day(p_year integer, p_month integer, p_day integer)
returns date language sql immutable set search_path = '' as $$
  select make_date(
    p_year,
    p_month,
    least(p_day, extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'))::integer)
  );
$$;

create or replace function public.create_card_purchase(
  p_credit_card_id uuid,
  p_description text,
  p_total_amount numeric,
  p_purchase_date date,
  p_category_id uuid default null,
  p_installment_count integer default 1,
  p_notes text default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_card public.credit_cards%rowtype;
  v_purchase_id uuid;
  v_invoice_id uuid;
  v_closing_date date;
  v_due_date date;
  v_reference_month date;
  v_candidate date;
  v_cycle_month date;
  v_total_cents bigint;
  v_base_cents bigint;
  v_remainder integer;
  v_installment_cents bigint;
  v_index integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_total_amount <= 0 then raise exception 'Total amount must be positive'; end if;
  if p_installment_count < 1 then raise exception 'Installment count must be at least one'; end if;
  if p_installment_count > 360 then raise exception 'Installment count exceeds the supported limit'; end if;

  select cc.* into v_card from public.credit_cards cc
  where cc.id = p_credit_card_id and cc.active = true
    and exists (select 1 from public.workspace_members wm where wm.workspace_id = cc.workspace_id and wm.user_id = auth.uid());
  if not found then raise exception 'Credit card not found or inaccessible'; end if;

  if p_category_id is not null and not exists (
    select 1 from public.categories c where c.id = p_category_id and c.workspace_id = v_card.workspace_id
  ) then raise exception 'Category does not belong to the active workspace'; end if;

  insert into public.card_purchases (
    workspace_id, credit_card_id, created_by, category_id, description,
    total_amount, purchase_date, installment_count, notes
  ) values (
    v_card.workspace_id, v_card.id, auth.uid(), p_category_id, trim(p_description),
    p_total_amount, p_purchase_date, p_installment_count, nullif(trim(p_notes), '')
  ) returning id into v_purchase_id;

  v_candidate := public.card_date_for_day(extract(year from p_purchase_date)::integer, extract(month from p_purchase_date)::integer, v_card.closing_day);
  if p_purchase_date <= v_candidate then v_closing_date := v_candidate;
  else
    v_cycle_month := (date_trunc('month', p_purchase_date) + interval '1 month')::date;
    v_closing_date := public.card_date_for_day(extract(year from v_cycle_month)::integer, extract(month from v_cycle_month)::integer, v_card.closing_day);
  end if;

  v_total_cents := round(p_total_amount * 100)::bigint;
  if v_total_cents < p_installment_count then raise exception 'Installment count cannot exceed the total in cents'; end if;
  v_base_cents := v_total_cents / p_installment_count;
  v_remainder := (v_total_cents % p_installment_count)::integer;

  for v_index in 1..p_installment_count loop
    v_cycle_month := (date_trunc('month', v_closing_date) + make_interval(months => v_index - 1))::date;
    v_candidate := public.card_date_for_day(extract(year from v_cycle_month)::integer, extract(month from v_cycle_month)::integer, v_card.closing_day);
    v_due_date := public.card_date_for_day(extract(year from v_candidate)::integer, extract(month from v_candidate)::integer, v_card.due_day);
    if v_due_date <= v_candidate then
      v_cycle_month := (date_trunc('month', v_candidate) + interval '1 month')::date;
      v_due_date := public.card_date_for_day(extract(year from v_cycle_month)::integer, extract(month from v_cycle_month)::integer, v_card.due_day);
    end if;
    v_reference_month := date_trunc('month', v_due_date)::date;

    insert into public.card_invoices (workspace_id, credit_card_id, reference_month, closing_date, due_date)
    values (v_card.workspace_id, v_card.id, v_reference_month, v_candidate, v_due_date)
    on conflict (credit_card_id, reference_month) do update
      set closing_date = excluded.closing_date, due_date = excluded.due_date
    returning id into v_invoice_id;

    v_installment_cents := v_base_cents + case when v_index > p_installment_count - v_remainder then 1 else 0 end;
    insert into public.card_installments (
      workspace_id, purchase_id, credit_card_id, invoice_id,
      installment_number, installment_total, amount, status
    ) values (
      v_card.workspace_id, v_purchase_id, v_card.id, v_invoice_id,
      v_index, p_installment_count, v_installment_cents::numeric / 100, 'pending'
    );
  end loop;

  return v_purchase_id;
end;
$$;

revoke all on function public.create_card_purchase(uuid, text, numeric, date, uuid, integer, text) from public;
grant execute on function public.create_card_purchase(uuid, text, numeric, date, uuid, integer, text) to authenticated;
