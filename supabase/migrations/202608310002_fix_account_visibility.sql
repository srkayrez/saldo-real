-- Accounts created by workspace editors must also be visible to workspace members.
-- Required by INSERT ... RETURNING and by the accounts list; remains workspace-scoped.
drop policy if exists "Members can view accounts" on public.accounts;

create policy "Members can view accounts"
  on public.accounts
  for select
  to authenticated
  using (public.can_view_workspace(workspace_id));
