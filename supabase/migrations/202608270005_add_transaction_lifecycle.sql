-- Transactions V2: explicit settlement date and non-destructive cancellation.
alter table public.transactions
  add column paid_date date;

update public.transactions
set paid_date = transaction_date
where status = 'paid' and paid_date is null;

alter table public.transactions
  drop constraint if exists transactions_status_check;

alter table public.transactions
  add constraint transactions_status_check
    check (status in ('pending', 'paid', 'cancelled')),
  add constraint transactions_paid_date_check check (
    (status = 'paid' and paid_date is not null)
    or (status in ('pending', 'cancelled') and paid_date is null)
  );

-- Financial history is cancelled through status transitions, never deleted directly.
drop policy if exists "Workspace members can delete transactions" on public.transactions;
create policy "Direct transaction deletes are denied" on public.transactions
  for delete to authenticated using (false);

create or replace function public.set_transaction_audit_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.origin <> 'manual' then
    raise exception 'Generated transactions cannot be updated directly';
  end if;
  if old.status = 'paid' then
    raise exception 'Paid transactions cannot be edited directly';
  end if;
  if old.status = 'cancelled' then
    raise exception 'Cancelled transactions cannot be edited directly';
  end if;
  if new.status not in ('pending', 'paid', 'cancelled') then
    raise exception 'Invalid transaction status';
  end if;
  if new.status = 'paid' and new.paid_date is null then
    raise exception 'Payment date is required for paid transactions';
  end if;
  if new.status in ('pending', 'cancelled') then
    new.paid_date := null;
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

-- Keep invoice-generated transactions aligned with the effective payment date.
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

  select ci.workspace_id, cc.name, ci.closing_date, ci.reference_month, ci.status
    into v_workspace_id, v_card_name, v_closing_date, v_reference_month, v_invoice_status
  from public.card_invoices ci
  join public.credit_cards cc on cc.id = ci.credit_card_id and cc.workspace_id = ci.workspace_id
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
  where ci.invoice_id = p_invoice_id and ci.workspace_id = v_workspace_id for update;

  select coalesce(sum(ci.amount), 0)::numeric(14,2) into v_total
  from public.card_installments ci
  where ci.invoice_id = p_invoice_id and ci.workspace_id = v_workspace_id
    and ci.status <> 'cancelled';
  if v_total <= 0 then raise exception 'Empty invoices cannot be paid'; end if;

  insert into public.transactions (
    workspace_id, created_by, description, amount, transaction_type,
    category_id, account_id, transaction_date, paid_date, status, notes,
    origin, card_invoice_id
  ) values (
    v_workspace_id, auth.uid(),
    'Pagamento fatura ' || v_card_name || ' - ' || to_char(v_reference_month, 'MM/YYYY'),
    v_total, 'expense', null, p_account_id, p_payment_date, p_payment_date, 'paid', null,
    'card_invoice_payment', p_invoice_id
  ) returning id into v_transaction_id;

  insert into public.card_invoice_payments (
    workspace_id, invoice_id, account_id, transaction_id, amount, payment_date, created_by
  ) values (
    v_workspace_id, p_invoice_id, p_account_id, v_transaction_id, v_total, p_payment_date, auth.uid()
  ) returning id into v_payment_id;

  update public.card_installments set status = 'paid'
  where invoice_id = p_invoice_id and workspace_id = v_workspace_id and status = 'pending';
  update public.card_invoices set status = 'paid'
  where id = p_invoice_id and workspace_id = v_workspace_id;

  return v_payment_id;
end;
$$;

revoke all on function public.pay_card_invoice(uuid, uuid, date) from public;
grant execute on function public.pay_card_invoice(uuid, uuid, date) to authenticated;
