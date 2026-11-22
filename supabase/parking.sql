-- =====================================================================
-- 마하파킹 관리자 "건물 목록 수집 → 🅿 주차장 명단"을 서버에 저장하는 표
-- 사용법: Supabase → SQL Editor → New query → 이 파일 내용 전체 붙여넣기 → Run
-- 여러 번 실행해도 안전합니다. 관리자(is_admin)만 보고 고칠 수 있습니다.
-- 한 줄 = 주차장 한 곳 (code: P+주차장관리번호~, 직접 추가한 곳은 M으로 시작, '_meta'는 설정)
-- =====================================================================
create table if not exists public.parking_lot (
  code text primary key,
  data jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists parking_lot_updated_idx on public.parking_lot (updated_at, code);

create or replace function public.parking_touch() returns trigger language plpgsql as $$
begin new.updated_at := clock_timestamp(); return new; end $$;
drop trigger if exists parking_lot_touch on public.parking_lot;
create trigger parking_lot_touch before insert or update on public.parking_lot
  for each row execute function public.parking_touch();

alter table public.parking_lot enable row level security;
drop policy if exists parking_lot_admin on public.parking_lot;
create policy parking_lot_admin on public.parking_lot for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.parking_lot to authenticated;
