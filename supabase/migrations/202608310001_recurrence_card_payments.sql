-- Recurrences V2: monthly expenses may materialize as independent card purchases.
-- Existing rules remain account-based; existing transactions and purchases are untouched.
alter table public.recurrence_rules
  add column payment_method text not null default 'account',
  add column credit_card_id uuid references public.credit_cards(id) on delete restrict;

alter table public.recurrence_rules alter column account_id drop not null;
alter table public.recurrence_rules
  add constraint recurrence_rules_payment_method_check
    check (payment_method in ('account', 'credit_card')),
  add constraint recurrence_rules_payment_target_check check (
    (payment_method = 'account' and account_id is not null and credit_card_id is null)
    or (payment_method = 'credit_card' and transaction_type = 'expense'
      and account_id is null and credit_card_id is not null)
  );

alter table public.card_purchases
  add column recurrence_rule_id uuid references public.recurrence_rules(id) on delete restrict,
  add column recurrence_reference_month date;

alter table public.card_purchases
  add constraint card_purchases_recurrence_reference_check check (
    (recurrence_rule_id is null and recurrence_reference_month is null)
    or (recurrence_rule_id is not null and recurrence_reference_month is not null
      and recurrence_reference_month = date_trunc('month', recurrence_reference_month)::date)
  );

create unique index card_purchases_recurrence_occurrence_key
  on public.card_purchases(recurrence_rule_id, recurrence_reference_month)
  where recurrence_rule_id is not null;

create or replace function public.validate_card_purchase_category()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.categories c
    where c.id = new.category_id and c.workspace_id = new.workspace_id
  ) then raise exception 'Category must belong to the purchase workspace'; end if;
  if new.recurrence_rule_id is not null and not exists (
    select 1 from public.recurrence_rules rr
    where rr.id = new.recurrence_rule_id and rr.workspace_id = new.workspace_id
      and rr.payment_method = 'credit_card' and rr.transaction_type = 'expense'
      and rr.credit_card_id = new.credit_card_id
  ) then raise exception 'Recurrence must belong to the purchase card and workspace'; end if;
  return new;
end;
$$;

create or replace function public.validate_recurrence_rule_relations()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.workspace_id := old.workspace_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  if new.payment_method = 'account' then
    if new.account_id is null or not exists (
      select 1 from public.accounts a
      where a.id = new.account_id and a.workspace_id = new.workspace_id and a.active = true
    ) then raise exception 'Account must be active and belong to the recurrence workspace'; end if;
  elsif new.transaction_type <> 'expense' or new.credit_card_id is null or not exists (
    select 1 from public.credit_cards cc
    where cc.id = new.credit_card_id and cc.workspace_id = new.workspace_id and cc.active = true
  ) then raise exception 'Credit card must be active and belong to the expense recurrence workspace';
  end if;
  if new.category_id is not null and not exists (
    select 1 from public.categories c
    where c.id = new.category_id and c.workspace_id = new.workspace_id and c.active = true
  ) then raise exception 'Category must be active and belong to the recurrence workspace'; end if;
  return new;
end;
$$;

-- One internal atomic engine is shared by manual and recurring purchases.
create or replace function public.materialize_card_purchase(
  p_credit_card_id uuid, p_description text, p_total_amount numeric, p_purchase_date date,
  p_category_id uuid, p_installment_count integer, p_notes text,
  p_recurrence_rule_id uuid, p_recurrence_reference_month date
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_card public.credit_cards%rowtype; v_purchase_id uuid; v_invoice_id uuid;
  v_closing_date date; v_due_date date; v_reference_month date;
  v_candidate date; v_cycle_month date; v_total_cents bigint; v_base_cents bigint;
  v_remainder integer; v_installment_cents bigint; v_index integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_description is null or char_length(trim(p_description)) not between 1 and 200 then raise exception 'Invalid purchase description'; end if;
  if p_total_amount is null or p_total_amount <= 0 then raise exception 'Total amount must be positive'; end if;
  if p_purchase_date is null then raise exception 'Purchase date is required'; end if;
  if p_installment_count is null or p_installment_count not between 1 and 360 then raise exception 'Invalid installment count'; end if;
  select * into v_card from public.credit_cards cc
  where cc.id = p_credit_card_id and cc.active and public.can_edit_workspace(cc.workspace_id);
  if not found then raise exception 'Credit card not found or editor permission required'; end if;
  if p_category_id is not null and not exists (select 1 from public.categories c where c.id=p_category_id and c.workspace_id=v_card.workspace_id and c.active) then raise exception 'Invalid category'; end if;
  if p_recurrence_rule_id is not null and not exists (
    select 1 from public.recurrence_rules rr where rr.id=p_recurrence_rule_id
      and rr.workspace_id=v_card.workspace_id and rr.payment_method='credit_card'
      and rr.credit_card_id=v_card.id and rr.transaction_type='expense'
  ) then raise exception 'Invalid recurring card purchase'; end if;

  v_total_cents := round(p_total_amount * 100)::bigint;
  if v_total_cents < p_installment_count then raise exception 'Installment count cannot exceed total cents'; end if;
  insert into public.card_purchases(workspace_id,credit_card_id,created_by,category_id,description,total_amount,purchase_date,installment_count,notes,recurrence_rule_id,recurrence_reference_month)
  values(v_card.workspace_id,v_card.id,case when p_recurrence_rule_id is null then auth.uid() else (select rr.created_by from public.recurrence_rules rr where rr.id=p_recurrence_rule_id) end,p_category_id,trim(p_description),v_total_cents::numeric/100,p_purchase_date,p_installment_count,nullif(trim(p_notes),''),p_recurrence_rule_id,p_recurrence_reference_month)
  on conflict (recurrence_rule_id, recurrence_reference_month) where recurrence_rule_id is not null do nothing
  returning id into v_purchase_id;
  if v_purchase_id is null then return null; end if;

  v_candidate := public.card_date_for_day(extract(year from p_purchase_date)::integer,extract(month from p_purchase_date)::integer,v_card.closing_day);
  if p_purchase_date <= v_candidate then v_closing_date := v_candidate; else
    v_cycle_month := (date_trunc('month',p_purchase_date)+interval '1 month')::date;
    v_closing_date := public.card_date_for_day(extract(year from v_cycle_month)::integer,extract(month from v_cycle_month)::integer,v_card.closing_day);
  end if;
  v_base_cents := v_total_cents/p_installment_count; v_remainder := (v_total_cents%p_installment_count)::integer;
  for v_index in 1..p_installment_count loop
    v_cycle_month := (date_trunc('month',v_closing_date)+make_interval(months=>v_index-1))::date;
    v_candidate := public.card_date_for_day(extract(year from v_cycle_month)::integer,extract(month from v_cycle_month)::integer,v_card.closing_day);
    v_due_date := public.card_date_for_day(extract(year from v_candidate)::integer,extract(month from v_candidate)::integer,v_card.due_day);
    if v_due_date <= v_candidate then
      v_cycle_month := (date_trunc('month',v_candidate)+interval '1 month')::date;
      v_due_date := public.card_date_for_day(extract(year from v_cycle_month)::integer,extract(month from v_cycle_month)::integer,v_card.due_day);
    end if;
    v_reference_month := date_trunc('month',v_due_date)::date;
    insert into public.card_invoices(workspace_id,credit_card_id,reference_month,closing_date,due_date)
    values(v_card.workspace_id,v_card.id,v_reference_month,v_candidate,v_due_date)
    on conflict(credit_card_id,reference_month) do update set closing_date=excluded.closing_date,due_date=excluded.due_date
    returning id into v_invoice_id;
    v_installment_cents := v_base_cents + case when v_index > p_installment_count-v_remainder then 1 else 0 end;
    insert into public.card_installments(workspace_id,purchase_id,credit_card_id,invoice_id,installment_number,installment_total,amount,status)
    values(v_card.workspace_id,v_purchase_id,v_card.id,v_invoice_id,v_index,p_installment_count,v_installment_cents::numeric/100,'pending');
  end loop;
  return v_purchase_id;
end; $$;
revoke all on function public.materialize_card_purchase(uuid,text,numeric,date,uuid,integer,text,uuid,date) from public;

create or replace function public.create_card_purchase(
  p_credit_card_id uuid, p_description text, p_total_amount numeric, p_purchase_date date,
  p_category_id uuid default null, p_installment_count integer default 1, p_notes text default null
) returns uuid language sql security definer set search_path = '' as $$
  select public.materialize_card_purchase(p_credit_card_id,p_description,p_total_amount,p_purchase_date,p_category_id,p_installment_count,p_notes,null,null);
$$;
revoke all on function public.create_card_purchase(uuid,text,numeric,date,uuid,integer,text) from public;
grant execute on function public.create_card_purchase(uuid,text,numeric,date,uuid,integer,text) to authenticated;

create or replace function public.ensure_recurrence_occurrences(p_workspace_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_rule public.recurrence_rules%rowtype; v_month date; v_date date; v_last_day integer; v_created integer:=0; v_inserted integer; v_purchase uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.can_view_workspace(p_workspace_id) then raise exception 'Workspace is inaccessible'; end if;
  if not public.can_edit_workspace(p_workspace_id) then return 0; end if;
  for v_rule in select * from public.recurrence_rules where workspace_id=p_workspace_id and active loop
    for v_month in select (date_trunc('month',(now() at time zone 'America/Sao_Paulo')::date)+make_interval(months=>n))::date from generate_series(0,3)n loop
      v_last_day:=extract(day from(v_month+interval '1 month - 1 day'))::integer;
      v_date:=make_date(extract(year from v_month)::integer,extract(month from v_month)::integer,least(v_rule.day_of_month,v_last_day));
      if v_date>=v_rule.start_date and (v_rule.end_date is null or v_date<=v_rule.end_date) then
        -- Cross-table serialization prevents a payment-method change from creating
        -- both a transaction and a card purchase for the same rule/month.
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_rule.id::text || ':' || v_month::text, 0));
        if v_rule.payment_method='account' then
          if not exists(select 1 from public.card_purchases cp where cp.recurrence_rule_id=v_rule.id and cp.recurrence_reference_month=v_month) then
            insert into public.transactions(workspace_id,created_by,description,amount,transaction_type,category_id,account_id,transaction_date,paid_date,status,notes,origin,recurrence_rule_id,recurrence_reference_month)
            values(v_rule.workspace_id,v_rule.created_by,v_rule.name,v_rule.amount,v_rule.transaction_type,v_rule.category_id,v_rule.account_id,v_date,null,'pending',null,'recurrence',v_rule.id,v_month)
            on conflict(recurrence_rule_id,recurrence_reference_month) where recurrence_rule_id is not null do nothing;
            get diagnostics v_inserted=row_count; v_created:=v_created+v_inserted;
          end if;
        else
          if not exists(select 1 from public.transactions t where t.recurrence_rule_id=v_rule.id and t.recurrence_reference_month=v_month) then
            v_purchase:=public.materialize_card_purchase(v_rule.credit_card_id,v_rule.name,v_rule.amount,v_date,v_rule.category_id,1,null,v_rule.id,v_month);
            if v_purchase is not null then v_created:=v_created+1; end if;
          end if;
        end if;
      end if;
    end loop;
  end loop;
  return v_created;
end; $$;
revoke all on function public.ensure_recurrence_occurrences(uuid) from public;
grant execute on function public.ensure_recurrence_occurrences(uuid) to authenticated;
