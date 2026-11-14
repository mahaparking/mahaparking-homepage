-- =====================================================================
-- 마하파킹 관리자 "영업·홍보" 탭에 필요한 표 · 잠금 규칙 · 저장소
-- 사용법: Supabase → SQL Editor → New query → 이 파일 내용 전체 붙여넣기 → Run
-- 여러 번 실행해도 안전합니다 (이미 있으면 건너뜁니다).
-- 기존 is_admin() 함수(관리자 확인)를 그대로 사용합니다.
-- =====================================================================

-- 1) 단지(거래처) ------------------------------------------------------
create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text default '아파트',          -- 아파트 · 빌라 · 상가 · 오피스텔 · 공영주차장 · 기타
  region text,                         -- 예) 안양 만안구
  address text,
  office_tel text,                     -- 관리사무소 대표번호
  office_fax text,
  households int,
  mgmt_company text,                   -- 위탁관리회사
  equipment text,                      -- 설치 장비 메모
  status text not null default 'lead', -- lead(영업 대상) · client(거래처) · hold(보류)
  need_new_manager boolean not null default false, -- 소장님이 떠나 새 소장님 확인 필요
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) 관리소장(사람) ----------------------------------------------------
create table if not exists public.managers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text default '관리소장',
  mobile text,                         -- 휴대폰 (문자·카톡 받는 번호)
  email text,
  consent boolean not null default false,  -- 홍보 문자·카톡 수신 동의
  consent_at timestamptz,
  consent_how text,                    -- 방문 구두 · 전화 · 명함 받을 때 · 홈페이지 신청 등
  opt_out boolean not null default false,  -- 수신거부
  opt_out_at timestamptz,
  worked_with boolean not null default false, -- 함께 일해 본 소장님
  memo text,
  card_path text,                      -- 명함 사진 (cards 저장소)
  source text not null default 'admin',-- admin(직접 등록) · web(홈페이지 신청)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists managers_mobile_idx on public.managers (regexp_replace(coalesce(mobile, ''), '\D', '', 'g'));

-- 3) 근무 이력 (어느 소장님이 어느 단지에 언제) -------------------------
create table if not exists public.manager_jobs (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references public.managers(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  site_name text,                      -- 단지를 아직 등록하지 않았을 때 이름만
  start_date date,
  end_date date,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists manager_jobs_manager_idx on public.manager_jobs (manager_id);
create index if not exists manager_jobs_site_idx on public.manager_jobs (site_id);

-- 4) 홍보물 (이미지 · 동영상) -----------------------------------------
create table if not exists public.promos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'image',  -- image · video
  file_path text,                      -- promos 저장소 안 경로 (원본)
  mms_path text,                       -- 문자(MMS)용 작은 jpg (200KB 이하)
  body text,                           -- 기본 안내 문구
  is_public boolean not null default true, -- 영상 보기 페이지 공개
  views int not null default 0,
  created_at timestamptz not null default now()
);

-- 5) 보낸 기록 -----------------------------------------------------------
create table if not exists public.promo_sends (
  id uuid primary key default gen_random_uuid(),
  promo_id uuid references public.promos(id) on delete set null,
  promo_title text,
  channel text not null,               -- sms · lms · mms · kakao · phone_app(폰 문자앱)
  text text,
  recipients jsonb not null default '[]'::jsonb, -- [{manager_id, name, phone, ok, error}]
  total int not null default 0,
  ok int not null default 0,
  fail int not null default 0,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

-- 6) 영업·홍보 설정 (발신번호 등) ---------------------------------------
create table if not exists public.sales_settings (
  key text primary key,
  value text
);
insert into public.sales_settings (key, value) values
  ('sender', '07048661036'),
  ('company', '마하파킹'),
  ('company_tel', '070-4866-1036'),
  ('test_to', ''),
  ('optout_tel', '')
on conflict (key) do nothing;

-- 잠금 규칙: 관리자만 읽고 쓸 수 있음 ------------------------------------
alter table public.sites enable row level security;
alter table public.managers enable row level security;
alter table public.manager_jobs enable row level security;
alter table public.promos enable row level security;
alter table public.promo_sends enable row level security;
alter table public.sales_settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sites','managers','manager_jobs','promos','promo_sends','sales_settings'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_admin_all') then
      execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
    end if;
  end loop;
end $$;

-- 공개 기능 (로그인 없이 쓰는 3가지, 꼭 필요한 일만 함) --------------------

-- (가) 홍보물 보기: 공개된 홍보물 1건과 조회수 +1
create or replace function public.promo_view(p_id uuid)
returns table (id uuid, title text, kind text, file_path text, body text)
language plpgsql security definer set search_path = public as $$
begin
  update public.promos set views = views + 1 where promos.id = p_id and promos.is_public;
  return query select p.id, p.title, p.kind, p.file_path, p.body from public.promos p where p.id = p_id and p.is_public;
end $$;

-- (나) 관리소장님 '소식 받기' 신청 (수신 동의 기록)
create or replace function public.manager_subscribe(p_name text, p_site text, p_phone text, p_title text default '관리소장')
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  d text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  mid uuid;
begin
  if length(coalesce(trim(p_name), '')) < 2 or length(p_name) > 40 then raise exception '이름을 확인해 주세요.'; end if;
  if d !~ '^01[016789][0-9]{7,8}$' then raise exception '휴대폰 번호를 확인해 주세요.'; end if;
  if length(coalesce(p_site, '')) > 80 or length(coalesce(p_title, '')) > 20 then raise exception '입력이 너무 깁니다.'; end if;

  select m.id into mid from public.managers m where regexp_replace(coalesce(m.mobile, ''), '\D', '', 'g') = d limit 1;
  if mid is null then
    insert into public.managers (name, title, mobile, consent, consent_at, consent_how, source)
    values (trim(p_name), coalesce(nullif(trim(p_title), ''), '관리소장'), d, true, now(), '홈페이지 신청', 'web')
    returning managers.id into mid;
  else
    update public.managers set consent = true, consent_at = now(), consent_how = '홈페이지 신청',
      opt_out = false, opt_out_at = null, updated_at = now() where managers.id = mid;
  end if;

  if coalesce(trim(p_site), '') <> '' and not exists (
    select 1 from public.manager_jobs j where j.manager_id = mid and j.is_current and coalesce(j.site_name, '') = trim(p_site)
  ) then
    update public.manager_jobs set is_current = false, end_date = current_date where manager_id = mid and is_current;
    insert into public.manager_jobs (manager_id, site_id, site_name, start_date, is_current)
    values (mid, (select s.id from public.sites s where s.name = trim(p_site) limit 1), trim(p_site), current_date, true);
  end if;
  return true;
end $$;

-- (다) 수신거부: 번호만 받아 처리 (등록 여부는 알려 주지 않음)
create or replace function public.promo_optout(p_phone text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare d text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if length(d) between 9 and 12 then
    update public.managers set opt_out = true, opt_out_at = now(), consent = false, updated_at = now()
    where regexp_replace(coalesce(mobile, ''), '\D', '', 'g') = d;
  end if;
  return true;
end $$;

revoke all on function public.promo_view(uuid) from public;
revoke all on function public.manager_subscribe(text, text, text, text) from public;
revoke all on function public.promo_optout(text) from public;
grant execute on function public.promo_view(uuid) to anon, authenticated;
grant execute on function public.manager_subscribe(text, text, text, text) to anon, authenticated;
grant execute on function public.promo_optout(text) to anon, authenticated;

-- 저장소 (사진·영상 파일) -------------------------------------------------
-- promos: 홍보물 (누구나 볼 수 있음, 관리자만 올리고 지움)
-- cards : 명함 사진 (관리자만)
insert into storage.buckets (id, name, public) values ('promos', 'promos', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('cards', 'cards', false) on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'promos_admin_write') then
    create policy promos_admin_write on storage.objects for all to authenticated
      using (bucket_id = 'promos' and public.is_admin()) with check (bucket_id = 'promos' and public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'cards_admin_all') then
    create policy cards_admin_all on storage.objects for all to authenticated
      using (bucket_id = 'cards' and public.is_admin()) with check (bucket_id = 'cards' and public.is_admin());
  end if;
end $$;
