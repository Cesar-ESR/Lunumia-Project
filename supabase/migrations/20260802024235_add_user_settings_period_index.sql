-- Indexa la FK compuesta user_settings_period_fk.
create index user_settings_user_period_idx
  on public.user_settings (user_id, active_period_id);