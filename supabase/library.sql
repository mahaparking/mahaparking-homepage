-- =====================================================================
-- 마하파킹 관리자 "📚 자료실" — 사용 설명서 같은 문서와 올린 파일
-- 사용법: Supabase → SQL Editor → New query → 이 파일 내용 전체 붙여넣기 → Run
-- 여러 번 실행해도 안전합니다. 관리자(is_admin)만 보고 고칠 수 있습니다.
-- =====================================================================
create table if not exists public.library_docs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text default '기타',          -- 사용 설명서 · 장비 자료 · 견적·계약 서식 · 기타
  body_md text,                          -- 문서 내용(마크다운). 파일이면 비움
  file_path text,                        -- 저장소 library 안의 파일 위치
  file_name text,
  file_size bigint,
  sort int not null default 100,         -- 작을수록 위 (사용 설명서는 1)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.library_docs enable row level security;
drop policy if exists library_docs_admin on public.library_docs;
create policy library_docs_admin on public.library_docs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.library_docs to authenticated;

insert into storage.buckets (id, name, public) values ('library', 'library', false) on conflict (id) do nothing;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'library_admin_all') then
    create policy library_admin_all on storage.objects for all to authenticated
      using (bucket_id = 'library' and public.is_admin()) with check (bucket_id = 'library' and public.is_admin());
  end if;
end $$;
