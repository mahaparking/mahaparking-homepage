/* 영업·홍보 — 관리자 화면의 "영업·홍보" 탭 (마하파킹 ERP 1단계)
 * 관리소장(사람) · 단지(거래처) · 근무 이력 · 홍보물 · 보내기 · 보낸 기록 · 설정
 * 표 구조: supabase/sales.sql
 */
const sb = supabase.createClient(MAHA.SB_URL, MAHA.SB_KEY);
const SITE = 'https://mahaparking.co.kr';
const root = document.getElementById('sales-root');

const D = { sites: [], managers: [], jobs: [], promos: [], sends: [], settings: {}, loaded: false };
const V = { sub: 'managers', mq: '', mf: 'all', sq: '', sf: 'all', send: { promo: '', ids: new Set(), text: '', opened: new Set() } };

const SUBS = [['managers', '관리소장'], ['sites', '단지·거래처'], ['promos', '홍보물'], ['send', '보내기'], ['history', '보낸 기록'], ['settings', '설정']];
const SITE_KINDS = ['아파트', '빌라', '오피스텔', '상가', '공영주차장', '물류센터', '공장', '학교', '기타'];
const SITE_ST = { lead: ['영업 대상', 'st-new'], client: ['거래처', 'st-sent'], hold: ['보류', 'st-quote'] };
const HOW = ['방문 때 구두 동의', '명함 받을 때 동의', '전화로 동의', '홈페이지 신청', '문서·메일 동의'];

/* ---------- 도구 ---------- */
const digits = (s) => String(s || '').replace(/\D/g, '');
const tel = (s) => {
  const d = digits(s);
  if (/^01\d{9}$/.test(d) || /^070\d{8}$/.test(d)) return d.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3');
  if (/^01\d{8}$/.test(d)) return d.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
  if (/^02\d{7,8}$/.test(d)) return d.replace(/^(02)(\d{3,4})(\d{4})$/, '$1-$2-$3');
  if (/^0\d{9,10}$/.test(d)) return d.replace(/^(0\d{2})(\d{3,4})(\d{4})$/, '$1-$2-$3');
  return s || '';
};
const isMobile = (s) => /^01\d{8,9}$/.test(digits(s));
const opt = (list, cur) => list.map((v) => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
const fmtDate = (s) => (s ? dot(s) : '');
const smsBytes = (s) => { let n = 0; for (const ch of String(s)) n += ch.charCodeAt(0) > 127 ? 2 : 1; return n; };
const kstHour = () => (new Date().getUTCHours() + 9) % 24;
const pubUrl = (path) => (path ? sb.storage.from('promos').getPublicUrl(path).data.publicUrl : '');
const byId = (list, id) => list.find((x) => x.id === id);
const nowIso = () => new Date().toISOString();

function oops(msg, err) {
  if (err) console.error(err);
  modal(`<h3>처리하지 못했습니다</h3><p>${esc(msg)}</p><p class="hint">${esc((err && err.message) || '')}</p><button class="btn btn-primary" data-close>확인</button>`);
}
async function q(promise, msg) {
  const r = await promise;
  if (r.error) throw Object.assign(new Error(r.error.message), { userMsg: msg });
  return r.data;
}
async function token() { const { data } = await sb.auth.getSession(); return data.session && data.session.access_token; }
async function api(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `오류 ${r.status}`);
  return j;
}

/** 광고 문자 최종 문구 — 서버(api/_sales.js buildMessage)와 같은 규칙 */
function buildMessage(text, promo) {
  const S = D.settings;
  const head = `(광고)${S.company || '마하파킹'} ${tel(S.company_tel)}`.trim();
  const link = promo ? `\n\n▶ ${promo.kind === 'video' ? '영상' : '자료'} 보기\n${SITE}/m/?p=${promo.id}` : '';
  const stop = S.optout_tel ? `무료수신거부 ${tel(S.optout_tel)}` : `수신거부 ${SITE}/m/?stop`;
  return `${head}\n${String(text || '').trim()}${link}\n\n${stop}`;
}

/* ---------- 관계 ---------- */
const curJobs = (mid) => D.jobs.filter((j) => j.manager_id === mid && j.is_current);
const jobSite = (j) => (j.site_id && byId(D.sites, j.site_id)) || null;
const jobName = (j) => { const s = jobSite(j); return s ? s.name : j.site_name || '(단지 미등록)'; };
const curSiteText = (mid) => curJobs(mid).map(jobName).join(', ');
const siteManagers = (sid) => D.jobs.filter((j) => j.site_id === sid && j.is_current).map((j) => byId(D.managers, j.manager_id)).filter(Boolean);
const sendable = (m) => m.consent && !m.opt_out && isMobile(m.mobile);
const siteByName = (name) => D.sites.find((s) => s.name.replace(/\s/g, '') === String(name || '').replace(/\s/g, ''));

/* ---------- 불러오기 ---------- */
async function load() {
  root.innerHTML = '<p class="hint" style="padding:30px 0">불러오고 있습니다...</p>';
  const r = await Promise.all([
    sb.from('sites').select('*').order('name'),
    sb.from('managers').select('*').order('created_at', { ascending: false }),
    sb.from('manager_jobs').select('*').order('start_date', { ascending: false, nullsFirst: false }),
    sb.from('promos').select('*').order('created_at', { ascending: false }),
    sb.from('promo_sends').select('id,promo_title,channel,total,ok,fail,is_test,created_at').order('created_at', { ascending: false }).limit(200),
    sb.from('sales_settings').select('*'),
  ]);
  const err = r.find((x) => x.error);
  if (err) {
    root.innerHTML = `<div class="notice"><b>영업·홍보 자료표가 아직 준비되지 않았습니다.</b>
      <span>Supabase → SQL Editor 에서 저장소의 <code>supabase/sales.sql</code> 내용을 한 번 실행해 주세요. 실행 후 이 화면을 새로고침하면 됩니다.</span>
      <span class="hint">${esc(err.error.message)}</span><div><button class="btn btn-line btn-sm" type="button" id="sl-retry">↻ 다시 불러오기</button></div></div>`;
    root.querySelector('#sl-retry').onclick = load;
    return;
  }
  [D.sites, D.managers, D.jobs, D.promos, D.sends] = r.slice(0, 5).map((x) => x.data || []);
  D.settings = {}; (r[5].data || []).forEach((x) => { D.settings[x.key] = x.value || ''; });
  D.loaded = true;
  mount();
}

/* ---------- 화면 틀 ---------- */
function mount() {
  root.innerHTML = `<div class="sl-subs" role="tablist">${SUBS.map(([k, t]) => `<button type="button" role="tab" data-sub="${k}" aria-selected="${k === V.sub}">${t}${k === 'sites' ? '<span class="badge hidden" id="sl-need"></span>' : ''}</button>`).join('')}</div><div id="sl-body"></div>`;
  root.querySelectorAll('[data-sub]').forEach((b) => { b.onclick = () => { V.sub = b.dataset.sub; mount(); }; });
  const need = D.sites.filter((s) => s.need_new_manager).length;
  const nb = root.querySelector('#sl-need'); nb.textContent = need || ''; nb.classList.toggle('hidden', !need);
  ({ managers: drawManagers, sites: drawSites, promos: drawPromos, send: drawSend, history: drawHistory, settings: drawSettings })[V.sub]();
}
const body = () => root.querySelector('#sl-body');

/* =========================================================
 * 1. 관리소장
 * ========================================================= */
function drawManagers() {
  const F = { all: '전체', consent: '수신 동의', none: '동의 안 받음', optout: '수신거부', worked: '함께 일해 본 분' };
  body().innerHTML = `
    <p class="hint">명함을 찍으면 이름·휴대폰·단지가 자동으로 들어갑니다. 소장님이 다른 단지로 옮기시면 <b>근무지 변경</b>을 눌러 주세요. 연락처와 수신 동의는 소장님을 따라갑니다.</p>
    <div class="add-row" style="align-items:center">
      <button class="btn btn-primary btn-sm" type="button" id="m-card">📷 명함으로 등록</button>
      <button class="btn btn-line btn-sm" type="button" id="m-add">+ 직접 등록</button>
      <input type="file" id="m-file" accept="image/*" capture="environment" class="hidden">
      <input id="m-q" placeholder="이름 · 단지 · 번호 찾기" value="${esc(V.mq)}" style="max-width:220px">
      <select id="m-f" style="width:auto">${Object.keys(F).map((k) => `<option value="${k}"${k === V.mf ? ' selected' : ''}>${F[k]}</option>`).join('')}</select>
    </div>
    <div class="sl-kpis">${[['등록', D.managers.length], ['수신 동의', D.managers.filter(sendable).length], ['함께 일해 봄', D.managers.filter((m) => m.worked_with).length], ['수신거부', D.managers.filter((m) => m.opt_out).length]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
    <div class="sl-list" id="m-list"></div>`;
  const draw = () => {
    const qq = V.mq.replace(/\s/g, '').toLowerCase();
    const list = D.managers.filter((m) => {
      if (V.mf === 'consent' && !sendable(m)) return false;
      if (V.mf === 'none' && (m.consent || m.opt_out)) return false;
      if (V.mf === 'optout' && !m.opt_out) return false;
      if (V.mf === 'worked' && !m.worked_with) return false;
      if (!qq) return true;
      return [m.name, m.title, m.mobile, digits(m.mobile), curSiteText(m.id), m.memo].join(' ').replace(/\s/g, '').toLowerCase().includes(qq);
    });
    root.querySelector('#m-list').innerHTML = list.length ? list.map((m) => `
      <div class="sl-card">
        <div class="sl-card-h"><b>${esc(m.name)}</b><span class="hint">${esc(m.title || '')}</span>
          ${m.opt_out ? '<span class="status st-new">수신거부</span>' : m.consent ? '<span class="status st-sent">수신 동의</span>' : '<span class="status st-quote">동의 전</span>'}
          ${m.worked_with ? '<span class="status sl-worked">함께 일함</span>' : ''}
          ${m.source === 'web' ? '<span class="status st-quote">홈페이지 신청</span>' : ''}</div>
        <div class="sl-line">🏢 ${esc(curSiteText(m.id) || '근무지 미등록')}</div>
        <div class="sl-line">${m.mobile ? `📱 <a href="tel:${digits(m.mobile)}">${esc(tel(m.mobile))}</a>` : '<span class="hint">휴대폰 없음</span>'}</div>
        <div class="sl-btns"><button class="btn btn-line btn-sm" type="button" data-open="${m.id}">자세히 · 수정</button><button class="btn btn-line btn-sm" type="button" data-move="${m.id}">근무지 변경</button></div>
      </div>`).join('') : '<p class="empty">등록된 관리소장님이 없습니다. 명함을 찍어 첫 분을 등록해 보세요.</p>';
    root.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => managerModal(byId(D.managers, b.dataset.open)); });
    root.querySelectorAll('[data-move]').forEach((b) => { b.onclick = () => moveModal(byId(D.managers, b.dataset.move)); });
  };
  root.querySelector('#m-q').oninput = (e) => { V.mq = e.target.value; draw(); };
  root.querySelector('#m-f').onchange = (e) => { V.mf = e.target.value; draw(); };
  root.querySelector('#m-add').onclick = () => managerModal(null);
  root.querySelector('#m-card').onclick = () => root.querySelector('#m-file').click();
  root.querySelector('#m-file').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) scanCard(f); };
  draw();
}

async function scanCard(file) {
  modal('<h3>명함을 읽고 있습니다</h3><p class="hint">10초 정도 걸립니다...</p>');
  try {
    const s = await shrinkToBlob(file, 1600);
    if (!s) throw new Error('사진을 열지 못했습니다.');
    const b64 = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(s.blob); });
    const j = await api('/api/card-scan', { b64 });
    const c = j.card || {};
    managerModal(null, { name: c.name, title: c.title || '관리소장', mobile: c.mobile, email: c.email, site: c.org, office_tel: c.office_tel, office_fax: c.office_fax, address: c.address, mgmt_company: c.mgmt_company, cardBlob: s.blob, cardUrl: s.url });
  } catch (e) {
    oops('명함을 읽지 못했습니다. 직접 입력해 주세요.', e);
  }
}

function siteDatalist() { return `<datalist id="sl-sites">${D.sites.map((s) => `<option value="${esc(s.name)}">`).join('')}</datalist>`; }

function managerModal(m, pre) {
  const isNew = !m;
  const x = m || { name: '', title: '관리소장', mobile: '', email: '', consent: false, consent_how: HOW[1], worked_with: false, memo: '' };
  if (pre) Object.keys(pre).forEach((k) => { if (pre[k] && k in x) x[k] = pre[k]; });
  const jobs = m ? D.jobs.filter((j) => j.manager_id === m.id) : [];
  modal(`<h3>${isNew ? '관리소장님 등록' : '관리소장님 정보'}</h3>
    ${pre && pre.cardUrl ? `<img src="${pre.cardUrl}" alt="명함 사진" style="max-height:160px;border-radius:10px;object-fit:contain;background:#F7F9FB"><p class="hint" style="margin:0">명함에서 읽은 내용입니다. 틀린 곳이 있으면 고쳐 주세요.</p>` : ''}
    <div class="row2"><label class="f">이름<input id="mm-name" value="${esc(x.name)}"></label><label class="f">직함<input id="mm-title" value="${esc(x.title || '')}"></label></div>
    <div class="row2"><label class="f">휴대폰<input id="mm-mobile" inputmode="tel" value="${esc(tel(x.mobile))}"></label><label class="f">이메일<input id="mm-email" type="email" value="${esc(x.email || '')}"></label></div>
    ${isNew ? `<label class="f">현재 근무 단지 <span class="hint">(등록된 단지에서 고르거나 새 이름을 적으면 단지가 함께 만들어집니다)</span><input id="mm-site" list="sl-sites" value="${esc((pre && pre.site) || '')}">${siteDatalist()}</label>` : ''}
    <div class="sl-consent">
      <label class="sl-chk"><input type="checkbox" id="mm-consent"${x.consent && !x.opt_out ? ' checked' : ''}> <b>홍보 문자·카톡 수신에 동의하셨습니다</b></label>
      <select id="mm-how" style="width:auto">${opt(HOW, x.consent_how || HOW[1])}</select>
      ${m && m.consent_at ? `<span class="hint">동의 기록: ${fmtDate(m.consent_at)} · ${esc(m.consent_how || '')}</span>` : ''}
      ${m && m.opt_out ? `<span class="hint" style="color:var(--stop)">${fmtDate(m.opt_out_at)} 수신거부하셨습니다. 다시 동의를 받으신 경우에만 체크해 주세요.</span>` : ''}
    </div>
    <label class="sl-chk"><input type="checkbox" id="mm-worked"${x.worked_with ? ' checked' : ''}> 마하파킹과 함께 일해 본 소장님</label>
    <label class="f">메모 <span class="hint">(성향, 관심 장비, 다음 연락 시기 등)</span><textarea id="mm-memo">${esc(x.memo || '')}</textarea></label>
    ${m ? `<div><b style="font-size:14px">근무 이력</b><ul class="sl-hist">${jobs.length ? jobs.map((j) => `<li><span>${esc(jobName(j))}</span><span class="hint">${fmtDate(j.start_date) || '?'} ~ ${j.is_current ? '현재' : fmtDate(j.end_date)}</span></li>`).join('') : '<li class="hint">근무 이력이 없습니다.</li>'}</ul></div>` : ''}
    <div class="btns"><button class="btn btn-primary" id="mm-save">저장</button>${m ? '<button class="btn btn-line" id="mm-move">근무지 변경</button><button class="btn btn-danger" id="mm-del">삭제</button>' : ''}<button class="btn btn-line" data-close>닫기</button></div>
    <p class="hint" id="mm-msg" role="status"></p>`);
  const g = (id) => document.getElementById(id);
  g('mm-save').onclick = async () => {
    const name = g('mm-name').value.trim();
    if (!name) { g('mm-msg').textContent = '이름을 적어 주세요.'; return; }
    const consent = g('mm-consent').checked;
    const row = { name, title: g('mm-title').value.trim(), mobile: digits(g('mm-mobile').value) || null, email: g('mm-email').value.trim() || null, worked_with: g('mm-worked').checked, memo: g('mm-memo').value.trim() || null, updated_at: nowIso() };
    if (consent && !(m && m.consent && !m.opt_out)) Object.assign(row, { consent: true, consent_at: nowIso(), consent_how: g('mm-how').value, opt_out: false, opt_out_at: null });
    if (!consent && m && m.consent) Object.assign(row, { consent: false });
    if (consent && m && m.consent && g('mm-how').value !== m.consent_how) row.consent_how = g('mm-how').value;
    if (consent && !isMobile(row.mobile)) { g('mm-msg').textContent = '문자를 받으실 휴대폰 번호(010…)를 확인해 주세요.'; return; }
    const dup = row.mobile && D.managers.find((y) => digits(y.mobile) === row.mobile && (!m || y.id !== m.id));
    if (dup) { g('mm-msg').textContent = `같은 번호로 이미 등록된 분이 있습니다: ${dup.name}`; return; }
    g('mm-save').disabled = true;
    try {
      if (isNew) {
        const saved = await q(sb.from('managers').insert(row).select().single(), '저장하지 못했습니다.');
        D.managers.unshift(saved);
        if (pre && pre.cardBlob) {
          const path = `${saved.id}/${Date.now()}.jpg`;
          const up = await sb.storage.from('cards').upload(path, pre.cardBlob, { contentType: 'image/jpeg' });
          if (!up.error) { await sb.from('managers').update({ card_path: path }).eq('id', saved.id); saved.card_path = path; }
        }
        const siteName = g('mm-site').value.trim();
        if (siteName) await startJob(saved, siteName, today(), pre);
      } else {
        const saved = await q(sb.from('managers').update(row).eq('id', m.id).select().single(), '저장하지 못했습니다.');
        Object.assign(m, saved);
      }
      closeModal(); mount();
    } catch (e) { g('mm-save').disabled = false; oops(e.userMsg || '저장하지 못했습니다.', e); }
  };
  if (m) {
    g('mm-move').onclick = () => moveModal(m);
    g('mm-del').onclick = () => {
      modal(`<h3>${esc(m.name)} 님을 삭제할까요?</h3><p>근무 이력도 함께 지워집니다. 되돌릴 수 없습니다.</p><div class="btns"><button class="btn btn-danger" id="mm-del2">삭제</button><button class="btn btn-line" data-close>취소</button></div>`);
      g('mm-del2').onclick = async () => {
        try {
          if (m.card_path) await sb.storage.from('cards').remove([m.card_path]);
          await q(sb.from('managers').delete().eq('id', m.id), '삭제하지 못했습니다.');
          D.managers = D.managers.filter((y) => y.id !== m.id); D.jobs = D.jobs.filter((j) => j.manager_id !== m.id);
          closeModal(); mount();
        } catch (e) { oops(e.userMsg || '삭제하지 못했습니다.', e); }
      };
    };
  }
}

/** 단지 찾기 또는 새로 만들기 (새 단지는 영업 대상) */
async function ensureSite(name, pre) {
  let s = siteByName(name);
  if (s) return { site: s, created: false };
  const row = { name: name.trim(), kind: /빌라|맨션|하우스/.test(name) ? '빌라' : '아파트', status: 'lead' };
  if (pre) { if (pre.office_tel) row.office_tel = digits(pre.office_tel); if (pre.office_fax) row.office_fax = digits(pre.office_fax); if (pre.address) row.address = pre.address; if (pre.mgmt_company) row.mgmt_company = pre.mgmt_company; }
  s = await q(sb.from('sites').insert(row).select().single(), '단지를 만들지 못했습니다.');
  D.sites.push(s); D.sites.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return { site: s, created: true };
}

async function startJob(m, siteName, start, pre) {
  const { site, created } = await ensureSite(siteName, pre);
  const job = await q(sb.from('manager_jobs').insert({ manager_id: m.id, site_id: site.id, site_name: site.name, start_date: start || today(), is_current: true }).select().single(), '근무 이력을 저장하지 못했습니다.');
  D.jobs.unshift(job);
  if (site.need_new_manager) { await sb.from('sites').update({ need_new_manager: false, updated_at: nowIso() }).eq('id', site.id); site.need_new_manager = false; }
  return { site, created };
}

function moveModal(m) {
  const cur = curJobs(m.id);
  modal(`<h3>${esc(m.name)} 소장님 근무지 변경</h3>
    <p class="hint" style="margin:0">지금 근무지: <b>${esc(cur.map(jobName).join(', ') || '없음')}</b><br>옮기시면 이전 단지는 "새 소장님 확인 필요"로 표시되고, 새 단지가 아직 거래처가 아니면 <b>영업 대상</b>으로 등록됩니다.</p>
    <label class="f">새 근무 단지<input id="mv-site" list="sl-sites" placeholder="단지 이름">${siteDatalist()}</label>
    <label class="f">옮기신 날<input id="mv-date" type="date" value="${today()}"></label>
    <div class="btns"><button class="btn btn-primary" id="mv-go">변경하기</button><button class="btn btn-line" data-close>취소</button></div>
    <p class="hint" id="mv-msg" role="status"></p>`);
  const g = (id) => document.getElementById(id);
  g('mv-go').onclick = async () => {
    const name = g('mv-site').value.trim(), d = g('mv-date').value || today();
    if (!name) { g('mv-msg').textContent = '새 단지 이름을 적어 주세요.'; return; }
    if (cur.some((j) => jobName(j).replace(/\s/g, '') === name.replace(/\s/g, ''))) { g('mv-msg').textContent = '지금 근무 중인 단지와 같습니다.'; return; }
    g('mv-go').disabled = true;
    try {
      const oldSites = cur.map(jobSite).filter(Boolean);
      if (cur.length) {
        await q(sb.from('manager_jobs').update({ is_current: false, end_date: d }).in('id', cur.map((j) => j.id)), '이전 근무지를 정리하지 못했습니다.');
        cur.forEach((j) => { j.is_current = false; j.end_date = d; });
      }
      const flagged = [];
      for (const s of oldSites) {
        if (!siteManagers(s.id).length) { await sb.from('sites').update({ need_new_manager: true, updated_at: nowIso() }).eq('id', s.id); s.need_new_manager = true; flagged.push(s.name); }
      }
      const { site, created } = await startJob(m, name, d);
      modal(`<h3>근무지를 바꿨습니다</h3>
        <p><b>${esc(m.name)}</b> 소장님 → <b>${esc(site.name)}</b></p>
        ${site.status !== 'client' ? `<div class="notice"><b>${esc(site.name)}</b>${created ? '을(를) 새로 만들고' : '은(는)'} 영업 대상입니다. 마하파킹을 아시는 소장님이 계신 곳이니 먼저 연락해 보세요.</div>` : ''}
        ${flagged.length ? `<p class="hint">${esc(flagged.join(', '))}: 다음 방문 때 새 소장님 명함을 받아 주세요.</p>` : ''}
        <button class="btn btn-primary" data-close>확인</button>`);
      mount();
    } catch (e) { g('mv-go').disabled = false; oops(e.userMsg || '변경하지 못했습니다.', e); }
  };
}

/* =========================================================
 * 2. 단지 · 거래처
 * ========================================================= */
function drawSites() {
  const F = { all: '전체', client: '거래처', lead: '영업 대상', need: '새 소장님 확인 필요', hold: '보류' };
  body().innerHTML = `
    <p class="hint">단지(거래처)는 그대로 남고 소장님만 바뀝니다. 견적·작업·세금계산서도 앞으로 이 단지에 이어 붙습니다.</p>
    <div class="add-row" style="align-items:center">
      <button class="btn btn-primary btn-sm" type="button" id="s-add">+ 단지 등록</button>
      <input id="s-q" placeholder="단지 · 지역 찾기" value="${esc(V.sq)}" style="max-width:220px">
      <select id="s-f" style="width:auto">${Object.keys(F).map((k) => `<option value="${k}"${k === V.sf ? ' selected' : ''}>${F[k]}</option>`).join('')}</select>
    </div>
    <div class="sl-kpis">${[['전체', D.sites.length], ['거래처', D.sites.filter((s) => s.status === 'client').length], ['영업 대상', D.sites.filter((s) => s.status === 'lead').length], ['새 소장님 확인', D.sites.filter((s) => s.need_new_manager).length]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
    <div class="sl-list" id="s-list"></div>`;
  const draw = () => {
    const qq = V.sq.replace(/\s/g, '').toLowerCase();
    const list = D.sites.filter((s) => {
      if (V.sf === 'need' ? !s.need_new_manager : V.sf !== 'all' && s.status !== V.sf) return false;
      return !qq || [s.name, s.region, s.address, s.mgmt_company].join(' ').replace(/\s/g, '').toLowerCase().includes(qq);
    });
    root.querySelector('#s-list').innerHTML = list.length ? list.map((s) => {
      const ms = siteManagers(s.id), st = SITE_ST[s.status] || SITE_ST.lead;
      return `<div class="sl-card">
        <div class="sl-card-h"><b>${esc(s.name)}</b><span class="hint">${esc(s.kind || '')}${s.region ? ' · ' + esc(s.region) : ''}</span><span class="status ${st[1]}">${st[0]}</span>${s.need_new_manager ? '<span class="status st-new">새 소장님 확인</span>' : ''}</div>
        <div class="sl-line">👤 ${ms.length ? ms.map((m) => `${esc(m.name)} ${esc(m.title || '')}`).join(', ') : '<span class="hint">소장님 미등록</span>'}</div>
        <div class="sl-line">${s.office_tel ? `☎ <a href="tel:${digits(s.office_tel)}">${esc(tel(s.office_tel))}</a>` : ''}${s.office_fax ? ` <span class="hint">팩스 ${esc(tel(s.office_fax))}</span>` : ''}${s.households ? ` <span class="hint">· ${s.households}세대</span>` : ''}</div>
        <div class="sl-btns"><button class="btn btn-line btn-sm" type="button" data-sopen="${s.id}">자세히 · 수정</button></div>
      </div>`;
    }).join('') : '<p class="empty">해당하는 단지가 없습니다.</p>';
    root.querySelectorAll('[data-sopen]').forEach((b) => { b.onclick = () => siteModal(byId(D.sites, b.dataset.sopen)); });
  };
  root.querySelector('#s-q').oninput = (e) => { V.sq = e.target.value; draw(); };
  root.querySelector('#s-f').onchange = (e) => { V.sf = e.target.value; draw(); };
  root.querySelector('#s-add').onclick = () => siteModal(null);
  draw();
}

function siteModal(s) {
  const x = s || { name: '', kind: '아파트', region: '', address: '', office_tel: '', office_fax: '', households: '', mgmt_company: '', equipment: '', status: 'lead', need_new_manager: false, memo: '' };
  const hist = s ? D.jobs.filter((j) => j.site_id === s.id) : [];
  modal(`<h3>${s ? '단지 정보' : '단지 등록'}</h3>
    <div class="row2"><label class="f">단지 이름<input id="ss-name" value="${esc(x.name)}"></label><label class="f">종류<select id="ss-kind">${opt(SITE_KINDS, x.kind)}</select></label></div>
    <div class="row2"><label class="f">지역<input id="ss-region" value="${esc(x.region || '')}" placeholder="예) 안양 만안구"></label><label class="f">상태<select id="ss-status">${Object.keys(SITE_ST).map((k) => `<option value="${k}"${k === x.status ? ' selected' : ''}>${SITE_ST[k][0]}</option>`).join('')}</select></label></div>
    <label class="f">주소<input id="ss-addr" value="${esc(x.address || '')}"></label>
    <div class="row3"><label class="f">관리사무소 전화<input id="ss-tel" inputmode="tel" value="${esc(tel(x.office_tel))}"></label><label class="f">팩스<input id="ss-fax" inputmode="tel" value="${esc(tel(x.office_fax))}"></label><label class="f">세대수<input id="ss-hh" inputmode="numeric" value="${esc(x.households || '')}"></label></div>
    <label class="f">위탁관리회사<input id="ss-mc" value="${esc(x.mgmt_company || '')}"></label>
    <label class="f">설치 장비 <span class="hint">(차단기 대수, 제조사, 번호인식 여부 등)</span><textarea id="ss-eq">${esc(x.equipment || '')}</textarea></label>
    <label class="f">메모<textarea id="ss-memo">${esc(x.memo || '')}</textarea></label>
    <label class="sl-chk"><input type="checkbox" id="ss-need"${x.need_new_manager ? ' checked' : ''}> 새 소장님 확인 필요</label>
    ${s ? `<div><b style="font-size:14px">이 단지의 소장님 이력</b><ul class="sl-hist">${hist.length ? hist.map((j) => { const m = byId(D.managers, j.manager_id); return `<li><span>${esc(m ? m.name : '?')} ${esc(m ? m.title || '' : '')}</span><span class="hint">${fmtDate(j.start_date) || '?'} ~ ${j.is_current ? '현재' : fmtDate(j.end_date)}</span></li>`; }).join('') : '<li class="hint">아직 없습니다.</li>'}</ul></div>` : ''}
    <div class="btns"><button class="btn btn-primary" id="ss-save">저장</button>${s ? '<button class="btn btn-danger" id="ss-del">삭제</button>' : ''}<button class="btn btn-line" data-close>닫기</button></div>
    <p class="hint" id="ss-msg" role="status"></p>`);
  const g = (id) => document.getElementById(id);
  g('ss-save').onclick = async () => {
    const name = g('ss-name').value.trim();
    if (!name) { g('ss-msg').textContent = '단지 이름을 적어 주세요.'; return; }
    const same = siteByName(name);
    if (same && (!s || same.id !== s.id)) { g('ss-msg').textContent = '같은 이름의 단지가 이미 있습니다.'; return; }
    const row = { name, kind: g('ss-kind').value, region: g('ss-region').value.trim() || null, status: g('ss-status').value, address: g('ss-addr').value.trim() || null, office_tel: digits(g('ss-tel').value) || null, office_fax: digits(g('ss-fax').value) || null, households: parseInt(digits(g('ss-hh').value), 10) || null, mgmt_company: g('ss-mc').value.trim() || null, equipment: g('ss-eq').value.trim() || null, memo: g('ss-memo').value.trim() || null, need_new_manager: g('ss-need').checked, updated_at: nowIso() };
    g('ss-save').disabled = true;
    try {
      if (s) {
        Object.assign(s, await q(sb.from('sites').update(row).eq('id', s.id).select().single(), '저장하지 못했습니다.'));
        D.jobs.filter((j) => j.site_id === s.id).forEach((j) => { j.site_name = s.name; });
      } else {
        D.sites.push(await q(sb.from('sites').insert(row).select().single(), '저장하지 못했습니다.'));
      }
      D.sites.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      closeModal(); mount();
    } catch (e) { g('ss-save').disabled = false; oops(e.userMsg || '저장하지 못했습니다.', e); }
  };
  if (s) g('ss-del').onclick = () => {
    modal(`<h3>${esc(s.name)} 단지를 삭제할까요?</h3><p>소장님 정보는 남고, 근무 이력에는 단지 이름만 남습니다.</p><div class="btns"><button class="btn btn-danger" id="ss-del2">삭제</button><button class="btn btn-line" data-close>취소</button></div>`);
    g('ss-del2').onclick = async () => {
      try {
        await q(sb.from('sites').delete().eq('id', s.id), '삭제하지 못했습니다.');
        D.sites = D.sites.filter((y) => y.id !== s.id); D.jobs.forEach((j) => { if (j.site_id === s.id) j.site_id = null; });
        closeModal(); mount();
      } catch (e) { oops(e.userMsg || '삭제하지 못했습니다.', e); }
    };
  };
}

/* =========================================================
 * 3. 홍보물
 * ========================================================= */
const MAX_VIDEO = 50 * 1024 * 1024;

/** 문자(MMS)용 jpg: 200KB 이하가 될 때까지 줄이기 */
function mmsJpeg(file) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      let max = 1000, qual = 0.82;
      const tryOne = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => {
          if (b && b.size <= 195 * 1024) return res(b);
          if (qual > 0.5) qual -= 0.1; else max = Math.round(max * 0.8);
          if (max < 300) return res(null);
          tryOne();
        }, 'image/jpeg', qual);
      };
      tryOne();
    };
    img.onerror = () => res(null);
    img.src = URL.createObjectURL(file);
  });
}

function drawPromos() {
  body().innerHTML = `
    <p class="hint">작업 사례 사진·홍보 이미지·동영상을 올려 두면 <b>보내기</b>에서 골라 보낼 수 있습니다. 홍보물마다 소장님이 열어 볼 수 있는 보기 페이지(${SITE}/m/?p=…)가 자동으로 생깁니다.</p>
    <form class="sl-box" id="p-form" novalidate>
      <b>새 홍보물 올리기</b>
      <label class="f">제목<input id="p-title" placeholder="예) 안양 OO아파트 차단기 업싸이클링 사례"></label>
      <label class="f">파일 <span class="hint">(이미지 또는 동영상 · 동영상은 50MB 이하, 휴대폰 세로 영상 권장)</span><input id="p-file" type="file" accept="image/*,video/mp4,video/quicktime,video/webm"></label>
      <label class="f">기본 안내 문구 <span class="hint">(보낼 때 고칠 수 있습니다)</span><textarea id="p-body" placeholder="예) 소장님, 안녕하세요. 마하파킹입니다.&#10;고장 난 차단기를 통째로 바꾸지 않고 부품만 살려 새것처럼 고친 사례를 보내드립니다."></textarea></label>
      <div class="btns"><button class="btn btn-primary" type="submit" id="p-save">올리기</button></div>
      <p class="hint" id="p-msg" role="status"></p>
    </form>
    <div class="sl-plist" id="p-list"></div>`;
  root.querySelector('#p-list').innerHTML = D.promos.length ? D.promos.map((p) => `
    <div class="sl-card sl-promo">
      <div class="sl-media">${p.kind === 'video' ? `<video src="${pubUrl(p.file_path)}" controls preload="metadata" playsinline></video>` : `<img src="${pubUrl(p.file_path)}" alt="${esc(p.title)}" loading="lazy">`}</div>
      <div class="sl-card-h"><b>${esc(p.title)}</b><span class="status ${p.kind === 'video' ? 'st-quote' : 'st-sent'}">${p.kind === 'video' ? '동영상' : '이미지'}</span>${p.is_public ? '' : '<span class="status st-new">비공개</span>'}</div>
      <div class="sl-line hint">${fmtDate(p.created_at)} · 조회 ${p.views || 0}회</div>
      <div class="sl-btns">
        <button class="btn btn-primary btn-sm" type="button" data-psend="${p.id}">이걸로 보내기</button>
        <button class="btn btn-line btn-sm" type="button" data-pcopy="${p.id}">보기 주소 복사</button>
        <a class="btn btn-line btn-sm" href="/m/?p=${p.id}" target="_blank" rel="noopener">보기 페이지</a>
        <button class="btn btn-line btn-sm" type="button" data-ppub="${p.id}">${p.is_public ? '비공개로' : '공개로'}</button>
        <button class="btn btn-danger btn-sm" type="button" data-pdel="${p.id}">삭제</button>
      </div>
    </div>`).join('') : '<p class="empty">아직 올린 홍보물이 없습니다.</p>';

  root.querySelector('#p-form').onsubmit = async (e) => {
    e.preventDefault();
    const msg = root.querySelector('#p-msg'), btn = root.querySelector('#p-save');
    const title = root.querySelector('#p-title').value.trim(), file = root.querySelector('#p-file').files[0];
    if (!title || !file) { msg.textContent = '제목과 파일을 넣어 주세요.'; return; }
    const isVideo = /^video\//.test(file.type);
    if (!isVideo && !/^image\//.test(file.type)) { msg.textContent = '이미지나 동영상 파일만 올릴 수 있습니다.'; return; }
    if (isVideo && file.size > MAX_VIDEO) { msg.textContent = `동영상이 ${Math.round(file.size / 1048576)}MB입니다. 50MB 이하로 줄여 주세요. (휴대폰 편집 앱에서 1080p로 내보내기)`; return; }
    btn.disabled = true; msg.textContent = '올리고 있습니다...';
    const stamp = `${today()}/${rid()}`;
    const paths = [];
    try {
      let file_path, mms_path = null;
      if (isVideo) {
        const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
        file_path = `${stamp}.${ext}`;
        await q(sb.storage.from('promos').upload(file_path, file, { contentType: file.type, cacheControl: '31536000' }), '동영상을 올리지 못했습니다.');
        paths.push(file_path);
      } else {
        const big = await shrinkToBlob(file, 1600);
        const small = await mmsJpeg(file);
        if (!big || !small) throw new Error('사진을 열지 못했습니다.');
        file_path = `${stamp}.jpg`; mms_path = `${stamp}-mms.jpg`;
        await q(sb.storage.from('promos').upload(file_path, big.blob, { contentType: 'image/jpeg', cacheControl: '31536000' }), '이미지를 올리지 못했습니다.');
        paths.push(file_path);
        await q(sb.storage.from('promos').upload(mms_path, small, { contentType: 'image/jpeg', cacheControl: '31536000' }), '문자용 이미지를 올리지 못했습니다.');
        paths.push(mms_path);
      }
      const row = await q(sb.from('promos').insert({ title, kind: isVideo ? 'video' : 'image', file_path, mms_path, body: root.querySelector('#p-body').value.trim() || null }).select().single(), '홍보물을 저장하지 못했습니다.');
      D.promos.unshift(row);
      mount();
    } catch (err) {
      if (paths.length) await sb.storage.from('promos').remove(paths);
      btn.disabled = false; msg.textContent = '';
      oops(err.userMsg || '올리지 못했습니다.', err);
    }
  };
  root.querySelectorAll('[data-psend]').forEach((b) => { b.onclick = () => { const p = byId(D.promos, b.dataset.psend); V.send.promo = p.id; V.send.text = p.body || ''; V.sub = 'send'; mount(); }; });
  root.querySelectorAll('[data-pcopy]').forEach((b) => {
    b.onclick = async () => {
      const url = `${SITE}/m/?p=${b.dataset.pcopy}`;
      try { await navigator.clipboard.writeText(url); b.textContent = '복사했습니다 ✓'; } catch (e) { modal(`<h3>보기 주소</h3><input value="${url}" readonly onclick="this.select()"><button class="btn btn-primary" data-close>닫기</button>`); }
    };
  });
  root.querySelectorAll('[data-ppub]').forEach((b) => {
    b.onclick = async () => {
      const p = byId(D.promos, b.dataset.ppub);
      try { await q(sb.from('promos').update({ is_public: !p.is_public }).eq('id', p.id), '바꾸지 못했습니다.'); p.is_public = !p.is_public; mount(); } catch (e) { oops(e.userMsg, e); }
    };
  });
  root.querySelectorAll('[data-pdel]').forEach((b) => {
    b.onclick = () => {
      const p = byId(D.promos, b.dataset.pdel);
      modal(`<h3>"${esc(p.title)}" 홍보물을 삭제할까요?</h3><p>이미 보낸 문자 속 보기 주소도 더 이상 열리지 않습니다. 되돌릴 수 없습니다.</p><div class="btns"><button class="btn btn-danger" id="pd2">삭제</button><button class="btn btn-line" data-close>취소</button></div>`);
      document.getElementById('pd2').onclick = async () => {
        try {
          await sb.storage.from('promos').remove([p.file_path, p.mms_path].filter(Boolean));
          await q(sb.from('promos').delete().eq('id', p.id), '삭제하지 못했습니다.');
          D.promos = D.promos.filter((y) => y.id !== p.id); if (V.send.promo === p.id) V.send.promo = '';
          closeModal(); mount();
        } catch (e) { oops(e.userMsg || '삭제하지 못했습니다.', e); }
      };
    };
  });
}

/* =========================================================
 * 4. 보내기
 * ========================================================= */
function drawSend() {
  const S = V.send;
  const promo = byId(D.promos, S.promo) || null;
  if (!S.text && promo && promo.body) S.text = promo.body;
  const ok = D.managers.filter(sendable);
  const ex = { none: D.managers.filter((m) => !m.consent && !m.opt_out).length, out: D.managers.filter((m) => m.opt_out).length, noNum: D.managers.filter((m) => m.consent && !m.opt_out && !isMobile(m.mobile)).length };
  [...S.ids].forEach((id) => { if (!ok.some((m) => m.id === id)) S.ids.delete(id); });
  const groups = {
    all: ['수신 동의 전체', () => ok],
    worked: ['함께 일해 본 분', () => ok.filter((m) => m.worked_with)],
    client: ['거래처 소장님', () => ok.filter((m) => curJobs(m.id).some((j) => (jobSite(j) || {}).status === 'client'))],
    lead: ['영업 대상 단지 소장님', () => ok.filter((m) => curJobs(m.id).some((j) => (jobSite(j) || {}).status === 'lead'))],
  };
  const night = kstHour() >= 21 || kstHour() < 8;
  body().innerHTML = `
    <div class="sl-step"><b><span class="sl-no">1</span>홍보물 고르기</b>
      <select id="x-promo"><option value="">홍보물 없이 문구만 보내기</option>${D.promos.filter((p) => p.is_public).map((p) => `<option value="${p.id}"${p.id === S.promo ? ' selected' : ''}>${esc(p.title)} (${p.kind === 'video' ? '동영상' : '이미지'})</option>`).join('')}</select>
      ${promo ? `<p class="hint" style="margin:6px 0 0">${promo.kind === 'image' ? '이미지가 사진 문자(MMS)로 함께 가고, 크게 보는 주소도 붙습니다.' : '동영상은 문자에 넣을 수 없어 "영상 보기" 주소가 붙습니다.'}</p>` : ''}
    </div>
    <div class="sl-step"><b><span class="sl-no">2</span>받는 분 고르기</b>
      <div class="add-row" style="margin:6px 0">${Object.keys(groups).map((k) => `<button class="btn btn-line btn-sm" type="button" data-grp="${k}">${groups[k][0]} (${groups[k][1]().length})</button>`).join('')}<button class="btn btn-line btn-sm" type="button" id="x-clear">모두 해제</button></div>
      <p class="hint" style="margin:0 0 6px">수신 동의한 분만 고를 수 있습니다. 빠진 분: 동의 전 ${ex.none}명 · 수신거부 ${ex.out}명 · 휴대폰 없음 ${ex.noNum}명</p>
      <div class="sl-pick">${ok.length ? ok.map((m) => `<label class="sl-chk"><input type="checkbox" data-pick="${m.id}"${S.ids.has(m.id) ? ' checked' : ''}> <span><b>${esc(m.name)}</b> <span class="hint">${esc(curSiteText(m.id) || '')} · ${esc(tel(m.mobile))}</span></span></label>`).join('') : '<p class="empty">수신 동의한 소장님이 아직 없습니다. 관리소장 화면에서 동의를 체크해 주세요.</p>'}</div>
      <p style="margin:6px 0 0"><b id="x-count">${S.ids.size}</b>명 선택</p>
    </div>
    <div class="sl-step"><b><span class="sl-no">3</span>문구 쓰기</b>
      <textarea id="x-text" style="min-height:120px" placeholder="소장님, 안녕하세요. 마하파킹입니다.">${esc(S.text)}</textarea>
      <p class="hint" style="margin:6px 0">맨 앞 "(광고)회사명 대표번호"와 맨 끝 수신거부 안내는 법에 따라 자동으로 붙습니다.</p>
      <div class="sl-phone"><div class="sl-bubble" id="x-prev"></div></div>
      <p class="hint" id="x-type"></p>
    </div>
    <div class="sl-step"><b><span class="sl-no">4</span>보내기</b>
      <div class="sl-chan"><label class="sl-chk"><input type="radio" name="x-ch" checked> 문자 (솔라피)</label><label class="sl-chk" style="opacity:.55"><input type="radio" name="x-ch" disabled> 카카오톡 <span class="hint">(카카오톡 채널 개설·연결 후 사용)</span></label></div>
      ${night ? '<div class="notice"><b>지금은 밤 9시 ~ 아침 8시입니다.</b><span>이 시간에는 법에 따라 광고 문자를 보낼 수 없습니다. 나에게 테스트만 가능합니다.</span></div>' : ''}
      <div class="btns" style="margin-top:10px"><button class="btn btn-line" type="button" id="x-test">나에게 테스트 보내기</button><button class="btn btn-cta" type="button" id="x-go"${night ? ' disabled' : ''}>선택한 분께 보내기</button></div>
      <p class="hint" id="x-msg" role="status"></p>
      <details class="sl-box" style="margin-top:14px"><summary><b>솔라피 연결 전: 내 폰 문자앱으로 한 분씩 보내기</b></summary>
        <p class="hint">휴대폰에서 누르면 문자앱이 열리고 문구가 채워집니다. 사진은 문자앱에서 직접 붙여 주세요. 보낸 뒤 "보낸 것으로 기록"을 누르면 보낸 기록에 남습니다.</p>
        <div id="x-app"></div>
        <div class="btns"><button class="btn btn-line btn-sm" type="button" id="x-applog">보낸 것으로 기록</button></div>
      </details>
    </div>`;
  const $$ = (s) => root.querySelector(s);
  const drawPrev = () => {
    const t = buildMessage(S.text, promo);
    $$('#x-prev').textContent = t;
    const n = smsBytes(t);
    $$('#x-type').textContent = `${promo && promo.kind === 'image' ? '사진 문자(MMS)' : n > 90 ? '장문 문자(LMS)' : '단문 문자(SMS)'} · ${n}바이트${n > 2000 ? ' — 2,000바이트를 넘어 잘릴 수 있습니다. 줄여 주세요.' : ''}`;
    const sel = ok.filter((m) => S.ids.has(m.id));
    $$('#x-app').innerHTML = sel.length ? `<ul class="sl-hist">${sel.map((m) => `<li><span>${esc(m.name)} <span class="hint">${esc(tel(m.mobile))}</span></span><a class="btn btn-line btn-sm" data-app="${m.id}" href="sms:${digits(m.mobile)}?&body=${encodeURIComponent(t)}">${S.opened.has(m.id) ? '다시 열기 ✓' : '문자앱 열기'}</a></li>`).join('')}</ul>` : '<p class="empty">받는 분을 먼저 골라 주세요.</p>';
    root.querySelectorAll('[data-app]').forEach((a) => { a.addEventListener('click', () => { S.opened.add(a.dataset.app); setTimeout(() => { a.textContent = '다시 열기 ✓'; }, 300); }); });
  };
  const count = () => { $$('#x-count').textContent = S.ids.size; drawPrev(); };
  $$('#x-promo').onchange = (e) => { S.promo = e.target.value; const p = byId(D.promos, S.promo); if (p && p.body) S.text = p.body; drawSend(); };
  root.querySelectorAll('[data-grp]').forEach((b) => { b.onclick = () => { groups[b.dataset.grp][1]().forEach((m) => S.ids.add(m.id)); drawSend(); }; });
  $$('#x-clear').onclick = () => { S.ids.clear(); drawSend(); };
  root.querySelectorAll('[data-pick]').forEach((c) => { c.onchange = () => { if (c.checked) S.ids.add(c.dataset.pick); else S.ids.delete(c.dataset.pick); count(); }; });
  $$('#x-text').oninput = (e) => { S.text = e.target.value; drawPrev(); };
  const go = async (test) => {
    const msg = $$('#x-msg');
    if (!S.text.trim()) { msg.textContent = '문구를 적어 주세요.'; return; }
    if (!test && !S.ids.size) { msg.textContent = '받는 분을 골라 주세요.'; return; }
    const run = async () => {
      closeModal();
      $$('#x-test').disabled = true; $$('#x-go').disabled = true; msg.textContent = '보내고 있습니다...';
      try {
        const j = await api('/api/promo-send', { promo_id: S.promo || null, manager_ids: test ? [] : [...S.ids], text: S.text, test });
        msg.textContent = '';
        modal(`<h3>${test ? '테스트 문자를 보냈습니다' : '보냈습니다'}</h3><p>성공 <b>${j.ok}</b>건 · 실패 <b>${j.fail}</b>건${j.skipped ? ` · 동의 확인 안 돼 제외 ${j.skipped}명` : ''}</p>${j.failed && j.failed.length ? `<ul class="sl-hist">${j.failed.map((f) => `<li><span>${esc(f.name)} ${esc(tel(f.phone))}</span><span class="hint">${esc(f.error || '')}</span></li>`).join('')}</ul>` : ''}<button class="btn btn-primary" data-close>확인</button>`);
        const h = await sb.from('promo_sends').select('id,promo_title,channel,total,ok,fail,is_test,created_at').order('created_at', { ascending: false }).limit(200);
        if (!h.error) D.sends = h.data;
      } catch (e) { msg.textContent = ''; oops('보내지 못했습니다.', e); }
      finally { $$('#x-test').disabled = false; $$('#x-go').disabled = kstHour() >= 21 || kstHour() < 8; }
    };
    if (test) return run();
    modal(`<h3>${S.ids.size}명에게 보낼까요?</h3><p class="hint">한 번 보내면 취소할 수 없습니다. 문자 요금이 나갑니다.</p><div class="sl-phone"><div class="sl-bubble">${esc(buildMessage(S.text, promo))}</div></div><div class="btns"><button class="btn btn-cta" id="x-yes">보내기</button><button class="btn btn-line" data-close>취소</button></div>`);
    document.getElementById('x-yes').onclick = run;
  };
  $$('#x-test').onclick = () => go(true);
  $$('#x-go').onclick = () => go(false);
  $$('#x-applog').onclick = async () => {
    const sel = ok.filter((m) => S.opened.has(m.id));
    if (!sel.length) { modal('<h3>기록할 문자가 없습니다</h3><p>"문자앱 열기"를 눌러 보낸 분이 있어야 기록할 수 있습니다.</p><button class="btn btn-primary" data-close>확인</button>'); return; }
    try {
      await q(sb.from('promo_sends').insert({ promo_id: promo ? promo.id : null, promo_title: promo ? promo.title : null, channel: 'phone_app', text: buildMessage(S.text, promo), recipients: sel.map((m) => ({ manager_id: m.id, name: m.name, phone: digits(m.mobile), ok: true })), total: sel.length, ok: sel.length, fail: 0 }), '기록하지 못했습니다.');
      S.opened.clear();
      const h = await sb.from('promo_sends').select('id,promo_title,channel,total,ok,fail,is_test,created_at').order('created_at', { ascending: false }).limit(200);
      if (!h.error) D.sends = h.data;
      V.sub = 'history'; mount();
    } catch (e) { oops(e.userMsg || '기록하지 못했습니다.', e); }
  };
  drawPrev();
}

/* =========================================================
 * 5. 보낸 기록
 * ========================================================= */
const CH = { sms: '단문 문자', lms: '장문 문자', mms: '사진 문자', kakao: '카카오톡', phone_app: '폰 문자앱' };
function drawHistory() {
  body().innerHTML = `<p class="hint">누구에게 언제 무엇을 보냈는지 남습니다. 줄을 누르면 받은 분 목록이 나옵니다.</p>
    <div class="tbl-wrap"><table><thead><tr><th>보낸 날</th><th>홍보물</th><th>방식</th><th class="num">성공</th><th class="num">실패</th><th></th></tr></thead><tbody>${D.sends.length ? D.sends.map((s) => `<tr><td>${dot(s.created_at)} ${String(new Date(s.created_at).toTimeString()).slice(0, 5)}</td><td>${esc(s.promo_title || '(문구만)')}${s.is_test ? ' <span class="status st-quote">테스트</span>' : ''}</td><td>${CH[s.channel] || esc(s.channel)}</td><td class="num">${s.ok}</td><td class="num">${s.fail}</td><td><button class="mini" type="button" data-hs="${s.id}">받은 분</button></td></tr>`).join('') : '<tr><td colspan="6" class="empty">아직 보낸 기록이 없습니다.</td></tr>'}</tbody></table></div>`;
  root.querySelectorAll('[data-hs]').forEach((b) => {
    b.onclick = async () => {
      const r = await sb.from('promo_sends').select('*').eq('id', b.dataset.hs).single();
      if (r.error) return oops('불러오지 못했습니다.', r.error);
      const s = r.data;
      modal(`<h3>${esc(s.promo_title || '문구만')} · ${dot(s.created_at)}</h3><div class="sl-phone"><div class="sl-bubble">${esc(s.text || '')}</div></div><ul class="sl-hist">${(s.recipients || []).map((x) => `<li><span>${esc(x.name || '')} <span class="hint">${esc(tel(x.phone))}</span></span><span class="status ${x.ok ? 'st-sent' : 'st-new'}">${x.ok ? '성공' : esc(x.error || '실패')}</span></li>`).join('')}</ul><button class="btn btn-primary" data-close>닫기</button>`);
    };
  });
}

/* =========================================================
 * 6. 설정
 * ========================================================= */
function drawSettings() {
  const S = D.settings;
  const fields = [
    ['sender', '발신번호', '솔라피에 등록한 보내는 번호 (예: 070-4866-1036)'],
    ['company', '회사 표기', '문자 맨 앞 "(광고)" 다음에 들어갑니다'],
    ['company_tel', '대표번호', '문자 맨 앞에 회사명과 함께 들어갑니다'],
    ['test_to', '테스트 받을 번호', '"나에게 테스트 보내기"가 이 번호로 갑니다 (대표님 휴대폰)'],
    ['optout_tel', '080 수신거부 번호', '있으면 문자 끝에 "무료수신거부 080-…"이 들어갑니다. 없으면 수신거부 페이지 주소가 들어갑니다'],
  ];
  body().innerHTML = `<form class="sl-box" id="st-form" novalidate style="max-width:640px">
      ${fields.map(([k, t, h]) => `<label class="f">${t} <span class="hint">${h}</span><input data-set="${k}" value="${esc(k === 'company' ? S[k] || '' : tel(S[k]))}"></label>`).join('')}
      <div class="btns"><button class="btn btn-primary" type="submit">저장</button></div><p class="hint" id="st-msg2" role="status"></p>
    </form>
    <div class="sl-box" style="max-width:640px"><b>처음 한 번 해 둘 일</b>
      <ol class="hint" style="margin:6px 0 0;padding-left:18px;display:grid;gap:4px">
        <li>솔라피(solapi.com) 가입 → 발신번호 070-4866-1036 등록 (통신서비스 이용증명원 필요)</li>
        <li>솔라피 콘솔 → API Key 발급 → Vercel 환경변수에 <code>SOLAPI_API_KEY</code>, <code>SOLAPI_API_SECRET</code> 넣고 Redeploy</li>
        <li>080 무료 수신거부 번호를 신청하면 위 칸에 넣어 주세요 (광고 문자에 권장)</li>
        <li>카카오톡 발송은 카카오톡 채널 개설 · 비즈니스 인증 후 연결합니다</li>
      </ol></div>`;
  root.querySelector('#st-form').onsubmit = async (e) => {
    e.preventDefault();
    const rows = [...root.querySelectorAll('[data-set]')].map((i) => ({ key: i.dataset.set, value: i.dataset.set === 'company' ? i.value.trim() : digits(i.value) }));
    try {
      await q(sb.from('sales_settings').upsert(rows), '저장하지 못했습니다.');
      rows.forEach((r) => { D.settings[r.key] = r.value; });
      root.querySelector('#st-msg2').textContent = '저장했습니다 ✓';
    } catch (err) { oops(err.userMsg || '저장하지 못했습니다.', err); }
  };
}

/* ---------- 시작: 탭을 처음 열 때 불러오기 ---------- */
const tabBtn = document.querySelector('#admin-tabs [data-tab="sales"]');
if (tabBtn) tabBtn.addEventListener('click', () => { if (!D.loaded) load(); });
