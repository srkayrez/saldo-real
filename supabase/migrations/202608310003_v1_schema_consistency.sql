-- V1 schema consistency. Additive/non-destructive; do not remove the legacy workspace type column yet.

-- Every membership flow already supplies owner/editor/viewer explicitly.
alter table public.workspace_members alter column role drop default;

-- workspace_type is the application canonical column. Keep the legacy type column
-- synchronized until a future, separately audited migration can remove it.
update public.workspaces set type = workspace_type where type is distinct from workspace_type;

create or replace function public.sync_workspace_type_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.type := new.workspace_type;
  return new;
end;
$$;

drop trigger if exists sync_workspace_type_columns on public.workspaces;
create trigger sync_workspace_type_columns
  before insert or update of type, workspace_type on public.workspaces
  for each row execute function public.sync_workspace_type_columns();

-- The application uses digital_wallet; normalize the legacy database spelling.
update public.accounts set account_type = 'digital_wallet' where account_type = 'wallet';
alter table public.accounts drop constraint if exists accounts_account_type_check;
alter table public.accounts add constraint accounts_account_type_check
  check (account_type in ('checking','savings','cash','digital_wallet','investment','other'));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare new_workspace_id uuid;
begin
  insert into public.profiles(id, full_name)
  values(new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));

  insert into public.workspaces(name, type, workspace_type, created_by)
  values('Minhas finanças', 'personal', 'personal', new.id)
  returning id into new_workspace_id;

  insert into public.workspace_members(workspace_id, user_id, role)
  values(new_workspace_id, new.id, 'owner');

  insert into public.categories(workspace_id, name, kind, icon) values
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

-- Least privilege for callable functions. Trigger/internal functions are not client RPCs.
revoke all on function public.accept_workspace_invitation(text) from public, anon;
revoke all on function public.can_edit_workspace(uuid) from public, anon;
revoke all on function public.can_view_workspace(uuid) from public, anon;
revoke all on function public.create_card_purchase(uuid,text,numeric,date,uuid,integer,text) from public, anon;
revoke all on function public.create_shared_workspace(text) from public, anon;
revoke all on function public.create_workspace_invitation(uuid,text,text) from public, anon;
revoke all on function public.ensure_recurrence_occurrences(uuid) from public, anon;
revoke all on function public.get_workspace_members(uuid) from public, anon;
revoke all on function public.is_workspace_member(uuid) from public, anon;
revoke all on function public.is_workspace_owner(uuid) from public, anon;
revoke all on function public.materialize_card_purchase(uuid,text,numeric,date,uuid,integer,text,uuid,date) from public, anon, authenticated;
revoke all on function public.pay_card_invoice(uuid,uuid,date) from public, anon;
revoke all on function public.remove_workspace_member(uuid,uuid) from public, anon;
revoke all on function public.rename_workspace(uuid,text) from public, anon;
revoke all on function public.update_workspace_member_role(uuid,uuid,text) from public, anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.sync_workspace_type_columns() from public, anon, authenticated;

grant execute on function public.accept_workspace_invitation(text) to authenticated;
grant execute on function public.can_edit_workspace(uuid), public.can_view_workspace(uuid) to authenticated;
grant execute on function public.create_card_purchase(uuid,text,numeric,date,uuid,integer,text) to authenticated;
grant execute on function public.create_shared_workspace(text), public.create_workspace_invitation(uuid,text,text) to authenticated;
grant execute on function public.ensure_recurrence_occurrences(uuid) to authenticated;
grant execute on function public.get_workspace_members(uuid) to authenticated;
grant execute on function public.is_workspace_member(uuid), public.is_workspace_owner(uuid) to authenticated;
grant execute on function public.pay_card_invoice(uuid,uuid,date) to authenticated;
grant execute on function public.remove_workspace_member(uuid,uuid), public.rename_workspace(uuid,text), public.update_workspace_member_role(uuid,uuid,text) to authenticated;

-- Invitation lookup is intentionally public; it returns no token hash.
revoke all on function public.get_workspace_invitation(text) from public;
grant execute on function public.get_workspace_invitation(text) to anon, authenticated;

-- New functions must opt in to client execution explicitly.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
