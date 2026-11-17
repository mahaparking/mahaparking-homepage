-- =====================================================================
-- 마하파킹 관리자 "작업 · 수금" 탭에 필요한 표 · 잠금 규칙
-- 사용법: Supabase → SQL Editor → New query → 이 파일 내용 전체 붙여넣기 → Run
-- 여러 번 실행해도 안전합니다. 관리자(is_admin)만 보고 고칠 수 있습니다.
-- =====================================================================

create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  title text not null,                       -- 작업 내용 (예: 정문 차단바 교체)
  site_id uuid references public.sites(id) on delete set null,
  site_name text,                            -- 현장(단지·건물) 이름
  contact text,                              -- 담당자
  phone text,
  address text,
  work_date date,                            -- 작업일
  start_time text,                           -- 'HH:MM'
  end_time text,
  status text not null default 'planned'     -- planned 예정 · done 작업 완료 · invoiced 계산서 발행 · paid 수금 완료 · canceled 취소
    check (status in ('planned', 'done', 'invoiced', 'paid', 'canceled')),
  quote_id uuid references public.quotes(id) on delete set null,
  request_id uuid references public.requests(id) on delete set null,
  supply numeric not null default 0,         -- 공급가 (견적서에서 불러와도 고칠 수 있음)
  vat numeric not null default 0,            -- 부가세
  items jsonb not null default '[]'::jsonb,  -- 작업 내역 [{ name, qty, price, amount }] (직접 입력 · 견적서에서 불러오기)
  costs jsonb not null default '[]'::jsonb,  -- 비용 항목 [{ name, amount }]
  payments jsonb not null default '[]'::jsonb, -- 입금 기록 [{ date, amount, memo }]
  invoice_date date,                         -- 계산서 발행일
  memo text,
  cal_href text,                             -- (2단계) 네이버 캘린더에 넣은 일정 주소
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 예전에 만든 표에도 작업 내역 칸 더하기
alter table public.works add column if not exists items jsonb not null default '[]'::jsonb;

create index if not exists works_date_idx on public.works (work_date);
create index if not exists works_status_idx on public.works (status);

alter table public.works enable row level security;
drop policy if exists "관리자 작업" on public.works;
create policy "관리자 작업" on public.works for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.works to authenticated;
revoke all on public.works from anon;
