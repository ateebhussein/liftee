-- Liftee: track which worksheet/tab within the chosen spreadsheet holds
-- workout data. Needed because tabs are now named after their creation
-- date (e.g. lifteeworkoutdb_20260913) instead of a fixed "WorkoutLog"
-- string, so the exact name has to be remembered per connection rather
-- than assumed by the client.

alter table public.google_connections
  add column sheet_tab_name text;
