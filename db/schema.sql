-- 单电池仪器预约平台数据库结构
-- 操作位置：Supabase Dashboard → SQL Editor → New query → 粘贴并运行

create extension if not exists btree_gist;

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  reserver_name text not null check (char_length(trim(reserver_name)) between 1 and 50),
  contact text,
  reservation_date date not null,
  start_hour smallint not null check (start_hour >= 0 and start_hour <= 23),
  end_hour smallint not null check (end_hour >= 1 and end_hour <= 24 and end_hour > start_hour),
  purpose text,
  created_at timestamptz not null default now()
);

-- 防止同一天的预约时间重叠：例如 9-12 与 11-13 会被拒绝；9-12 与 12-14 可以共存。
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservations_no_time_overlap'
  ) then
    alter table public.reservations
    add constraint reservations_no_time_overlap
    exclude using gist (
      reservation_date with =,
      int4range(start_hour, end_hour, '[)') with &&
    );
  end if;
end $$;

create index if not exists reservations_date_idx
on public.reservations (reservation_date, start_hour);

-- 这里开启 RLS，避免表被匿名客户端直接访问。
-- 本项目通过 Vercel 后端 API 使用 Secret key 访问数据库，不依赖浏览器直接访问 Supabase。
alter table public.reservations enable row level security;
