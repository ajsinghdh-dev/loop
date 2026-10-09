-- Turns on server-side push reminders for Loop (runs every 5 minutes).
-- Needs two Postgres extensions on the project: pg_cron and pg_net.
-- Additive only: it creates the `cron` and `net` schemas and one job named 'loop-push-run'.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'loop-push-run',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://rlgmwjkjbctcrarxmzhs.supabase.co/functions/v1/loop-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || '<ANON_KEY>',
      'x-loop-cron', (select cron_key from public.loop_push_keys where id = 1)
    ),
    body := '{"action":"run"}'::jsonb
  );
  $$
);

-- To turn it off later:  select cron.unschedule('loop-push-run');
