-- Shared workspaces V1: roles, invitations and centralized authorization.
create extension if not exists pgcrypto;

alter table public.workspaces add column if not exists workspace_type text not null default 'personal';
alter table public.workspaces add column if not exists created_by uuid references auth.users(id) on delete restrict;
alter table public.workspaces drop constraint if exists workspaces_workspace_type_check;
alter table public.workspaces add constraint workspaces_workspace_type_check check (workspace_type in ('personal', 'shared'));

update public.workspace_members set role = 'editor' where role = 'member';
alter table public.workspace_members drop constraint if exists workspace_members_role_check;
alter table public.workspace_members add constraint workspace_members_role_check check (role in ('owner', 'editor', 'viewer'));

create or replace function public.can_view_workspace(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members wm where wm.workspace_id = target_workspace_id and wm.user_id = auth.uid());
$$;
create or replace function public.can_edit_workspace(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members wm where wm.workspace_id = target_workspace_id and wm.user_id = auth.uid() and wm.role in ('owner', 'editor'));
$$;
create or replace function public.is_workspace_owner(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members wm where wm.workspace_id = target_workspace_id and wm.user_id = auth.uid() and wm.role = 'owner');
$$;
revoke all on function public.can_view_workspace(uuid), public.can_edit_workspace(uuid), public.is_workspace_owner(uuid) from public;
grant execute on function public.can_view_workspace(uuid), public.can_edit_workspace(uuid), public.is_workspace_owner(uuid) to authenticated;

-- Remove every existing write policy from financial tables, then rebuild from one role rule.
do $$ declare p record; begin
  for p in select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename = any(array['accounts','categories','transactions','credit_cards','card_purchases','card_invoices','card_installments','card_invoice_payments','recurrence_rules','budgets','goals','goal_contributions'])
      and cmd in ('INSERT','UPDATE','DELETE','ALL')
  loop execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename); end loop;
end $$;

create policy "Editors insert accounts" on public.accounts for insert to authenticated with check (public.can_edit_workspace(workspace_id) and created_by = auth.uid());
create policy "Editors update accounts" on public.accounts for update to authenticated using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
create policy "Editors delete accounts" on public.accounts for delete to authenticated using (public.can_edit_workspace(workspace_id));
create policy "Editors insert categories" on public.categories for insert to authenticated with check (public.can_edit_workspace(workspace_id));
create policy "Editors update categories" on public.categories for update to authenticated using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
create policy "Editors delete categories" on public.categories for delete to authenticated using (public.can_edit_workspace(workspace_id));

create policy "Editors insert manual transactions" on public.transactions for insert to authenticated with check (public.can_edit_workspace(workspace_id) and created_by = auth.uid() and origin = 'manual' and card_invoice_id is null and recurrence_rule_id is null and exists (select 1 from public.accounts a where a.id = account_id and a.workspace_id = transactions.workspace_id) and (category_id is null or exists (select 1 from public.categories c where c.id = category_id and c.workspace_id = transactions.workspace_id)));
create policy "Editors update transactions" on public.transactions for update to authenticated using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id) and exists (select 1 from public.accounts a where a.id = account_id and a.workspace_id = transactions.workspace_id) and (category_id is null or exists (select 1 from public.categories c where c.id = category_id and c.workspace_id = transactions.workspace_id)));

create policy "Editors insert credit cards" on public.credit_cards for insert to authenticated with check (public.can_edit_workspace(workspace_id) and created_by = auth.uid());
create policy "Editors update credit cards" on public.credit_cards for update to authenticated using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
create policy "Editors delete credit cards" on public.credit_cards for delete to authenticated using (public.can_edit_workspace(workspace_id));
create policy "Editors insert card purchases" on public.card_purchases for insert to authenticated with check (public.can_edit_workspace(workspace_id) and created_by = auth.uid());
create policy "Editors update card purchases" on public.card_purchases for update to authenticated using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
create policy "Editors delete card purchases" on public.card_purchases for delete to authenticated using (public.can_edit_workspace(workspace_id));
create policy "Editors insert card invoices" on public.card_invoices for insert to authenticated with check (public.can_edit_workspace(workspace_id));
create policy "Editors update card invoices" on public.card_invoices for update to authenticated using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
create policy "Editors delete card invoices" on public.card_invoices for delete to authenticated using (public.can_edit_workspace(workspace_id));
create policy "Editors insert card installments" on public.card_installments for insert to authenticated with check (public.can_edit_workspace(workspace_id));
create policy "Editors update card installments" on public.card_installments for update to authenticated using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
create policy "Editors delete card installments" on public.card_installments for delete to authenticated using (public.can_edit_workspace(workspace_id));

create policy "Editors insert recurrence rules" on public.recurrence_rules for insert to authenticated with check (public.can_edit_workspace(workspace_id) and created_by = auth.uid());
create policy "Editors update recurrence rules" on public.recurrence_rules for update to authenticated using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
create policy "Editors insert budgets" on public.budgets for insert to authenticated with check (public.can_edit_workspace(workspace_id) and created_by = auth.uid());
create policy "Editors update budgets" on public.budgets for update to authenticated using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
create policy "Editors delete budgets" on public.budgets for delete to authenticated using (public.can_edit_workspace(workspace_id));
create policy "Editors insert goals" on public.goals for insert to authenticated with check (public.can_edit_workspace(workspace_id) and created_by = auth.uid() and status = 'active');
create policy "Editors update goals" on public.goals for update to authenticated using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
create policy "Editors insert goal contributions" on public.goal_contributions for insert to authenticated with check (public.can_edit_workspace(workspace_id) and created_by = auth.uid() and exists (select 1 from public.goals g where g.id = goal_id and g.workspace_id = goal_contributions.workspace_id and g.status <> 'cancelled'));
create policy "Editors update goal contributions" on public.goal_contributions for update to authenticated using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id));
create policy "Editors delete goal contributions" on public.goal_contributions for delete to authenticated using (public.can_edit_workspace(workspace_id));

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invited_email text not null check (invited_email = lower(trim(invited_email))), role text not null check (role in ('editor','viewer')),
  invited_by uuid not null references auth.users(id) on delete restrict, token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired','revoked')),
  expires_at timestamptz not null, accepted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index workspace_invitations_pending_key on public.workspace_invitations(workspace_id, invited_email) where status = 'pending';
alter table public.workspace_invitations enable row level security;
create policy "Owners view invitations" on public.workspace_invitations for select to authenticated using (public.is_workspace_owner(workspace_id));

create or replace function public.enforce_financial_editor()
returns trigger language plpgsql set search_path = '' as $$ begin
  if not public.can_edit_workspace(new.workspace_id) then raise exception 'Editor permission required'; end if;
  return new;
end; $$;
create trigger enforce_invoice_payment_editor before insert on public.card_invoice_payments
  for each row execute function public.enforce_financial_editor();

create or replace function public.create_shared_workspace(p_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(trim(p_name)) < 1 or char_length(trim(p_name)) > 120 then raise exception 'Invalid workspace name'; end if;
  insert into public.workspaces(name, workspace_type, created_by) values(trim(p_name), 'shared', auth.uid()) returning id into v_id;
  insert into public.workspace_members(workspace_id, user_id, role) values(v_id, auth.uid(), 'owner');
  return v_id;
end; $$;

create or replace function public.create_workspace_invitation(p_workspace_id uuid, p_email text, p_role text)
returns table(token text, invitation_id uuid) language plpgsql security definer set search_path = '' as $$
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
end; $$;

create or replace function public.accept_workspace_invitation(p_token text) returns uuid language plpgsql security definer set search_path = '' as $$
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

create or replace function public.update_workspace_member_role(p_workspace_id uuid,p_user_id uuid,p_role text) returns void language plpgsql security definer set search_path = '' as $$
declare v_old text; begin
  if not public.is_workspace_owner(p_workspace_id) then raise exception 'Owner permission required'; end if;
  if p_role not in ('owner','editor','viewer') then raise exception 'Invalid role'; end if;
  select role into v_old from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id for update;
  if not found then raise exception 'Member not found'; end if;
  if v_old='owner' and p_role<>'owner' and (select count(*) from public.workspace_members where workspace_id=p_workspace_id and role='owner')<=1 then raise exception 'Cannot demote the last owner'; end if;
  update public.workspace_members set role=p_role where workspace_id=p_workspace_id and user_id=p_user_id;
end; $$;

create or replace function public.remove_workspace_member(p_workspace_id uuid,p_user_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_role text; v_type text; begin
  select role into v_role from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id for update;
  if not found then raise exception 'Member not found'; end if;
  select workspace_type into v_type from public.workspaces where id=p_workspace_id;
  if p_user_id<>auth.uid() and not public.is_workspace_owner(p_workspace_id) then raise exception 'Owner permission required'; end if;
  if p_user_id=auth.uid() and v_type='personal' then raise exception 'Personal workspace cannot be left'; end if;
  if v_role='owner' and (select count(*) from public.workspace_members where workspace_id=p_workspace_id and role='owner')<=1 then raise exception 'Cannot remove the last owner'; end if;
  delete from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id;
end; $$;

revoke all on function public.create_shared_workspace(text), public.create_workspace_invitation(uuid,text,text), public.accept_workspace_invitation(text), public.update_workspace_member_role(uuid,uuid,text), public.remove_workspace_member(uuid,uuid) from public;
grant execute on function public.create_shared_workspace(text), public.create_workspace_invitation(uuid,text,text), public.accept_workspace_invitation(text), public.update_workspace_member_role(uuid,uuid,text), public.remove_workspace_member(uuid,uuid) to authenticated;

create or replace function public.get_workspace_members(p_workspace_id uuid)
returns table(user_id uuid, email text, display_name text, role text) language sql stable security definer set search_path = '' as $$
  select wm.user_id, u.email::text, split_part(u.email,'@',1)::text, wm.role
  from public.workspace_members wm join auth.users u on u.id=wm.user_id
  where wm.workspace_id=p_workspace_id and public.can_view_workspace(p_workspace_id) order by wm.role='owner' desc, u.email;
$$;
create or replace function public.get_workspace_invitation(p_token text)
returns table(workspace_name text, invited_email text, role text, status text, expires_at timestamptz) language sql stable security definer set search_path = '' as $$
  select w.name::text, wi.invited_email, wi.role, case when wi.status='pending' and wi.expires_at<=now() then 'expired' else wi.status end, wi.expires_at
  from public.workspace_invitations wi join public.workspaces w on w.id=wi.workspace_id
  where wi.token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
$$;
revoke all on function public.get_workspace_members(uuid), public.get_workspace_invitation(text) from public;
grant execute on function public.get_workspace_members(uuid) to authenticated;
grant execute on function public.get_workspace_invitation(text) to anon, authenticated;

do $$ declare p record; begin
  for p in select schemaname, tablename, policyname from pg_policies
    where schemaname='public' and tablename=any(array['workspaces','workspace_members']) and cmd in ('INSERT','UPDATE','DELETE','ALL')
  loop execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename); end loop;
end $$;

create or replace function public.rename_workspace(p_workspace_id uuid,p_name text) returns void language plpgsql security definer set search_path = '' as $$ begin
  if not public.is_workspace_owner(p_workspace_id) then raise exception 'Owner permission required'; end if;
  if char_length(trim(p_name))<1 or char_length(trim(p_name))>120 then raise exception 'Invalid workspace name'; end if;
  update public.workspaces set name=trim(p_name) where id=p_workspace_id;
end; $$;
revoke all on function public.rename_workspace(uuid,text) from public;
grant execute on function public.rename_workspace(uuid,text) to authenticated;
