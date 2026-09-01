-- Saldo Real V1 schema baseline.
-- Snapshot for a NEW Supabase project only. Never apply over the existing production database.
-- Contains schema only: no users, emails, tokens, secrets, or financial data.
-- Depends on Supabase-managed auth.users and roles anon/authenticated/service_role.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."accept_workspace_invitation"("p_token" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_inv public.workspace_invitations%rowtype; v_email text; begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select lower(email) into v_email from auth.users where id=auth.uid();
  select * into v_inv from public.workspace_invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if not found then raise exception 'Invitation not found'; end if;
  if v_inv.status <> 'pending' then raise exception 'Invitation is no longer pending'; end if;
  if v_inv.expires_at <= now() then update public.workspace_invitations set status='expired',updated_at=now() where id=v_inv.id; raise exception 'Invitation expired'; end if;
  if v_email <> v_inv.invited_email then raise exception 'Invitation belongs to another email'; end if;
  if exists(select 1 from public.workspace_members where workspace_id=v_inv.workspace_id and user_id=auth.uid()) then raise exception 'User is already a member'; end if;
  insert into public.workspace_members(workspace_id,user_id,role) values(v_inv.workspace_id,auth.uid(),v_inv.role);
  update public.workspace_invitations set status='accepted',accepted_at=now(),updated_at=now() where id=v_inv.id;
  return v_inv.workspace_id;
end; $$;


ALTER FUNCTION "public"."accept_workspace_invitation"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_workspace"("target_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (select 1 from public.workspace_members wm where wm.workspace_id = target_workspace_id and wm.user_id = auth.uid() and wm.role in ('owner', 'editor'));
$$;


ALTER FUNCTION "public"."can_edit_workspace"("target_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_workspace"("target_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (select 1 from public.workspace_members wm where wm.workspace_id = target_workspace_id and wm.user_id = auth.uid());
$$;


ALTER FUNCTION "public"."can_view_workspace"("target_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."card_date_for_day"("p_year" integer, "p_month" integer, "p_day" integer) RETURNS "date"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select make_date(
    p_year,
    p_month,
    least(p_day, extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'))::integer)
  );
$$;


ALTER FUNCTION "public"."card_date_for_day"("p_year" integer, "p_month" integer, "p_day" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_card_purchase"("p_credit_card_id" "uuid", "p_description" "text", "p_total_amount" numeric, "p_purchase_date" "date", "p_category_id" "uuid" DEFAULT NULL::"uuid", "p_installment_count" integer DEFAULT 1, "p_notes" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select public.materialize_card_purchase(p_credit_card_id,p_description,p_total_amount,p_purchase_date,p_category_id,p_installment_count,p_notes,null,null);
$$;


ALTER FUNCTION "public"."create_card_purchase"("p_credit_card_id" "uuid", "p_description" "text", "p_total_amount" numeric, "p_purchase_date" "date", "p_category_id" "uuid", "p_installment_count" integer, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_shared_workspace"("p_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_id uuid; begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(trim(p_name)) < 1 or char_length(trim(p_name)) > 120 then raise exception 'Invalid workspace name'; end if;
  insert into public.workspaces(name, workspace_type, created_by) values(trim(p_name), 'shared', auth.uid()) returning id into v_id;
  insert into public.workspace_members(workspace_id, user_id, role) values(v_id, auth.uid(), 'owner');
  return v_id;
end; $$;


ALTER FUNCTION "public"."create_shared_workspace"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_workspace_invitation"("p_workspace_id" "uuid", "p_email" "text", "p_role" "text") RETURNS TABLE("token" "text", "invitation_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare v_token text; v_email text; begin
  if not public.is_workspace_owner(p_workspace_id) then raise exception 'Owner permission required'; end if;
  v_email := lower(trim(p_email));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Invalid email'; end if;
  if p_role not in ('editor','viewer') then raise exception 'Invalid invitation role'; end if;
  if exists (select 1 from auth.users u join public.workspace_members wm on wm.user_id=u.id where wm.workspace_id=p_workspace_id and lower(u.email)=v_email) then raise exception 'User is already a member'; end if;
  update public.workspace_invitations set status='revoked', updated_at=now() where workspace_id=p_workspace_id and invited_email=v_email and status='pending';
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.workspace_invitations(workspace_id, invited_email, role, invited_by, token_hash, expires_at)
  values(p_workspace_id, v_email, p_role, auth.uid(), encode(extensions.digest(v_token, 'sha256'), 'hex'), now()+interval '7 days') returning id into invitation_id;
  token := v_token; return next;
end; $_$;


ALTER FUNCTION "public"."create_workspace_invitation"("p_workspace_id" "uuid", "p_email" "text", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_financial_editor"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$ begin
  if not public.can_edit_workspace(new.workspace_id) then raise exception 'Editor permission required'; end if;
  return new;
end; $$;


ALTER FUNCTION "public"."enforce_financial_editor"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_recurrence_occurrences"("p_workspace_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."ensure_recurrence_occurrences"("p_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_workspace_invitation"("p_token" "text") RETURNS TABLE("workspace_name" "text", "invited_email" "text", "role" "text", "status" "text", "expires_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select w.name::text, wi.invited_email, wi.role, case when wi.status='pending' and wi.expires_at<=now() then 'expired' else wi.status end, wi.expires_at
  from public.workspace_invitations wi join public.workspaces w on w.id=wi.workspace_id
  where wi.token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
$$;


ALTER FUNCTION "public"."get_workspace_invitation"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_workspace_members"("p_workspace_id" "uuid") RETURNS TABLE("user_id" "uuid", "email" "text", "display_name" "text", "role" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select wm.user_id, u.email::text, split_part(u.email,'@',1)::text, wm.role
  from public.workspace_members wm join auth.users u on u.id=wm.user_id
  where wm.workspace_id=p_workspace_id and public.can_view_workspace(p_workspace_id) order by wm.role='owner' desc, u.email;
$$;


ALTER FUNCTION "public"."get_workspace_members"("p_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  new_workspace_id uuid;
begin

  -- Perfil
  insert into public.profiles (
    id,
    full_name
  )
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    )
  );

  -- Workspace pessoal
  insert into public.workspaces (
    name,
    type,
    workspace_type,
    created_by
  )
  values (
    'Minhas finanças',
    'personal',
    'personal',
    new.id
  )
  returning id into new_workspace_id;

  -- Usuário vira owner
  insert into public.workspace_members (
    workspace_id,
    user_id,
    role
  )
  values (
    new_workspace_id,
    new.id,
    'owner'
  );

  -- Categorias padrão

  insert into public.categories (
    workspace_id,
    name,
    kind,
    icon
  )
  values

  (new_workspace_id, 'Salário', 'income', 'wallet'),

  (new_workspace_id, 'Alimentação', 'expense', 'utensils'),

  (new_workspace_id, 'Moradia', 'expense', 'house'),

  (new_workspace_id, 'Transporte', 'expense', 'car'),

  (new_workspace_id, 'Saúde', 'expense', 'heart'),

  (new_workspace_id, 'Lazer', 'expense', 'gamepad'),

  (new_workspace_id, 'Educação', 'expense', 'book'),

  (new_workspace_id, 'Assinaturas', 'expense', 'repeat'),

  (new_workspace_id, 'Compras', 'expense', 'shopping-bag'),

  (new_workspace_id, 'Outros', 'both', 'circle');

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_workspace_member"("target_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_workspace_member"("target_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_workspace_owner"("target_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (select 1 from public.workspace_members wm where wm.workspace_id = target_workspace_id and wm.user_id = auth.uid() and wm.role = 'owner');
$$;


ALTER FUNCTION "public"."is_workspace_owner"("target_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."materialize_card_purchase"("p_credit_card_id" "uuid", "p_description" "text", "p_total_amount" numeric, "p_purchase_date" "date", "p_category_id" "uuid", "p_installment_count" integer, "p_notes" "text", "p_recurrence_rule_id" "uuid", "p_recurrence_reference_month" "date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."materialize_card_purchase"("p_credit_card_id" "uuid", "p_description" "text", "p_total_amount" numeric, "p_purchase_date" "date", "p_category_id" "uuid", "p_installment_count" integer, "p_notes" "text", "p_recurrence_rule_id" "uuid", "p_recurrence_reference_month" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pay_card_invoice"("p_invoice_id" "uuid", "p_account_id" "uuid", "p_payment_date" "date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."pay_card_invoice"("p_invoice_id" "uuid", "p_account_id" "uuid", "p_payment_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_workspace_member"("p_workspace_id" "uuid", "p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."remove_workspace_member"("p_workspace_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rename_workspace"("p_workspace_id" "uuid", "p_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ begin
  if not public.is_workspace_owner(p_workspace_id) then raise exception 'Owner permission required'; end if;
  if char_length(trim(p_name))<1 or char_length(trim(p_name))>120 then raise exception 'Invalid workspace name'; end if;
  update public.workspaces set name=trim(p_name) where id=p_workspace_id;
end; $$;


ALTER FUNCTION "public"."rename_workspace"("p_workspace_id" "uuid", "p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_card_invoice_audit_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."set_card_invoice_audit_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_card_owner_audit_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.workspace_id := old.workspace_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_card_owner_audit_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_goal_audit_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."set_goal_audit_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_transaction_audit_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."set_transaction_audit_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_goal_status_from_contributions"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."sync_goal_status_from_contributions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_workspace_member_role"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."update_workspace_member_role"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_budget_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."validate_budget_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_card_installment_payment_state"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."validate_card_installment_payment_state"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_card_purchase_category"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."validate_card_purchase_category"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_credit_card_payment_account"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."validate_credit_card_payment_account"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_goal_contribution"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."validate_goal_contribution"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_recurrence_rule_relations"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."validate_recurrence_rule_relations"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "account_type" "text" NOT NULL,
    "initial_balance" numeric(14,2) DEFAULT 0 NOT NULL,
    "include_in_balance" boolean DEFAULT true NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "accounts_account_type_check" CHECK (("account_type" = ANY (ARRAY['checking'::"text", 'savings'::"text", 'cash'::"text", 'digital_wallet'::"text", 'investment'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."budgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "reference_month" "date" NOT NULL,
    "limit_amount" numeric(14,2) NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "budgets_limit_amount_check" CHECK (("limit_amount" >= (0)::numeric)),
    CONSTRAINT "budgets_reference_month_check" CHECK (("reference_month" = ("date_trunc"('month'::"text", ("reference_month")::timestamp with time zone))::"date"))
);


ALTER TABLE "public"."budgets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."card_installments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "purchase_id" "uuid" NOT NULL,
    "credit_card_id" "uuid" NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "installment_number" integer NOT NULL,
    "installment_total" integer NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "card_installments_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "card_installments_check" CHECK (("installment_number" <= "installment_total")),
    CONSTRAINT "card_installments_installment_number_check" CHECK (("installment_number" >= 1)),
    CONSTRAINT "card_installments_installment_total_check" CHECK (("installment_total" >= 1)),
    CONSTRAINT "card_installments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."card_installments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."card_invoice_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "transaction_id" "uuid" NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "payment_date" "date" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "card_invoice_payments_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."card_invoice_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."card_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "credit_card_id" "uuid" NOT NULL,
    "reference_month" "date" NOT NULL,
    "closing_date" "date" NOT NULL,
    "due_date" "date" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "card_invoices_check" CHECK (("due_date" > "closing_date")),
    CONSTRAINT "card_invoices_reference_month_check" CHECK (("reference_month" = ("date_trunc"('month'::"text", ("reference_month")::timestamp with time zone))::"date")),
    CONSTRAINT "card_invoices_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text", 'paid'::"text"])))
);


ALTER TABLE "public"."card_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."card_purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "credit_card_id" "uuid" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "category_id" "uuid",
    "description" "text" NOT NULL,
    "total_amount" numeric(14,2) NOT NULL,
    "purchase_date" "date" NOT NULL,
    "installment_count" integer DEFAULT 1 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recurrence_rule_id" "uuid",
    "recurrence_reference_month" "date",
    CONSTRAINT "card_purchases_description_check" CHECK (("char_length"(TRIM(BOTH FROM "description")) > 0)),
    CONSTRAINT "card_purchases_installment_count_check" CHECK (("installment_count" >= 1)),
    CONSTRAINT "card_purchases_recurrence_reference_check" CHECK (((("recurrence_rule_id" IS NULL) AND ("recurrence_reference_month" IS NULL)) OR (("recurrence_rule_id" IS NOT NULL) AND ("recurrence_reference_month" IS NOT NULL) AND ("recurrence_reference_month" = ("date_trunc"('month'::"text", ("recurrence_reference_month")::timestamp with time zone))::"date")))),
    CONSTRAINT "card_purchases_total_amount_check" CHECK (("total_amount" > (0)::numeric))
);


ALTER TABLE "public"."card_purchases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "kind" "text" DEFAULT 'expense'::"text" NOT NULL,
    "icon" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "categories_kind_check" CHECK (("kind" = ANY (ARRAY['income'::"text", 'expense'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credit_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "name" "text" NOT NULL,
    "limit_amount" numeric(14,2) NOT NULL,
    "closing_day" integer NOT NULL,
    "due_day" integer NOT NULL,
    "payment_account_id" "uuid",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "credit_cards_closing_day_check" CHECK ((("closing_day" >= 1) AND ("closing_day" <= 31))),
    CONSTRAINT "credit_cards_due_day_check" CHECK ((("due_day" >= 1) AND ("due_day" <= 31))),
    CONSTRAINT "credit_cards_limit_amount_check" CHECK (("limit_amount" >= (0)::numeric)),
    CONSTRAINT "credit_cards_name_check" CHECK (("char_length"(TRIM(BOTH FROM "name")) > 0))
);


ALTER TABLE "public"."credit_cards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."goal_contributions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "goal_id" "uuid" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "contribution_date" "date" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "goal_contributions_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."goal_contributions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "name" "text" NOT NULL,
    "target_amount" numeric(14,2) NOT NULL,
    "target_date" "date",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "goals_name_check" CHECK (("char_length"(TRIM(BOTH FROM "name")) > 0)),
    CONSTRAINT "goals_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "goals_target_amount_check" CHECK (("target_amount" > (0)::numeric))
);


ALTER TABLE "public"."goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recurrence_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "name" "text" NOT NULL,
    "transaction_type" "text" NOT NULL,
    "category_id" "uuid",
    "account_id" "uuid",
    "amount" numeric(14,2) NOT NULL,
    "amount_type" "text" DEFAULT 'fixed'::"text" NOT NULL,
    "frequency" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "day_of_month" integer NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payment_method" "text" DEFAULT 'account'::"text" NOT NULL,
    "credit_card_id" "uuid",
    CONSTRAINT "recurrence_rules_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "recurrence_rules_amount_type_check" CHECK (("amount_type" = ANY (ARRAY['fixed'::"text", 'estimated'::"text"]))),
    CONSTRAINT "recurrence_rules_check" CHECK ((("end_date" IS NULL) OR ("end_date" >= "start_date"))),
    CONSTRAINT "recurrence_rules_day_of_month_check" CHECK ((("day_of_month" >= 1) AND ("day_of_month" <= 31))),
    CONSTRAINT "recurrence_rules_frequency_check" CHECK (("frequency" = 'monthly'::"text")),
    CONSTRAINT "recurrence_rules_name_check" CHECK (("char_length"(TRIM(BOTH FROM "name")) > 0)),
    CONSTRAINT "recurrence_rules_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['account'::"text", 'credit_card'::"text"]))),
    CONSTRAINT "recurrence_rules_payment_target_check" CHECK (((("payment_method" = 'account'::"text") AND ("account_id" IS NOT NULL) AND ("credit_card_id" IS NULL)) OR (("payment_method" = 'credit_card'::"text") AND ("transaction_type" = 'expense'::"text") AND ("account_id" IS NULL) AND ("credit_card_id" IS NOT NULL)))),
    CONSTRAINT "recurrence_rules_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['income'::"text", 'expense'::"text"])))
);


ALTER TABLE "public"."recurrence_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "description" "text" NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "transaction_type" "text" NOT NULL,
    "category_id" "uuid",
    "account_id" "uuid" NOT NULL,
    "transaction_date" "date" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "origin" "text" DEFAULT 'manual'::"text" NOT NULL,
    "card_invoice_id" "uuid",
    "paid_date" "date",
    "recurrence_rule_id" "uuid",
    "recurrence_reference_month" "date",
    CONSTRAINT "transactions_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "transactions_description_check" CHECK (("char_length"(TRIM(BOTH FROM "description")) > 0)),
    CONSTRAINT "transactions_origin_check" CHECK (("origin" = ANY (ARRAY['manual'::"text", 'card_invoice_payment'::"text", 'recurrence'::"text"]))),
    CONSTRAINT "transactions_origin_reference_check" CHECK (((("origin" = 'manual'::"text") AND ("card_invoice_id" IS NULL) AND ("recurrence_rule_id" IS NULL) AND ("recurrence_reference_month" IS NULL)) OR (("origin" = 'card_invoice_payment'::"text") AND ("card_invoice_id" IS NOT NULL) AND ("recurrence_rule_id" IS NULL) AND ("recurrence_reference_month" IS NULL)) OR (("origin" = 'recurrence'::"text") AND ("card_invoice_id" IS NULL) AND ("recurrence_rule_id" IS NOT NULL) AND ("recurrence_reference_month" = ("date_trunc"('month'::"text", ("recurrence_reference_month")::timestamp with time zone))::"date")))),
    CONSTRAINT "transactions_paid_date_check" CHECK (((("status" = 'paid'::"text") AND ("paid_date" IS NOT NULL)) OR (("status" = ANY (ARRAY['pending'::"text", 'cancelled'::"text"])) AND ("paid_date" IS NULL)))),
    CONSTRAINT "transactions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "transactions_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['income'::"text", 'expense'::"text"])))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "invited_email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workspace_invitations_invited_email_check" CHECK (("invited_email" = "lower"(TRIM(BOTH FROM "invited_email")))),
    CONSTRAINT "workspace_invitations_role_check" CHECK (("role" = ANY (ARRAY['editor'::"text", 'viewer'::"text"]))),
    CONSTRAINT "workspace_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'expired'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."workspace_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_members" (
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workspace_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'editor'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."workspace_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" DEFAULT 'personal'::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "workspace_type" "text" DEFAULT 'personal'::"text" NOT NULL,
    CONSTRAINT "workspaces_type_check" CHECK (("type" = ANY (ARRAY['personal'::"text", 'shared'::"text"]))),
    CONSTRAINT "workspaces_workspace_type_check" CHECK (("workspace_type" = ANY (ARRAY['personal'::"text", 'shared'::"text"])))
);


ALTER TABLE "public"."workspaces" OWNER TO "postgres";


ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_workspace_id_category_id_reference_month_key" UNIQUE ("workspace_id", "category_id", "reference_month");



ALTER TABLE ONLY "public"."card_installments"
    ADD CONSTRAINT "card_installments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."card_installments"
    ADD CONSTRAINT "card_installments_purchase_id_installment_number_key" UNIQUE ("purchase_id", "installment_number");



ALTER TABLE ONLY "public"."card_invoice_payments"
    ADD CONSTRAINT "card_invoice_payments_invoice_id_key" UNIQUE ("invoice_id");



ALTER TABLE ONLY "public"."card_invoice_payments"
    ADD CONSTRAINT "card_invoice_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."card_invoice_payments"
    ADD CONSTRAINT "card_invoice_payments_transaction_id_key" UNIQUE ("transaction_id");



ALTER TABLE ONLY "public"."card_invoices"
    ADD CONSTRAINT "card_invoices_credit_card_id_reference_month_key" UNIQUE ("credit_card_id", "reference_month");



ALTER TABLE ONLY "public"."card_invoices"
    ADD CONSTRAINT "card_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."card_invoices"
    ADD CONSTRAINT "card_invoices_workspace_id_credit_card_id_id_key" UNIQUE ("workspace_id", "credit_card_id", "id");



ALTER TABLE ONLY "public"."card_invoices"
    ADD CONSTRAINT "card_invoices_workspace_id_id_key" UNIQUE ("workspace_id", "id");



ALTER TABLE ONLY "public"."card_purchases"
    ADD CONSTRAINT "card_purchases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."card_purchases"
    ADD CONSTRAINT "card_purchases_workspace_id_credit_card_id_id_key" UNIQUE ("workspace_id", "credit_card_id", "id");



ALTER TABLE ONLY "public"."card_purchases"
    ADD CONSTRAINT "card_purchases_workspace_id_id_key" UNIQUE ("workspace_id", "id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_workspace_id_name_key" UNIQUE ("workspace_id", "name");



ALTER TABLE ONLY "public"."credit_cards"
    ADD CONSTRAINT "credit_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credit_cards"
    ADD CONSTRAINT "credit_cards_workspace_id_id_key" UNIQUE ("workspace_id", "id");



ALTER TABLE ONLY "public"."goal_contributions"
    ADD CONSTRAINT "goal_contributions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_workspace_id_id_key" UNIQUE ("workspace_id", "id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurrence_rules"
    ADD CONSTRAINT "recurrence_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurrence_rules"
    ADD CONSTRAINT "recurrence_rules_workspace_id_id_key" UNIQUE ("workspace_id", "id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_workspace_id_id_key" UNIQUE ("workspace_id", "id");



ALTER TABLE ONLY "public"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("workspace_id", "user_id");



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id");



CREATE INDEX "budgets_workspace_month_idx" ON "public"."budgets" USING "btree" ("workspace_id", "reference_month");



CREATE INDEX "card_installments_card_status_idx" ON "public"."card_installments" USING "btree" ("credit_card_id", "status");



CREATE INDEX "card_installments_invoice_idx" ON "public"."card_installments" USING "btree" ("invoice_id");



CREATE INDEX "card_installments_workspace_idx" ON "public"."card_installments" USING "btree" ("workspace_id");



CREATE INDEX "card_invoice_payments_account_idx" ON "public"."card_invoice_payments" USING "btree" ("account_id");



CREATE INDEX "card_invoice_payments_workspace_idx" ON "public"."card_invoice_payments" USING "btree" ("workspace_id");



CREATE INDEX "card_invoices_card_month_idx" ON "public"."card_invoices" USING "btree" ("credit_card_id", "reference_month" DESC);



CREATE INDEX "card_invoices_workspace_idx" ON "public"."card_invoices" USING "btree" ("workspace_id");



CREATE INDEX "card_purchases_card_date_idx" ON "public"."card_purchases" USING "btree" ("credit_card_id", "purchase_date" DESC);



CREATE UNIQUE INDEX "card_purchases_recurrence_occurrence_key" ON "public"."card_purchases" USING "btree" ("recurrence_rule_id", "recurrence_reference_month") WHERE ("recurrence_rule_id" IS NOT NULL);



CREATE INDEX "card_purchases_workspace_idx" ON "public"."card_purchases" USING "btree" ("workspace_id");



CREATE INDEX "credit_cards_workspace_idx" ON "public"."credit_cards" USING "btree" ("workspace_id");



CREATE INDEX "goal_contributions_goal_date_idx" ON "public"."goal_contributions" USING "btree" ("goal_id", "contribution_date" DESC);



CREATE INDEX "goal_contributions_workspace_idx" ON "public"."goal_contributions" USING "btree" ("workspace_id");



CREATE INDEX "goals_workspace_status_idx" ON "public"."goals" USING "btree" ("workspace_id", "status");



CREATE INDEX "recurrence_rules_workspace_active_idx" ON "public"."recurrence_rules" USING "btree" ("workspace_id", "active");



CREATE INDEX "transactions_account_id_idx" ON "public"."transactions" USING "btree" ("account_id");



CREATE INDEX "transactions_card_invoice_idx" ON "public"."transactions" USING "btree" ("card_invoice_id") WHERE ("card_invoice_id" IS NOT NULL);



CREATE INDEX "transactions_category_id_idx" ON "public"."transactions" USING "btree" ("category_id");



CREATE INDEX "transactions_origin_idx" ON "public"."transactions" USING "btree" ("workspace_id", "origin");



CREATE UNIQUE INDEX "transactions_recurrence_occurrence_key" ON "public"."transactions" USING "btree" ("recurrence_rule_id", "recurrence_reference_month") WHERE ("recurrence_rule_id" IS NOT NULL);



CREATE INDEX "transactions_workspace_date_idx" ON "public"."transactions" USING "btree" ("workspace_id", "transaction_date" DESC);



CREATE UNIQUE INDEX "workspace_invitations_pending_key" ON "public"."workspace_invitations" USING "btree" ("workspace_id", "invited_email") WHERE ("status" = 'pending'::"text");



CREATE OR REPLACE TRIGGER "enforce_invoice_payment_editor" BEFORE INSERT ON "public"."card_invoice_payments" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_financial_editor"();



CREATE OR REPLACE TRIGGER "set_card_invoices_audit_fields" BEFORE UPDATE ON "public"."card_invoices" FOR EACH ROW EXECUTE FUNCTION "public"."set_card_invoice_audit_fields"();



CREATE OR REPLACE TRIGGER "set_card_purchases_audit_fields" BEFORE UPDATE ON "public"."card_purchases" FOR EACH ROW EXECUTE FUNCTION "public"."set_card_owner_audit_fields"();



CREATE OR REPLACE TRIGGER "set_credit_cards_audit_fields" BEFORE UPDATE ON "public"."credit_cards" FOR EACH ROW EXECUTE FUNCTION "public"."set_card_owner_audit_fields"();



CREATE OR REPLACE TRIGGER "set_goal_audit_fields" BEFORE UPDATE ON "public"."goals" FOR EACH ROW EXECUTE FUNCTION "public"."set_goal_audit_fields"();



CREATE OR REPLACE TRIGGER "set_transactions_audit_fields" BEFORE UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."set_transaction_audit_fields"();



CREATE OR REPLACE TRIGGER "sync_goal_status_after_contribution" AFTER INSERT OR DELETE OR UPDATE ON "public"."goal_contributions" FOR EACH ROW EXECUTE FUNCTION "public"."sync_goal_status_from_contributions"();



CREATE OR REPLACE TRIGGER "validate_budget_fields" BEFORE INSERT OR UPDATE ON "public"."budgets" FOR EACH ROW EXECUTE FUNCTION "public"."validate_budget_fields"();



CREATE OR REPLACE TRIGGER "validate_card_installment_payment_state" BEFORE INSERT OR UPDATE ON "public"."card_installments" FOR EACH ROW EXECUTE FUNCTION "public"."validate_card_installment_payment_state"();



CREATE OR REPLACE TRIGGER "validate_card_purchase_category" BEFORE INSERT OR UPDATE ON "public"."card_purchases" FOR EACH ROW EXECUTE FUNCTION "public"."validate_card_purchase_category"();



CREATE OR REPLACE TRIGGER "validate_credit_card_payment_account" BEFORE INSERT OR UPDATE ON "public"."credit_cards" FOR EACH ROW EXECUTE FUNCTION "public"."validate_credit_card_payment_account"();



CREATE OR REPLACE TRIGGER "validate_goal_contribution" BEFORE INSERT OR UPDATE ON "public"."goal_contributions" FOR EACH ROW EXECUTE FUNCTION "public"."validate_goal_contribution"();



CREATE OR REPLACE TRIGGER "validate_recurrence_rule_relations" BEFORE INSERT OR UPDATE ON "public"."recurrence_rules" FOR EACH ROW EXECUTE FUNCTION "public"."validate_recurrence_rule_relations"();



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."card_installments"
    ADD CONSTRAINT "card_installments_workspace_id_credit_card_id_invoice_id_fkey" FOREIGN KEY ("workspace_id", "credit_card_id", "invoice_id") REFERENCES "public"."card_invoices"("workspace_id", "credit_card_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."card_installments"
    ADD CONSTRAINT "card_installments_workspace_id_credit_card_id_purchase_id_fkey" FOREIGN KEY ("workspace_id", "credit_card_id", "purchase_id") REFERENCES "public"."card_purchases"("workspace_id", "credit_card_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."card_installments"
    ADD CONSTRAINT "card_installments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."card_invoice_payments"
    ADD CONSTRAINT "card_invoice_payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."card_invoice_payments"
    ADD CONSTRAINT "card_invoice_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."card_invoice_payments"
    ADD CONSTRAINT "card_invoice_payments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."card_invoice_payments"
    ADD CONSTRAINT "card_invoice_payments_workspace_id_invoice_id_fkey" FOREIGN KEY ("workspace_id", "invoice_id") REFERENCES "public"."card_invoices"("workspace_id", "id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."card_invoice_payments"
    ADD CONSTRAINT "card_invoice_payments_workspace_id_transaction_id_fkey" FOREIGN KEY ("workspace_id", "transaction_id") REFERENCES "public"."transactions"("workspace_id", "id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."card_invoices"
    ADD CONSTRAINT "card_invoices_workspace_id_credit_card_id_fkey" FOREIGN KEY ("workspace_id", "credit_card_id") REFERENCES "public"."credit_cards"("workspace_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."card_invoices"
    ADD CONSTRAINT "card_invoices_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."card_purchases"
    ADD CONSTRAINT "card_purchases_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."card_purchases"
    ADD CONSTRAINT "card_purchases_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."card_purchases"
    ADD CONSTRAINT "card_purchases_recurrence_rule_id_fkey" FOREIGN KEY ("recurrence_rule_id") REFERENCES "public"."recurrence_rules"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."card_purchases"
    ADD CONSTRAINT "card_purchases_workspace_id_credit_card_id_fkey" FOREIGN KEY ("workspace_id", "credit_card_id") REFERENCES "public"."credit_cards"("workspace_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."card_purchases"
    ADD CONSTRAINT "card_purchases_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_cards"
    ADD CONSTRAINT "credit_cards_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."credit_cards"
    ADD CONSTRAINT "credit_cards_payment_account_id_fkey" FOREIGN KEY ("payment_account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credit_cards"
    ADD CONSTRAINT "credit_cards_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."goal_contributions"
    ADD CONSTRAINT "goal_contributions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."goal_contributions"
    ADD CONSTRAINT "goal_contributions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."goal_contributions"
    ADD CONSTRAINT "goal_contributions_workspace_id_goal_id_fkey" FOREIGN KEY ("workspace_id", "goal_id") REFERENCES "public"."goals"("workspace_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurrence_rules"
    ADD CONSTRAINT "recurrence_rules_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."recurrence_rules"
    ADD CONSTRAINT "recurrence_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recurrence_rules"
    ADD CONSTRAINT "recurrence_rules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."recurrence_rules"
    ADD CONSTRAINT "recurrence_rules_credit_card_id_fkey" FOREIGN KEY ("credit_card_id") REFERENCES "public"."credit_cards"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."recurrence_rules"
    ADD CONSTRAINT "recurrence_rules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_card_invoice_id_fkey" FOREIGN KEY ("card_invoice_id") REFERENCES "public"."card_invoices"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_recurrence_rule_id_fkey" FOREIGN KEY ("recurrence_rule_id") REFERENCES "public"."recurrence_rules"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



CREATE POLICY "Direct card installment deletes are denied" ON "public"."card_installments" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "Direct card installment inserts are denied" ON "public"."card_installments" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "Direct card installment updates are denied" ON "public"."card_installments" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "Direct card invoice deletes are denied" ON "public"."card_invoices" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "Direct card invoice inserts are denied" ON "public"."card_invoices" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "Direct card invoice updates are denied" ON "public"."card_invoices" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "Direct card purchase deletes are denied" ON "public"."card_purchases" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "Direct card purchase inserts are denied" ON "public"."card_purchases" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "Direct card purchase updates are denied" ON "public"."card_purchases" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "Editors delete accounts" ON "public"."accounts" FOR DELETE TO "authenticated" USING ("public"."can_edit_workspace"("workspace_id"));



CREATE POLICY "Editors delete active goal contributions" ON "public"."goal_contributions" FOR DELETE TO "authenticated" USING (("public"."can_edit_workspace"("workspace_id") AND (EXISTS ( SELECT 1
   FROM "public"."goals" "g"
  WHERE (("g"."id" = "goal_contributions"."goal_id") AND ("g"."workspace_id" = "goal_contributions"."workspace_id") AND ("g"."status" <> 'cancelled'::"text"))))));



CREATE POLICY "Editors delete budgets" ON "public"."budgets" FOR DELETE TO "authenticated" USING ("public"."can_edit_workspace"("workspace_id"));



CREATE POLICY "Editors delete categories" ON "public"."categories" FOR DELETE TO "authenticated" USING ("public"."can_edit_workspace"("workspace_id"));



CREATE POLICY "Editors delete credit cards" ON "public"."credit_cards" FOR DELETE TO "authenticated" USING ("public"."can_edit_workspace"("workspace_id"));



CREATE POLICY "Editors insert accounts" ON "public"."accounts" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_edit_workspace"("workspace_id") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "Editors insert budgets" ON "public"."budgets" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_edit_workspace"("workspace_id") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "Editors insert categories" ON "public"."categories" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_edit_workspace"("workspace_id"));



CREATE POLICY "Editors insert credit cards" ON "public"."credit_cards" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_edit_workspace"("workspace_id") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "Editors insert goal contributions" ON "public"."goal_contributions" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_edit_workspace"("workspace_id") AND ("created_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."goals" "g"
  WHERE (("g"."id" = "goal_contributions"."goal_id") AND ("g"."workspace_id" = "goal_contributions"."workspace_id") AND ("g"."status" <> 'cancelled'::"text"))))));



CREATE POLICY "Editors insert goals" ON "public"."goals" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_edit_workspace"("workspace_id") AND ("created_by" = "auth"."uid"()) AND ("status" = 'active'::"text")));



CREATE POLICY "Editors insert manual transactions" ON "public"."transactions" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_edit_workspace"("workspace_id") AND ("created_by" = "auth"."uid"()) AND ("origin" = 'manual'::"text") AND ("card_invoice_id" IS NULL) AND ("recurrence_rule_id" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."accounts" "a"
  WHERE (("a"."id" = "transactions"."account_id") AND ("a"."workspace_id" = "transactions"."workspace_id")))) AND (("category_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."categories" "c"
  WHERE (("c"."id" = "transactions"."category_id") AND ("c"."workspace_id" = "transactions"."workspace_id")))))));



CREATE POLICY "Editors insert recurrence rules" ON "public"."recurrence_rules" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_edit_workspace"("workspace_id") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "Editors update accounts" ON "public"."accounts" FOR UPDATE TO "authenticated" USING ("public"."can_edit_workspace"("workspace_id")) WITH CHECK ("public"."can_edit_workspace"("workspace_id"));



CREATE POLICY "Editors update active goal contributions" ON "public"."goal_contributions" FOR UPDATE TO "authenticated" USING (("public"."can_edit_workspace"("workspace_id") AND (EXISTS ( SELECT 1
   FROM "public"."goals" "g"
  WHERE (("g"."id" = "goal_contributions"."goal_id") AND ("g"."workspace_id" = "goal_contributions"."workspace_id") AND ("g"."status" <> 'cancelled'::"text")))))) WITH CHECK (("public"."can_edit_workspace"("workspace_id") AND (EXISTS ( SELECT 1
   FROM "public"."goals" "g"
  WHERE (("g"."id" = "goal_contributions"."goal_id") AND ("g"."workspace_id" = "goal_contributions"."workspace_id") AND ("g"."status" <> 'cancelled'::"text"))))));



CREATE POLICY "Editors update budgets" ON "public"."budgets" FOR UPDATE TO "authenticated" USING ("public"."can_edit_workspace"("workspace_id")) WITH CHECK ("public"."can_edit_workspace"("workspace_id"));



CREATE POLICY "Editors update categories" ON "public"."categories" FOR UPDATE TO "authenticated" USING ("public"."can_edit_workspace"("workspace_id")) WITH CHECK ("public"."can_edit_workspace"("workspace_id"));



CREATE POLICY "Editors update credit cards" ON "public"."credit_cards" FOR UPDATE TO "authenticated" USING ("public"."can_edit_workspace"("workspace_id")) WITH CHECK ("public"."can_edit_workspace"("workspace_id"));



CREATE POLICY "Editors update goals" ON "public"."goals" FOR UPDATE TO "authenticated" USING ("public"."can_edit_workspace"("workspace_id")) WITH CHECK ("public"."can_edit_workspace"("workspace_id"));



CREATE POLICY "Editors update recurrence rules" ON "public"."recurrence_rules" FOR UPDATE TO "authenticated" USING ("public"."can_edit_workspace"("workspace_id")) WITH CHECK ("public"."can_edit_workspace"("workspace_id"));



CREATE POLICY "Editors update transactions" ON "public"."transactions" FOR UPDATE TO "authenticated" USING ("public"."can_edit_workspace"("workspace_id")) WITH CHECK (("public"."can_edit_workspace"("workspace_id") AND (EXISTS ( SELECT 1
   FROM "public"."accounts" "a"
  WHERE (("a"."id" = "transactions"."account_id") AND ("a"."workspace_id" = "transactions"."workspace_id")))) AND (("category_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."categories" "c"
  WHERE (("c"."id" = "transactions"."category_id") AND ("c"."workspace_id" = "transactions"."workspace_id")))))));



CREATE POLICY "Members can read categories" ON "public"."categories" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "Members can read workspace members" ON "public"."workspace_members" FOR SELECT USING ("public"."is_workspace_member"("workspace_id"));



CREATE POLICY "Members can read workspaces" ON "public"."workspaces" FOR SELECT USING (("public"."is_workspace_member"("id") OR ("created_by" = "auth"."uid"())));



CREATE POLICY "Members can view accounts" ON "public"."accounts" FOR SELECT TO "authenticated" USING ("public"."can_view_workspace"("workspace_id"));



CREATE POLICY "Members can view budgets" ON "public"."budgets" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "budgets"."workspace_id") AND ("wm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Members can view card installments" ON "public"."card_installments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "card_installments"."workspace_id") AND ("wm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Members can view card invoices" ON "public"."card_invoices" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "card_invoices"."workspace_id") AND ("wm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Members can view card purchases" ON "public"."card_purchases" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "card_purchases"."workspace_id") AND ("wm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Members can view credit cards" ON "public"."credit_cards" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "credit_cards"."workspace_id") AND ("wm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Members can view goal contributions" ON "public"."goal_contributions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "goal_contributions"."workspace_id") AND ("wm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Members can view goals" ON "public"."goals" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "goals"."workspace_id") AND ("wm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Members can view invoice payments" ON "public"."card_invoice_payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "card_invoice_payments"."workspace_id") AND ("wm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Members can view recurrence rules" ON "public"."recurrence_rules" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "recurrence_rules"."workspace_id") AND ("wm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Owners view invitations" ON "public"."workspace_invitations" FOR SELECT TO "authenticated" USING ("public"."is_workspace_owner"("workspace_id"));



CREATE POLICY "Users can read own profile" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "Workspace members can view transactions" ON "public"."transactions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "wm"
  WHERE (("wm"."workspace_id" = "transactions"."workspace_id") AND ("wm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."budgets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."card_installments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."card_invoice_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."card_invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."card_purchases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."credit_cards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."goal_contributions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recurrence_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_workspace_invitation"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_workspace_invitation"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_workspace_invitation"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_workspace_invitation"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_edit_workspace"("target_workspace_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_edit_workspace"("target_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_workspace"("target_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_workspace"("target_workspace_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_view_workspace"("target_workspace_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_workspace"("target_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_workspace"("target_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_workspace"("target_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."card_date_for_day"("p_year" integer, "p_month" integer, "p_day" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."card_date_for_day"("p_year" integer, "p_month" integer, "p_day" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."card_date_for_day"("p_year" integer, "p_month" integer, "p_day" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_card_purchase"("p_credit_card_id" "uuid", "p_description" "text", "p_total_amount" numeric, "p_purchase_date" "date", "p_category_id" "uuid", "p_installment_count" integer, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_card_purchase"("p_credit_card_id" "uuid", "p_description" "text", "p_total_amount" numeric, "p_purchase_date" "date", "p_category_id" "uuid", "p_installment_count" integer, "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_card_purchase"("p_credit_card_id" "uuid", "p_description" "text", "p_total_amount" numeric, "p_purchase_date" "date", "p_category_id" "uuid", "p_installment_count" integer, "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_card_purchase"("p_credit_card_id" "uuid", "p_description" "text", "p_total_amount" numeric, "p_purchase_date" "date", "p_category_id" "uuid", "p_installment_count" integer, "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_shared_workspace"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_shared_workspace"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_shared_workspace"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_shared_workspace"("p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_workspace_invitation"("p_workspace_id" "uuid", "p_email" "text", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_workspace_invitation"("p_workspace_id" "uuid", "p_email" "text", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_workspace_invitation"("p_workspace_id" "uuid", "p_email" "text", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_workspace_invitation"("p_workspace_id" "uuid", "p_email" "text", "p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_financial_editor"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_financial_editor"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_financial_editor"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_recurrence_occurrences"("p_workspace_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_recurrence_occurrences"("p_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_recurrence_occurrences"("p_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_recurrence_occurrences"("p_workspace_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_workspace_invitation"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_workspace_invitation"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_workspace_invitation"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_workspace_invitation"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_workspace_members"("p_workspace_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_workspace_members"("p_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_workspace_members"("p_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_workspace_members"("p_workspace_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_workspace_member"("target_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_workspace_member"("target_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_workspace_member"("target_workspace_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_workspace_owner"("target_workspace_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_workspace_owner"("target_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_workspace_owner"("target_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_workspace_owner"("target_workspace_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."materialize_card_purchase"("p_credit_card_id" "uuid", "p_description" "text", "p_total_amount" numeric, "p_purchase_date" "date", "p_category_id" "uuid", "p_installment_count" integer, "p_notes" "text", "p_recurrence_rule_id" "uuid", "p_recurrence_reference_month" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."materialize_card_purchase"("p_credit_card_id" "uuid", "p_description" "text", "p_total_amount" numeric, "p_purchase_date" "date", "p_category_id" "uuid", "p_installment_count" integer, "p_notes" "text", "p_recurrence_rule_id" "uuid", "p_recurrence_reference_month" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."materialize_card_purchase"("p_credit_card_id" "uuid", "p_description" "text", "p_total_amount" numeric, "p_purchase_date" "date", "p_category_id" "uuid", "p_installment_count" integer, "p_notes" "text", "p_recurrence_rule_id" "uuid", "p_recurrence_reference_month" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."materialize_card_purchase"("p_credit_card_id" "uuid", "p_description" "text", "p_total_amount" numeric, "p_purchase_date" "date", "p_category_id" "uuid", "p_installment_count" integer, "p_notes" "text", "p_recurrence_rule_id" "uuid", "p_recurrence_reference_month" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pay_card_invoice"("p_invoice_id" "uuid", "p_account_id" "uuid", "p_payment_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pay_card_invoice"("p_invoice_id" "uuid", "p_account_id" "uuid", "p_payment_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."pay_card_invoice"("p_invoice_id" "uuid", "p_account_id" "uuid", "p_payment_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pay_card_invoice"("p_invoice_id" "uuid", "p_account_id" "uuid", "p_payment_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_workspace_member"("p_workspace_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_workspace_member"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_workspace_member"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_workspace_member"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rename_workspace"("p_workspace_id" "uuid", "p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rename_workspace"("p_workspace_id" "uuid", "p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rename_workspace"("p_workspace_id" "uuid", "p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rename_workspace"("p_workspace_id" "uuid", "p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_card_invoice_audit_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_card_invoice_audit_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_card_invoice_audit_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_card_owner_audit_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_card_owner_audit_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_card_owner_audit_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_goal_audit_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_goal_audit_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_goal_audit_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_transaction_audit_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_transaction_audit_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_transaction_audit_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_goal_status_from_contributions"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_goal_status_from_contributions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_goal_status_from_contributions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_workspace_member_role"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_workspace_member_role"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_workspace_member_role"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_workspace_member_role"("p_workspace_id" "uuid", "p_user_id" "uuid", "p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_budget_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_budget_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_budget_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_card_installment_payment_state"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_card_installment_payment_state"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_card_installment_payment_state"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_card_purchase_category"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_card_purchase_category"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_card_purchase_category"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_credit_card_payment_account"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_credit_card_payment_account"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_credit_card_payment_account"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_goal_contribution"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_goal_contribution"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_goal_contribution"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_recurrence_rule_relations"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_recurrence_rule_relations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_recurrence_rule_relations"() TO "service_role";



GRANT ALL ON TABLE "public"."accounts" TO "anon";
GRANT ALL ON TABLE "public"."accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."accounts" TO "service_role";



GRANT ALL ON TABLE "public"."budgets" TO "anon";
GRANT ALL ON TABLE "public"."budgets" TO "authenticated";
GRANT ALL ON TABLE "public"."budgets" TO "service_role";



GRANT ALL ON TABLE "public"."card_installments" TO "anon";
GRANT ALL ON TABLE "public"."card_installments" TO "authenticated";
GRANT ALL ON TABLE "public"."card_installments" TO "service_role";



GRANT ALL ON TABLE "public"."card_invoice_payments" TO "anon";
GRANT ALL ON TABLE "public"."card_invoice_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."card_invoice_payments" TO "service_role";



GRANT ALL ON TABLE "public"."card_invoices" TO "anon";
GRANT ALL ON TABLE "public"."card_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."card_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."card_purchases" TO "anon";
GRANT ALL ON TABLE "public"."card_purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."card_purchases" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."credit_cards" TO "anon";
GRANT ALL ON TABLE "public"."credit_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_cards" TO "service_role";



GRANT ALL ON TABLE "public"."goal_contributions" TO "anon";
GRANT ALL ON TABLE "public"."goal_contributions" TO "authenticated";
GRANT ALL ON TABLE "public"."goal_contributions" TO "service_role";



GRANT ALL ON TABLE "public"."goals" TO "anon";
GRANT ALL ON TABLE "public"."goals" TO "authenticated";
GRANT ALL ON TABLE "public"."goals" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."recurrence_rules" TO "anon";
GRANT ALL ON TABLE "public"."recurrence_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."recurrence_rules" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_invitations" TO "anon";
GRANT ALL ON TABLE "public"."workspace_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_members" TO "anon";
GRANT ALL ON TABLE "public"."workspace_members" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_members" TO "service_role";



GRANT ALL ON TABLE "public"."workspaces" TO "anon";
GRANT ALL ON TABLE "public"."workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."workspaces" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


-- workspace_type is canonical. The legacy type column is retained and synchronized
-- for V1 compatibility; a future migration may remove it after an independent audit.
CREATE OR REPLACE FUNCTION public.sync_workspace_type_columns() RETURNS trigger
  LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  NEW.type := NEW.workspace_type;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_workspace_type_columns
  BEFORE INSERT OR UPDATE OF type, workspace_type ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.sync_workspace_type_columns();

-- Least-privilege final grants for client-callable RPCs.
REVOKE ALL ON FUNCTION public.accept_workspace_invitation(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_edit_workspace(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_workspace(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_card_purchase(uuid,text,numeric,date,uuid,integer,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_shared_workspace(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_workspace_invitation(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ensure_recurrence_occurrences(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_workspace_members(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_workspace_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_workspace_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.materialize_card_purchase(uuid,text,numeric,date,uuid,integer,text,uuid,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pay_card_invoice(uuid,uuid,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_workspace_member(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rename_workspace(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_workspace_member_role(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_workspace_type_columns() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_workspace(uuid), public.can_view_workspace(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_card_purchase(uuid,text,numeric,date,uuid,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_shared_workspace(text), public.create_workspace_invitation(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_recurrence_occurrences(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_workspace_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid), public.is_workspace_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_card_invoice(uuid,uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_workspace_member(uuid,uuid), public.rename_workspace(uuid,text), public.update_workspace_member_role(uuid,uuid,text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_workspace_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_workspace_invitation(text) TO anon, authenticated;

-- Future functions must opt in to client execution explicitly.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Supabase Auth dependency. auth.users itself is managed by Supabase and is not
-- recreated by this baseline. Create this trigger only after handle_new_user exists.
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();



