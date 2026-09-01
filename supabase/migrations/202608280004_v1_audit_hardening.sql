-- V1 audit hardening: protect generated card records and serialize last-owner changes.
-- Additive: no financial data is deleted or rewritten.

-- Card purchases, invoices and installments are aggregate internals. Only the
-- validated RPC may create them; authenticated clients retain read access.
drop policy if exists "Editors insert card purchases" on public.card_purchases;
drop policy if exists "Editors update card purchases" on public.card_purchases;
drop policy if exists "Editors delete card purchases" on public.card_purchases;
drop policy if exists "Editors insert card invoices" on public.card_invoices;
drop policy if exists "Editors update card invoices" on public.card_invoices;
drop policy if exists "Editors delete card invoices" on public.card_invoices;
drop policy if exists "Editors insert card installments" on public.card_installments;
drop policy if exists "Editors update card installments" on public.card_installments;
drop policy if exists "Editors delete card installments" on public.card_installments;

do $$ declare p record; begin
  for p in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename = any(array['card_purchases','card_invoices','card_installments'])
      and cmd in ('INSERT','UPDATE','DELETE','ALL')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

create policy "Direct card purchase inserts are denied" on public.card_purchases
  for insert to authenticated with check (false);
create policy "Direct card purchase updates are denied" on public.card_purchases
  for update to authenticated using (false) with check (false);
create policy "Direct card purchase deletes are denied" on public.card_purchases
  for delete to authenticated using (false);
create policy "Direct card invoice inserts are denied" on public.card_invoices
  for insert to authenticated with check (false);
create policy "Direct card invoice updates are denied" on public.card_invoices
  for update to authenticated using (false) with check (false);
create policy "Direct card invoice deletes are denied" on public.card_invoices
  for delete to authenticated using (false);
create policy "Direct card installment inserts are denied" on public.card_installments
  for insert to authenticated with check (false);
create policy "Direct card installment updates are denied" on public.card_installments
  for update to authenticated using (false) with check (false);
create policy "Direct card installment deletes are denied" on public.card_installments
  for delete to authenticated using (false);

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
security definer
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
  if p_description is null or char_length(trim(p_description)) < 1 or char_length(trim(p_description)) > 200 then
    raise exception 'Invalid purchase description';
  end if;
  if p_total_amount is null or p_total_amount <= 0 then raise exception 'Total amount must be positive'; end if;
  if p_purchase_date is null then raise exception 'Purchase date is required'; end if;
  if p_installment_count is null or p_installment_count < 1 then raise exception 'Installment count must be at least one'; end if;
  if p_installment_count > 360 then raise exception 'Installment count exceeds the supported limit'; end if;

  select cc.* into v_card
  from public.credit_cards cc
  where cc.id = p_credit_card_id
    and cc.active = true
    and public.can_edit_workspace(cc.workspace_id);
  if not found then raise exception 'Credit card not found or editor permission required'; end if;

  if p_category_id is not null and not exists (
    select 1 from public.categories c
    where c.id = p_category_id and c.workspace_id = v_card.workspace_id and c.active = true
  ) then raise exception 'Category does not belong to the card workspace or is inactive'; end if;

  v_total_cents := round(p_total_amount * 100)::bigint;
  if v_total_cents < p_installment_count then raise exception 'Installment count cannot exceed the total in cents'; end if;

  insert into public.card_purchases (
    workspace_id, credit_card_id, created_by, category_id, description,
    total_amount, purchase_date, installment_count, notes
  ) values (
    v_card.workspace_id, v_card.id, auth.uid(), p_category_id, trim(p_description),
    v_total_cents::numeric / 100, p_purchase_date, p_installment_count, nullif(trim(p_notes), '')
  ) returning id into v_purchase_id;

  v_candidate := public.card_date_for_day(extract(year from p_purchase_date)::integer, extract(month from p_purchase_date)::integer, v_card.closing_day);
  if p_purchase_date <= v_candidate then v_closing_date := v_candidate;
  else
    v_cycle_month := (date_trunc('month', p_purchase_date) + interval '1 month')::date;
    v_closing_date := public.card_date_for_day(extract(year from v_cycle_month)::integer, extract(month from v_cycle_month)::integer, v_card.closing_day);
  end if;

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

-- Serialize owner-count decisions on the workspace row so two concurrent
-- requests cannot both remove/demote the last owners.
create or replace function public.update_workspace_member_role(p_workspace_id uuid,p_user_id uuid,p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  perform 1 from public.workspaces w where w.id = p_workspace_id for update;
  if not found then raise exception 'Workspace not found'; end if;
  if not public.is_workspace_owner(p_workspace_id) then raise exception 'Owner permission required'; end if;
  if p_role not in ('owner','editor','viewer') then raise exception 'Invalid role'; end if;
  select role into v_old from public.workspace_members
    where workspace_id=p_workspace_id and user_id=p_user_id for update;
  if not found then raise exception 'Member not found'; end if;
  if v_old='owner' and p_role<>'owner' and (
    select count(*) from public.workspace_members where workspace_id=p_workspace_id and role='owner'
  )<=1 then raise exception 'Cannot demote the last owner'; end if;
  update public.workspace_members set role=p_role
    where workspace_id=p_workspace_id and user_id=p_user_id;
end; $$;

create or replace function public.remove_workspace_member(p_workspace_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role text; v_type text;
begin
  perform 1 from public.workspaces w where w.id = p_workspace_id for update;
  if not found then raise exception 'Workspace not found'; end if;
  select role into v_role from public.workspace_members
    where workspace_id=p_workspace_id and user_id=p_user_id for update;
  if not found then raise exception 'Member not found'; end if;
  select workspace_type into v_type from public.workspaces where id=p_workspace_id;
  if p_user_id<>auth.uid() and not public.is_workspace_owner(p_workspace_id) then raise exception 'Owner permission required'; end if;
  if p_user_id=auth.uid() and v_type='personal' then raise exception 'Personal workspace cannot be left'; end if;
  if v_role='owner' and (
    select count(*) from public.workspace_members where workspace_id=p_workspace_id and role='owner'
  )<=1 then raise exception 'Cannot remove the last owner'; end if;
  delete from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id;
end; $$;

revoke all on function public.update_workspace_member_role(uuid,uuid,text), public.remove_workspace_member(uuid,uuid) from public;
grant execute on function public.update_workspace_member_role(uuid,uuid,text), public.remove_workspace_member(uuid,uuid) to authenticated;

-- Cancelled goals are immutable historical records, including contributions.
create or replace function public.set_goal_audit_fields()
returns trigger language plpgsql set search_path = '' as $$
declare v_saved numeric(14,2);
begin
  if old.status = 'cancelled' then
    raise exception 'Cancelled goals cannot be edited';
  end if;
  new.workspace_id := old.workspace_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  if new.status <> 'cancelled' then
    select coalesce(sum(gc.amount), 0)::numeric(14,2) into v_saved
    from public.goal_contributions gc
    where gc.goal_id = old.id and gc.workspace_id = old.workspace_id;
    new.status := case when v_saved >= new.target_amount then 'completed' else 'active' end;
  end if;
  return new;
end;
$$;

drop policy if exists "Editors update goal contributions" on public.goal_contributions;
drop policy if exists "Editors delete goal contributions" on public.goal_contributions;
create policy "Editors update active goal contributions" on public.goal_contributions
  for update to authenticated
  using (
    public.can_edit_workspace(workspace_id)
    and exists (select 1 from public.goals g where g.id = goal_id and g.workspace_id = goal_contributions.workspace_id and g.status <> 'cancelled')
  )
  with check (
    public.can_edit_workspace(workspace_id)
    and exists (select 1 from public.goals g where g.id = goal_id and g.workspace_id = goal_contributions.workspace_id and g.status <> 'cancelled')
  );
create policy "Editors delete active goal contributions" on public.goal_contributions
  for delete to authenticated
  using (
    public.can_edit_workspace(workspace_id)
    and exists (select 1 from public.goals g where g.id = goal_id and g.workspace_id = goal_contributions.workspace_id and g.status <> 'cancelled')
  );

-- Viewers may request fresh data but must not materialize financial rows.
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
  if not public.can_view_workspace(p_workspace_id) then raise exception 'Workspace is inaccessible'; end if;
  if not public.can_edit_workspace(p_workspace_id) then return 0; end if;

  for v_rule in
    select * from public.recurrence_rules where workspace_id = p_workspace_id and active = true
  loop
    for v_month in
      select (date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) + make_interval(months => n))::date
      from generate_series(0, 3) n
    loop
      v_last_day := extract(day from (v_month + interval '1 month - 1 day'))::integer;
      v_date := make_date(
        extract(year from v_month)::integer,
        extract(month from v_month)::integer,
        least(v_rule.day_of_month, v_last_day)
      );
      if v_date >= v_rule.start_date and (v_rule.end_date is null or v_date <= v_rule.end_date) then
        insert into public.transactions (
          workspace_id, created_by, description, amount, transaction_type, category_id,
          account_id, transaction_date, paid_date, status, notes, origin,
          recurrence_rule_id, recurrence_reference_month
        ) values (
          v_rule.workspace_id, v_rule.created_by, v_rule.name, v_rule.amount, v_rule.transaction_type,
          v_rule.category_id, v_rule.account_id, v_date, null, 'pending', null,
          'recurrence', v_rule.id, v_month
        ) on conflict (recurrence_rule_id, recurrence_reference_month)
          where recurrence_rule_id is not null do nothing;
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
