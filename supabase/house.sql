-- =====================================================================
-- 마하파킹 관리자 "건물 목록 수집 → 🏘 빌라·소규모 공동주택 명단"을 서버에 저장하는 표
-- 사용법: Supabase → SQL Editor → New query → 이 파일 내용 전체 붙여넣기 → Run
-- 여러 번 실행해도 안전합니다. 관리자(is_admin)만 보고 고칠 수 있습니다.
-- 한 줄 = 대지(지번) 한 곳 (code: B+시군구+법정동+번-지, 직접 추가한 곳은 M으로 시작, '_meta'는 설정)
-- =====================================================================
create table if not exists public.house_bld (
  code text primary key,
  data jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists house_bld_updated_idx on public.house_bld (updated_at, code);

create or replace function public.house_touch() returns trigger language plpgsql as $$
begin new.updated_at := clock_timestamp(); return new; end $$;
drop trigger if exists house_bld_touch on public.house_bld;
create trigger house_bld_touch before insert or update on public.house_bld
  for each row execute function public.house_touch();

alter table public.house_bld enable row level security;
drop policy if exists house_bld_admin on public.house_bld;
create policy house_bld_admin on public.house_bld for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.house_bld to authenticated;
