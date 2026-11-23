-- 마하파킹 계정 · 권한 관리 (직원 · 파트너)
-- Supabase → SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 실행해도 안전합니다.
-- 대표(기존 관리자, is_admin() = true)는 지금처럼 모든 권한을 그대로 가집니다.
-- 기존 잠금 규칙은 하나도 지우지 않고, "권한 받은 사람도 허용" 규칙만 덧붙입니다.

-- 1) 계정 목록 --------------------------------------------------------------
create table if not exists public.members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  name       text not null default '',
  phone      text not null default '',
  company    text not null default '',           -- 파트너 업체명
  role       text not null default 'partner' check (role in ('staff', 'partner')),
  status     text not null default 'pending' check (status in ('pending', 'active', 'hold', 'deleted')),
  memo       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) 메뉴별 권한 (none: 숨김 / view: 보기만 / edit: 수정 가능) -----------------
create table if not exists public.member_perms (
  user_id uuid not null references public.members(user_id) on delete cascade,
  menu    text not null,
  level   text not null default 'none' check (level in ('none', 'view', 'edit')),
  primary key (user_id, menu)
);

alter table public.members enable row level security;
alter table public.member_perms enable row level security;

-- 3) 권한 확인 함수 ----------------------------------------------------------
-- 내가 이 메뉴를 need('view' 또는 'edit') 수준으로 쓸 수 있나?
create or replace function public.has_perm(p_menu text, p_need text default 'view')
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.members m
    join public.member_perms p on p.user_id = m.user_id
    where m.user_id = auth.uid() and m.status = 'active' and p.menu = p_menu
      and (p.level = 'edit' or (p_need = 'view' and p.level = 'view'))
  );
$$;

-- 로그인한 내 정보 (관리자 화면이 메뉴를 고를 때 사용)
create or replace function public.my_access()
returns json language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin() then json_build_object('owner', true, 'status', 'active', 'role', 'owner', 'perms', '{}'::json)
    else (
      select json_build_object(
        'owner', false, 'status', m.status, 'role', m.role, 'name', m.name,
        'perms', coalesce((select json_object_agg(p.menu, p.level) from public.member_perms p where p.user_id = m.user_id), '{}'::json))
      from public.members m where m.user_id = auth.uid()
    )
  end;
$$;

-- 가입 신청: 관리자 화면의 "가입 신청"으로 계정이 만들어지면 자동으로 '승인 대기'로 등록
-- (가입 화면에서 보낸 이름·연락처·업체명·구분을 그대로 옮김. 역할·상태는 대표만 바꿈)
create or replace function public.member_on_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'maha_apply', '') = '1' then
    insert into public.members (user_id, email, name, phone, company, role)
    values (new.id, coalesce(new.email, ''),
            coalesce(new.raw_user_meta_data ->> 'name', ''), coalesce(new.raw_user_meta_data ->> 'phone', ''),
            coalesce(new.raw_user_meta_data ->> 'company', ''),
            case when new.raw_user_meta_data ->> 'role' = 'staff' then 'staff' else 'partner' end)
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists maha_member_on_signup on auth.users;
create trigger maha_member_on_signup after insert on auth.users
  for each row execute function public.member_on_signup();

grant execute on function public.has_perm(text, text), public.my_access() to authenticated;

-- 4) 계정 표 잠금: 대표는 전부, 본인은 자기 것만 보기 ------------------------------
drop policy if exists members_owner_all on public.members;
create policy members_owner_all on public.members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists members_self_read on public.members;
create policy members_self_read on public.members for select to authenticated using (user_id = auth.uid());

drop policy if exists perms_owner_all on public.member_perms;
create policy perms_owner_all on public.member_perms for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists perms_self_read on public.member_perms;
create policy perms_self_read on public.member_perms for select to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.members, public.member_perms to authenticated;
revoke all on public.members, public.member_perms from anon;

-- 5) 기존 표에 "권한 받은 사람도 허용" 규칙 덧붙이기 ---------------------------------
--    보기 권한 → 읽기만, 수정 권한 → 쓰기·고치기·지우기까지
do $$
declare
  r record;
begin
  for r in select * from (values
    ('requests', 'requests'), ('quotes', 'quote'), ('products', 'prices'), ('categories', 'prices'), ('bank_accounts', 'quote'),
    ('works', 'works'), ('cases', 'caseup'), ('library_docs', 'library'),
    ('sites', 'sales'), ('managers', 'sales'), ('manager_jobs', 'sales'), ('promos', 'sales'), ('promo_sends', 'sales'), ('sales_settings', 'sales'),
    ('kapt_complex', 'collect'), ('house_bld', 'collect'), ('parking_lot', 'collect')
  ) as t(tbl, menu) loop
    if to_regclass('public.' || r.tbl) is not null then
      execute format('drop policy if exists %I on public.%I', r.tbl || '_perm_read', r.tbl);
      execute format('create policy %I on public.%I for select to authenticated using (public.has_perm(%L, ''view''))', r.tbl || '_perm_read', r.tbl, r.menu);
      execute format('drop policy if exists %I on public.%I', r.tbl || '_perm_write', r.tbl);
      execute format('create policy %I on public.%I for all to authenticated using (public.has_perm(%L, ''edit'')) with check (public.has_perm(%L, ''edit''))', r.tbl || '_perm_write', r.tbl, r.menu, r.menu);
      execute format('grant select, insert, update, delete on public.%I to authenticated', r.tbl);
    end if;
  end loop;
end $$;

-- 6) 사진·파일 저장소도 같은 규칙 (자료실, 시공사례 사진) ------------------------------
do $$
declare
  r record;
begin
  for r in select * from (values ('library', 'library'), ('cases', 'caseup')) as t(bucket, menu) loop
    execute format('drop policy if exists %I on storage.objects', r.bucket || '_perm_read');
    execute format('create policy %I on storage.objects for select to authenticated using (bucket_id = %L and public.has_perm(%L, ''view''))', r.bucket || '_perm_read', r.bucket, r.menu);
    execute format('drop policy if exists %I on storage.objects', r.bucket || '_perm_write');
    execute format('create policy %I on storage.objects for all to authenticated using (bucket_id = %L and public.has_perm(%L, ''edit'')) with check (bucket_id = %L and public.has_perm(%L, ''edit''))', r.bucket || '_perm_write', r.bucket, r.menu, r.bucket, r.menu);
  end loop;
end $$;
