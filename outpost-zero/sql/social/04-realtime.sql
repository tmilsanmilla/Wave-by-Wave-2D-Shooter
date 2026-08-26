-- OUTPOST ZERO / SOCIAL / 04: REALTIME REFRESH HINTS
-- Requires 01 through 03. Safe to run again.

-- Realtime is used only as a refresh hint; RLS still controls which rows arrive.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friendships'
  ) then alter publication supabase_realtime add table public.friendships; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'private_messages'
  ) then alter publication supabase_realtime add table public.private_messages; end if;
end;
$$;
