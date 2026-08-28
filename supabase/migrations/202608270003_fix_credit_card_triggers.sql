-- Fixes generic record-field access in the first credit-card trigger functions.
-- Safe to run after 202608270002_create_credit_cards.sql.
drop trigger if exists validate_credit_card_payment_account on public.credit_cards;
drop trigger if exists validate_card_purchase_category on public.card_purchases;
drop trigger if exists set_credit_cards_audit_fields on public.credit_cards;
drop trigger if exists set_card_purchases_audit_fields on public.card_purchases;
drop trigger if exists set_card_invoices_audit_fields on public.card_invoices;

drop function if exists public.validate_card_external_relation();
drop function if exists public.set_card_audit_fields();

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
