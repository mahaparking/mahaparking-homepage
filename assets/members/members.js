/* 계정 · 권한 관리 — 관리자 화면 "계정 관리" 탭 (대표 전용)
 * 직원 · 파트너 가입 승인 / 보류 / 삭제, 사람마다 메뉴별 권한(숨김 · 보기만 · 수정 가능) 지정
 * 표 구조: supabase/members.sql
 */
const sb = supabase.createClient(MAHA.SB_URL, MAHA.SB_KEY);
const root = document.getElementById('members-root');

const ST = { pending: '승인 대기', active: '사용 중', hold: '보류', deleted: '삭제' };
const ROLE = { staff: '직원', partner: '파트너' };
const LV = [['none', '숨김'], ['view', '보기만'], ['edit', '수정 가능']];
const D = { members: [], perms: [], loaded: false, ready: true };
const V = { filter: 'all' };

/* 관리자 메뉴 목록 (화면의 메뉴에서 그대로 읽어 옴 · 계정 관리는 대표 전용이라 제외) */
function menus() {
  const out = [];
  document.querySelectorAll('#admin-tabs .adm-grp').forEach((g) => {
    const group = g.querySelector('.adm-grp-h span').textContent.trim();
    g.querySelectorAll('button[data-tab]').forEach((b) => {
      if (b.dataset.tab === 'members') return;
      out.push({ key: b.dataset.tab, name: b.childNodes[0].textContent.trim(), group });
    });
  });
  return out;
}
/* 빠른 설정: 자주 쓰는 권한 묶음 */
const PRESETS = {
  staff: { label: '직원 기본', perms: { requests: 'edit', quote: 'edit', prices: 'view', works: 'edit', caseup: 'edit', sales: 'edit', library: 'view' } },
  partner: { label: '파트너 기본', perms: { works: 'view', library: 'view' } },
  none: { label: '모두 숨김', perms: {} },
};

function oops(msg, err) {
  if (err) console.error(err);
  modal(`<h3>처리하지 못했습니다</h3><p>${esc(msg)}</p><p class="hint">${esc((err && err.message) || '')}</p><button class="btn btn-primary" data-close>확인</button>`);
}
const permsOf = (uid) => Object.fromEntries(D.perms.filter((p) => p.user_id === uid).map((p) => [p.menu, p.level]));

async function load() {
  const [m, p] = await Promise.all([
    sb.from('members').select('*').order('created_at', { ascending: false }),
    sb.from('member_perms').select('*'),
  ]);
  if (m.error) {
    D.ready = false;
    root.innerHTML = `<p>아직 계정 관리 표가 준비되지 않았습니다.</p><p class="hint">Supabase → SQL Editor 에서 <b>supabase/members.sql</b> 을 한 번 실행해 주세요.</p>`;
    return;
  }
  D.members = m.data || []; D.perms = p.data || []; D.loaded = true; D.ready = true;
  badge(); draw();
}
function badge() {
  const n = D.members.filter((x) => x.status === 'pending').length;
  const b = document.getElementById('mb-badge');
  if (b) { b.textContent = n || ''; b.classList.toggle('hidden', !n); }
}

function draw() {
  const list = D.members.filter((x) => (V.filter === 'all' ? x.status !== 'deleted' : x.status === V.filter));
  const cnt = (s) => D.members.filter((x) => x.status === s).length;
  const tabs = [['all', `전체 ${D.members.filter((x) => x.status !== 'deleted').length}`], ['pending', `승인 대기 ${cnt('pending')}`], ['active', `사용 중 ${cnt('active')}`], ['hold', `보류 ${cnt('hold')}`], ['deleted', `삭제 ${cnt('deleted')}`]];
  root.innerHTML = `
    <p class="hint" style="margin-top:0">직원·파트너는 로그인 화면의 <b>"가입 신청"</b>으로 계정을 만들고, 여기서 승인하면 들어올 수 있습니다. 승인할 때 볼 수 있는 메뉴를 정해 주세요.</p>
    <div class="sl-subs" role="tablist">${tabs.map(([k, t]) => `<button type="button" role="tab" data-f="${k}" aria-selected="${k === V.filter}">${t}</button>`).join('')}</div>
    ${list.length ? `<div class="tbl-wrap"><table class="mb-tbl"><thead><tr><th>이름</th><th>구분</th><th>업체 · 연락처</th><th>상태</th><th>볼 수 있는 메뉴</th><th></th></tr></thead><tbody>
      ${list.map((x) => {
        const pm = permsOf(x.user_id);
        const on = menus().filter((mm) => pm[mm.key] && pm[mm.key] !== 'none');
        return `<tr>
          <td><b>${esc(x.name || '(이름 없음)')}</b><br><small class="hint">${esc(x.email)}</small></td>
          <td>${ROLE[x.role] || x.role}</td>
          <td>${esc(x.company || '-')}<br><small class="hint">${esc(x.phone || '')}</small></td>
          <td><span class="mb-st mb-${x.status}">${ST[x.status]}</span></td>
          <td><small>${on.length ? on.map((mm) => esc(mm.name) + (pm[mm.key] === 'view' ? ' (보기)' : '')).join(', ') : '<span class="hint">없음</span>'}</small></td>
          <td style="white-space:nowrap">${x.status === 'pending' ? `<button class="btn btn-primary btn-sm" data-ok="${x.user_id}">승인</button> ` : ''}<button class="btn btn-line btn-sm" data-ed="${x.user_id}">설정</button></td>
        </tr>`;
      }).join('')}</tbody></table></div>` : '<p class="hint">해당하는 계정이 없습니다.</p>'}`;
  root.querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { V.filter = b.dataset.f; draw(); }; });
  root.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => edit(b.dataset.ed); });
  root.querySelectorAll('[data-ok]').forEach((b) => { b.onclick = () => edit(b.dataset.ok, true); });
}

/* 계정 설정 창: 기본 정보 · 상태 · 메뉴별 권한 */
function edit(uid, approving) {
  const x = D.members.find((m) => m.user_id === uid); if (!x) return;
  let pm = permsOf(uid);
  if (approving && !Object.keys(pm).length) pm = { ...(PRESETS[x.role] || PRESETS.none).perms };
  let groupNow = '';
  const rows = menus().map((mm) => {
    const head = mm.group !== groupNow ? `<div class="g">${esc((groupNow = mm.group))}</div>` : '';
    return `${head}<label for="pm-${mm.key}">${esc(mm.name)}</label><select id="pm-${mm.key}" data-pm="${mm.key}">${LV.map(([k, t]) => `<option value="${k}"${(pm[mm.key] || 'none') === k ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
  }).join('');
  modal(`
    <h3>${approving ? '가입 승인' : '계정 설정'} · ${esc(x.name || x.email)}</h3>
    <p class="hint">${esc(x.email)} · 신청일 ${dot(x.created_at)} · 현재 <span class="mb-st mb-${x.status}">${ST[x.status]}</span></p>
    <div class="row2" style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px">
      <label class="f">이름<input id="mb-name" value="${esc(x.name)}"></label>
      <label class="f">구분<select id="mb-role"><option value="partner"${x.role === 'partner' ? ' selected' : ''}>파트너</option><option value="staff"${x.role === 'staff' ? ' selected' : ''}>직원</option></select></label>
      <label class="f">업체명<input id="mb-company" value="${esc(x.company)}"></label>
      <label class="f">휴대폰<input id="mb-phone" value="${esc(x.phone)}"></label>
    </div>
    <label class="f">메모<input id="mb-memo" value="${esc(x.memo)}" placeholder="예: 루프 시공 전문, 경기 남부"></label>
    <h4 style="margin:16px 0 4px">메뉴별 권한</h4>
    <div class="chips" style="margin:4px 0">${Object.entries(PRESETS).map(([k, p]) => `<button type="button" class="btn btn-line btn-sm" data-pre="${k}">${p.label}</button>`).join('')}</div>
    <div class="mb-perm">${rows}</div>
    <h4 style="margin:16px 0 6px">계정 상태</h4>
    <div class="chips" id="mb-status">${['active', 'hold', 'deleted'].map((s) => `<label><input type="radio" name="mb-st" value="${s}"${(approving ? 'active' : x.status) === s ? ' checked' : ''}> ${s === 'active' ? '사용 (승인)' : ST[s]}</label>`).join('')}${x.status === 'pending' && !approving ? `<label><input type="radio" name="mb-st" value="pending" checked> 승인 대기 유지</label>` : ''}</div>
    <p class="hint">보류·삭제하면 즉시 로그인해도 들어올 수 없습니다. 삭제는 기록을 남겨 두며, 나중에 다시 "사용"으로 되살릴 수 있습니다.</p>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-line" data-close>취소</button><button class="btn btn-primary" id="mb-save">${approving ? '승인하기' : '저장'}</button></div>`);
  document.getElementById('modal-box').classList.add('wide');
  const box = document.getElementById('modal-box');
  box.querySelectorAll('[data-pre]').forEach((b) => {
    b.onclick = () => { const p = PRESETS[b.dataset.pre].perms; box.querySelectorAll('[data-pm]').forEach((s) => { s.value = p[s.dataset.pm] || 'none'; }); };
  });
  box.querySelector('#mb-save').onclick = async (ev) => {
    const btn = ev.currentTarget; btn.disabled = true;
    const status = (box.querySelector('input[name=mb-st]:checked') || {}).value || x.status;
    const up = await sb.from('members').update({
      name: box.querySelector('#mb-name').value.trim(), role: box.querySelector('#mb-role').value,
      company: box.querySelector('#mb-company').value.trim(), phone: box.querySelector('#mb-phone').value.trim(),
      memo: box.querySelector('#mb-memo').value.trim(), status, updated_at: new Date().toISOString(),
    }).eq('user_id', uid);
    if (up.error) { btn.disabled = false; oops('계정 정보를 저장하지 못했습니다.', up.error); return; }
    const rowsP = [...box.querySelectorAll('[data-pm]')].map((s) => ({ user_id: uid, menu: s.dataset.pm, level: s.value }));
    const pr = await sb.from('member_perms').upsert(rowsP, { onConflict: 'user_id,menu' });
    if (pr.error) { btn.disabled = false; oops('권한을 저장하지 못했습니다.', pr.error); return; }
    document.getElementById('modal').classList.add('hidden');
    await load();
  };
}

const tabBtn = document.querySelector('#admin-tabs [data-tab="members"]');
if (tabBtn) tabBtn.addEventListener('click', () => { load(); });
/* 대표로 로그인하면 승인 대기 숫자를 메뉴에 표시 */
setTimeout(function wait() {
  const acc = window.MAHA_ACCESS;
  if (!acc) { setTimeout(wait, 1000); return; }
  if (acc.owner) load();
}, 1500);
