-- 💰 매입 · 매출 장부 (관리자 화면 "매입·매출" 탭, assets/ledger/ledger.js)
-- 한 줄 = 거래 한 건. 여러 번 실행해도 안전합니다.
-- 권한: 대표는 모두, 직원은 계정 관리에서 "매입·매출" 메뉴 권한을 준 사람만 (has_perm('ledger'))
create table if not exists public.ledger (
  id uuid primary key default gen_random_uuid(),
  d date not null default current_date,           -- 날짜
  kind text not null default 'in' check (kind in ('in', 'out')),  -- in = 매출, out = 매입(지출)
  cat text not null default '',                    -- 매입 항목: 일반 경비 / 재고 구매 / 공구 구매
  proof text not null default '세금계산서',          -- 증빙: 세금계산서 / 현금영수증 / 카드 / 현금(증빙 없음)
  party text not null default '',                  -- 거래처
  item text not null default '',                   -- 내용
  supply bigint not null default 0,                -- 공급가
  vat bigint not null default 0,                   -- 부가세
  total bigint not null default 0,                 -- 합계
  memo text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ledger_d_idx on public.ledger (d desc);
alter table public.ledger enable row level security;
grant select, insert, update, delete on public.ledger to authenticated;
do $$ begin
  if exists (select 1 from pg_proc where proname = 'has_perm') then
    drop policy if exists ledger_perm_read on public.ledger;
    drop policy if exists ledger_perm_write on public.ledger;
    create policy ledger_perm_read on public.ledger for select to authenticated using (public.has_perm('ledger', 'view'));
    create policy ledger_perm_write on public.ledger for all to authenticated using (public.has_perm('ledger', 'edit')) with check (public.has_perm('ledger', 'edit'));
  else
    drop policy if exists ledger_admin_all on public.ledger;
    create policy ledger_admin_all on public.ledger for all to authenticated using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;

notify pgrst, 'reload schema';
