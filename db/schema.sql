-- 单电池仪器预约平台数据库结构
-- 操作位置：Supabase Dashboard → SQL Editor → New query → 粘贴并运行
-- 这份 SQL 可以重复运行；如果你已经建过旧版表，它会自动升级为支持跨多日长期测试预约。

create extension if not exists btree_gist;

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  reserver_name text not null check (char_length(trim(reserver_name)) between 1 and 50),
  contact text,
  reservation_date date not null,
  end_date date,
  start_hour smallint not null,
  end_hour smallint not null,
  purpose text,
  cancel_code_hash text,
  created_at timestamptz not null default now()
);

-- 如果表是旧版本创建的，补充跨多日预约与取消预约所需字段。
alter table public.reservations
add column if not exists end_date date;

alter table public.reservations
add column if not exists cancel_code_hash text;

update public.reservations
set end_date = reservation_date
where end_date is null;

alter table public.reservations
alter column end_date set not null;

-- 旧版本可能存在“结束小时必须大于开始小时”的约束；跨日预约需要允许 20:00 至次日 09:00 这种情况。
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and contype = 'c'
      and (
        pg_get_constraintdef(oid) ilike '%start_hour%'
        or pg_get_constraintdef(oid) ilike '%end_hour%'
        or pg_get_constraintdef(oid) ilike '%end_date%'
      )
  loop
    execute format('alter table public.reservations drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.reservations
add constraint reservations_start_hour_valid
check (start_hour >= 0 and start_hour <= 23);

alter table public.reservations
add constraint reservations_end_hour_valid
check (end_hour >= 1 and end_hour <= 24);

alter table public.reservations
add constraint reservations_time_range_valid
check (
  end_date > reservation_date
  or (end_date = reservation_date and end_hour > start_hour)
);

-- 删除旧版“同一天时间段防重叠”约束，改用支持跨日期的防重叠约束。
alter table public.reservations
drop constraint if exists reservations_no_time_overlap;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservations_no_datetime_overlap'
  ) then
    alter table public.reservations
    add constraint reservations_no_datetime_overlap
    exclude using gist (
      tsrange(
        reservation_date::timestamp + (start_hour::int * interval '1 hour'),
        end_date::timestamp + (end_hour::int * interval '1 hour'),
        '[)'
      ) with &&
    );
  end if;
end $$;

create index if not exists reservations_date_idx
on public.reservations (reservation_date, start_hour);

create index if not exists reservations_end_date_idx
on public.reservations (end_date, end_hour);

-- 这里开启 RLS，避免表被匿名客户端直接访问。
-- 本项目通过 Vercel 后端 API 使用 Secret key 访问数据库，不依赖浏览器直接访问 Supabase。
alter table public.reservations enable row level security;
