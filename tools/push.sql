-- 新しい号の通知（Web Push）の登録先。Supabase の SQL Editor に貼って1回実行する。
-- 登録情報はテーブルに直接触れず、下の関数だけで出し入れする。

create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- 登録（同じ端末なら上書き）
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 or length(p_p256dh) > 200 or length(p_auth) > 100 then
    raise exception 'bad subscription';
  end if;
  insert into public.push_subscriptions (endpoint, p256dh, auth) values (p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

-- 解除（通知オフ、または送信先が無効になったとき）
create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

-- 一覧（送信用。GitHub の Secrets にある合言葉を知っている送信側だけが読める）
create or replace function public.list_push_subscriptions(token text)
returns setof public.push_subscriptions language plpgsql security definer set search_path = public as $$
begin
  if md5(token) <> '27d1131b3d6e55219221dddc01a252c8' then raise exception 'forbidden'; end if;
  return query select * from public.push_subscriptions;
end;
$$;

grant execute on function public.save_push_subscription(text, text, text) to anon;
grant execute on function public.delete_push_subscription(text) to anon;
grant execute on function public.list_push_subscriptions(text) to anon;
