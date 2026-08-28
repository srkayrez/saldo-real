-- Full credit-card invoice payments V1. Additive and backward-compatible.
alter table public.transactions
  add column origin text not null default 'manual'
    check (origin in ('manual', 'card_invoice_payment')),
  add column card_invoice_id uuid references public.card_invoices(id) on delete restrict;

alter table public.transactions
  add constraint transactions_workspace_id_id_key unique (workspace_id, id),
  add constraint transactions_card_origin_reference_check check (
    (origin = 'manual' and card_invoice_id is null)
    or (origin = 'card_invoice_payment' and card_invoice_id is not null)
  );

create index transactions_origin_idx on public.transactions(workspace_id, origin);
create index transactions_card_invoice_idx on public.transactions(card_invoice_id)
  where card_invoice_id is not null;

create table public.card_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invoice_id uuid not null,
  account_id uuid not null references public.accounts(id) on delete restrict,
  transaction_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null,
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  unique (invoice_id),
  unique (transaction_id),
  foreign key (workspace_id, invoice_id)
    references public.card_invoices(workspace_id, id) on delete restrict,
  foreign key (workspace_id, transaction_id)
    references public.transactions(workspace_id, id) on delete restrict
);

create index card_invoice_payments_workspace_idx on public.card_invoice_payments(workspace_id);
create index card_invoice_payments_account_idx on public.card_invoice_payments(account_id);

alter table public.card_invoice_payments enable row level security;

create policy "Members can view invoice payments" on public.card_invoice_payments
  for select to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = card_invoice_payments.workspace_id
      and wm.user_id = auth.uid()
  ));

-- Mutations are intentionally denied to direct clients. The validated payment RPC performs them.
create policy "Direct invoice payment inserts are denied" on public.card_invoice_payments
  for insert to authenticated with check (false);
create policy "Direct invoice payment updates are denied" on public.card_invoice_payments
  for update to authenticated using (false) with check (false);
create policy "Direct invoice payment deletes are denied" on public.card_invoice_payments
  for delete to authenticated using (false);

drop policy "Workspace members can insert transactions" on public.transactions;
create policy "Workspace members can insert manual transactions"
  on public.transactions for insert to authenticated
  with check (
    origin = 'manual'
    and card_invoice_id is null
    and created_by = auth.uid()
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = transactions.workspace_id
        and wm.user_id = auth.uid()
    )
    and exists (
      select 1 from public.accounts a
      where a.id = transactions.account_id
        and a.workspace_id = transactions.workspace_id
    )
    and (
      transactions.category_id is null
      or exists (
        select 1 from public.categories c
        where c.id = transactions.category_id
          and c.workspace_id = transactions.workspace_id
      )
    )
  );

create or replace function public.set_transaction_audit_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.origin <> 'manual' then
    raise exception 'Generated transactions cannot be updated directly';
  end if;
  new.workspace_id := old.workspace_id;
  new.created_by := old.created_by;
  new.origin := old.origin;
  new.card_invoice_id := old.card_invoice_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.validate_card_installment_payment_state()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_invoice_status text;
begin
  select ci.status into v_invoice_status
  from public.card_invoices ci where ci.id = new.invoice_id;

  if tg_op = 'INSERT' then
    if v_invoice_status = 'paid' then
      raise exception 'Cannot add installments to a paid invoice';
    end if;
    if new.status <> 'pending' then
      raise exception 'New installments must be pending';
    end if;
    return new;
  end if;

  new.workspace_id := old.workspace_id;
  new.purchase_id := old.purchase_id;
  new.credit_card_id := old.credit_card_id;
  new.invoice_id := old.invoice_id;
  new.installment_number := old.installment_number;
  new.installment_total := old.installment_total;
  new.amount := old.amount;
  new.created_at := old.created_at;

  if new.status <> old.status and not (
    old.status = 'pending'
    and new.status = 'paid'
    and exists (
      select 1 from public.card_invoice_payments cip
      where cip.invoice_id = old.invoice_id
    )
  ) then
    raise exception 'Installment status can only be changed by an invoice payment';
  end if;

  return new;
end;
$$;

create trigger validate_card_installment_payment_state
  before insert or update on public.card_installments
  for each row execute function public.validate_card_installment_payment_state();

create or replace function public.set_card_invoice_audit_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'paid' and new.status <> 'paid' then
    raise exception 'A paid invoice cannot be reopened';
  end if;
  if new.status = 'paid' and old.status <> 'paid' and not exists (
    select 1 from public.card_invoice_payments cip where cip.invoice_id = old.id
  ) then
    raise exception 'An invoice can only be paid through an invoice payment';
  end if;
  new.workspace_id := old.workspace_id;
  new.credit_card_id := old.credit_card_id;
  new.reference_month := old.reference_month;
  new.closing_date := old.closing_date;
  new.due_date := old.due_date;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.pay_card_invoice(
  p_invoice_id uuid,
  p_account_id uuid,
  p_payment_date date
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_card_id uuid;
  v_card_name text;
  v_closing_date date;
  v_reference_month date;
  v_invoice_status text;
  v_today date;
  v_total numeric(14,2);
  v_transaction_id uuid;
  v_payment_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_payment_date is null then raise exception 'Payment date is required'; end if;

  v_today := (now() at time zone 'America/Sao_Paulo')::date;

  select ci.workspace_id, ci.credit_card_id, cc.name, ci.closing_date,
         ci.reference_month, ci.status
    into v_workspace_id, v_card_id, v_card_name, v_closing_date,
         v_reference_month, v_invoice_status
  from public.card_invoices ci
  join public.credit_cards cc
    on cc.id = ci.credit_card_id and cc.workspace_id = ci.workspace_id
  where ci.id = p_invoice_id
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = ci.workspace_id and wm.user_id = auth.uid()
    )
  for update of ci;

  if not found then raise exception 'Invoice not found or inaccessible'; end if;
  if v_invoice_status = 'paid' or exists (
    select 1 from public.card_invoice_payments cip where cip.invoice_id = p_invoice_id
  ) then raise exception 'Invoice is already paid'; end if;
  if v_closing_date > v_today then raise exception 'Open invoices cannot be paid'; end if;
  if p_payment_date < v_closing_date or p_payment_date > v_today then
    raise exception 'Payment date must be between the closing date and today';
  end if;

  if not exists (
    select 1 from public.accounts a
    where a.id = p_account_id and a.workspace_id = v_workspace_id and a.active = true
  ) then raise exception 'Payment account is invalid, inactive, or belongs to another workspace'; end if;

  perform 1 from public.card_installments ci
  where ci.invoice_id = p_invoice_id and ci.workspace_id = v_workspace_id
  for update;

  select coalesce(sum(ci.amount), 0)::numeric(14,2) into v_total
  from public.card_installments ci
  where ci.invoice_id = p_invoice_id
    and ci.workspace_id = v_workspace_id
    and ci.status <> 'cancelled';

  if v_total <= 0 then raise exception 'Empty invoices cannot be paid'; end if;

  insert into public.transactions (
    workspace_id, created_by, description, amount, transaction_type,
    category_id, account_id, transaction_date, status, notes,
    origin, card_invoice_id
  ) values (
    v_workspace_id, auth.uid(),
    'Pagamento fatura ' || v_card_name || ' - ' || to_char(v_reference_month, 'MM/YYYY'),
    v_total, 'expense', null, p_account_id, p_payment_date, 'paid', null,
    'card_invoice_payment', p_invoice_id
  ) returning id into v_transaction_id;

  insert into public.card_invoice_payments (
    workspace_id, invoice_id, account_id, transaction_id,
    amount, payment_date, created_by
  ) values (
    v_workspace_id, p_invoice_id, p_account_id, v_transaction_id,
    v_total, p_payment_date, auth.uid()
  ) returning id into v_payment_id;

  update public.card_installments
    set status = 'paid'
    where invoice_id = p_invoice_id
      and workspace_id = v_workspace_id
      and status = 'pending';

  update public.card_invoices
    set status = 'paid'
    where id = p_invoice_id and workspace_id = v_workspace_id;

  return v_payment_id;
end;
$$;

revoke all on function public.pay_card_invoice(uuid, uuid, date) from public;
grant execute on function public.pay_card_invoice(uuid, uuid, date) to authenticated;
