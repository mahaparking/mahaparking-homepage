-- =====================================================================
-- 마하파킹 관리자 "건물 목록 수집 → 아파트 명단"을 서버에 저장하는 표
-- 사용법: Supabase → SQL Editor → New query → 이 파일 내용 전체 붙여넣기 → Run
-- 여러 번 실행해도 안전합니다. 관리자(is_admin)만 보고 고칠 수 있습니다.
-- 한 줄 = 단지 한 곳 (code: 공공데이터 단지코드, 직접 추가한 곳은 M으로 시작, '_meta'는 설정)
-- =====================================================================

create table if not exists public.kapt_complex (
  code text primary key,
  list jsonb,                                  -- 단지 목록(파일·공공데이터) + 직접 고친 값(my) · 삭제 표시(hidden)
  info jsonb,                                  -- 관리사무소 전화·팩스 등 받아 온 정보
  updated_at timestamptz not null default now()
);
create index if not exists kapt_complex_updated_idx on public.kapt_complex (updated_at, code);

create or replace function public.kapt_touch() returns trigger language plpgsql as $$
begin new.updated_at := clock_timestamp(); return new; end $$;
drop trigger if exists kapt_complex_touch on public.kapt_complex;
create trigger kapt_complex_touch before insert or update on public.kapt_complex
  for each row execute function public.kapt_touch();

alter table public.kapt_complex enable row level security;
drop policy if exists kapt_complex_admin on public.kapt_complex;
create policy kapt_complex_admin on public.kapt_complex for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.kapt_complex to authenticated;
