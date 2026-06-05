-- 单电池仪器预约平台数据库结构
-- 操作位置：Supabase Dashboard → SQL Editor → New query → 粘贴并运行
-- 这份 SQL 可以重复运行；如果你已经建过旧版表，它会自动升级。
-- 新增功能：跨多日预约、软取消保留历史、仪器使用反馈、异常提醒与历史查询。

create extension if not exists btree_gist;

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active',
  reserver_name text not null check (char_length(trim(reserver_name)) between 1 and 50),
  contact text,
  reservation_date date not null,
  end_date date,
  start_hour smallint not null,
  end_hour smallint not null,
  purpose text,
  cancel_code_hash text,
  created_at timestamptz not null default now(),
  canceled_at timestamptz,
  feedback_instrument_ok boolean,
  feedback_backpressure_released boolean,
  feedback_hydrogen_shutdown boolean,
  feedback_note text,
  feedback_submitted_at timestamptz,
  issue_resolved boolean not null default true,
  issue_resolved_at timestamptz
);

-- 如果表是旧版本创建的，补充所需字段。
alter table public.reservations add column if not exists status text;
alter table public.reservations add column if not exists end_date date;
alter table public.reservations add column if not exists cancel_code_hash text;
alter table public.reservations add column if not exists canceled_at timestamptz;
alter table public.reservations add column if not exists feedback_instrument_ok boolean;
alter table public.reservations add column if not exists feedback_backpressure_released boolean;
alter table public.reservations add column if not exists feedback_hydrogen_shutdown boolean;
alter table public.reservations add column if not exists feedback_note text;
alter table public.reservations add column if not exists feedback_submitted_at timestamptz;
alter table public.reservations add column if not exists issue_resolved boolean;
alter table public.reservations add column if not exists issue_resolved_at timestamptz;

update public.reservations set end_date = reservation_date where end_date is null;
update public.reservations set status = 'active' where status is null;
update public.reservations set issue_resolved = true where issue_resolved is null;

alter table public.reservations alter column end_date set not null;
alter table public.reservations alter column status set default 'active';
alter table public.reservations alter column status set not null;
alter table public.reservations alter column issue_resolved set default true;
alter table public.reservations alter column issue_resolved set not null;

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
        or pg_get_constraintdef(oid) ilike '%status%'
      )
  loop
    execute format('alter table public.reservations drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.reservations
add constraint reservations_status_valid
check (status in ('active', 'canceled'));

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

-- 删除旧版防重叠约束，改用“仅 active 预约防重叠”的约束。
-- 这样取消预约后记录仍可留在历史中，但时间段会重新开放。
alter table public.reservations drop constraint if exists reservations_no_time_overlap;
alter table public.reservations drop constraint if exists reservations_no_datetime_overlap;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservations_no_active_datetime_overlap'
  ) then
    alter table public.reservations
    add constraint reservations_no_active_datetime_overlap
    exclude using gist (
      tsrange(
        reservation_date::timestamp + (start_hour::int * interval '1 hour'),
        end_date::timestamp + (end_hour::int * interval '1 hour'),
        '[)'
      ) with &&
    ) where (status = 'active');
  end if;
end $$;

create index if not exists reservations_status_date_idx
on public.reservations (status, reservation_date, start_hour);

create index if not exists reservations_end_date_idx
on public.reservations (end_date, end_hour);

create index if not exists reservations_feedback_idx
on public.reservations (feedback_submitted_at, issue_resolved);

-- 这里开启 RLS，避免表被匿名客户端直接访问。
-- 本项目通过 Vercel 后端 API 使用 Secret key 访问数据库，不依赖浏览器直接访问 Supabase。
alter table public.reservations enable row level security;
