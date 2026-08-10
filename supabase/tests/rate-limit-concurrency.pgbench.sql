begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :user_a, true);
select * from public.consume_rate_limit('ai-insights');
commit;
