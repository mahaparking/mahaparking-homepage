/* 영업·홍보 — 관리자 화면의 "영업·홍보" 탭 (마하파킹 ERP 1단계)
 * 담당자(관리소장·건물 관리인 등) · 단지·건물(거래처) · 근무 이력 · 홍보물 · 보내기 · 보낸 기록 · 설정
 * 표 구조: supabase/sales.sql
 */
const sb = supabase.createClient(MAHA.SB_URL, MAHA.SB_KEY);
const SITE = 'https://mahaparking.co.kr';
const root = document.getElementById('sales-root');

const D = { sites: [], managers: [], jobs: [], promos: [], sends: [], mails: [], settings: {}, loaded: false };
const V = { ms: 'all', send2: { kind: 'all', st: 'all', q: '', worked: false }, mail: { ids: new Set(), kind: 'all', st: 'all', q: '', title: '', date: '' }, sub: 'managers', mq: '', mf: 'all', mk: 'all', sq: '', sf: 'all', sk: 'all', send: { promo: '', ids: new Set(), text: '', opened: new Set() } };

const SUBS = [['managers', '담당자'], ['sites', '단지·건물'], ['promos', '홍보물'], ['send', '문자 보내기'], ['mail', '📮 우편'], ['find', '🔎 건물 찾기'], ['kapt', '🏢 아파트 명단'], ['history', '보낸 기록'], ['settings', '설정']];
const SITE_KINDS = ['아파트', '건물·빌라', '기타'];
/** 예전 값(빌라·오피스텔 등)도 세 가지로 묶어 보기 */
const kindOf = (k) => (k === '아파트' ? '아파트' : /빌라|오피스텔|상가|건물/.test(k || '') ? '건물·빌라' : '기타');
const guessKind = (name) => (/아파트|단지/.test(name) ? '아파트' : /빌라|맨션|하우스|빌딩|타워|오피스텔|상가|건물|프라자|센터|빌|팰리스|캐슬/.test(name) ? '건물·빌라' : '기타');
const KIND_ALL = ['all', '전체 구분'];
const ST_ALL = ['all', '전체 상태'];
const kindSelect = (id, cur) => `<select id="${id}" style="width:auto">${[KIND_ALL].concat(SITE_KINDS.map((k) => [k, k])).map(([v, t]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
const stSelect = (id, cur) => `<select id="${id}" style="width:auto">${[ST_ALL].concat(Object.keys({ lead: 1, client: 1, hold: 1 }).map((k) => [k, ({ lead: '영업 대상', client: '거래처', hold: '보류' })[k]])).map(([v, t]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
const TITLES = ['관리소장', '관리과장', '관리인', '건물주', '관리단 대표', '시설 담당'];
/** 구분별 문구 예시 (보내기 3번에서 눌러 채움) */
const TEMPLATES = {
  '아파트': '소장님, 안녕하세요. 주차장비 유지보수 전문 마하파킹입니다.\n차단기·차단바·번호인식 장비를 통째로 바꾸지 않고, 고장 난 부분만 살려 새것처럼 고친 아파트 작업 사례를 보내드립니다.\n장비 점검이 필요하시면 편하게 연락 주세요.',
  '건물·빌라': '안녕하세요, 주차장비 유지보수 전문 마하파킹입니다.\n건물·빌라 주차 차단기가 고장 나거나 차단바가 부러졌을 때 빠르게 방문해 합리적인 비용으로 고쳐 드립니다.\n작업 사례를 보내드리니 필요하실 때 연락 주세요.',
  '기타': '안녕하세요, 주차장비 유지보수 전문 마하파킹입니다.\n주차 차단기·경광등·번호인식 장비 수리와 업그레이드 사례를 보내드립니다.\n점검이나 견적이 필요하시면 편하게 연락 주세요.',
};
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
const jobName = (j) => { const s = jobSite(j); return s ? s.name : j.site_name || '(근무지 미등록)'; };
const mgrStatuses = (mid) => curJobs(mid).map((j) => (jobSite(j) || {}).status).filter(Boolean);
const mgrKinds = (mid) => curJobs(mid).map((j) => kindOf((jobSite(j) || { kind: guessKind(j.site_name || '') }).kind));
const curSiteText = (mid) => curJobs(mid).map(jobName).join(', ');
const siteManagers = (sid) => D.jobs.filter((j) => j.site_id === sid && j.is_current).map((j) => byId(D.managers, j.manager_id)).filter(Boolean);
const sendable = (m) => m.consent && !m.opt_out && isMobile(m.mobile);
const siteByName = (name) => D.sites.find((s) => s.name.replace(/\s/g, '') === String(name || '').replace(/\s/g, ''));

/* ---------- 최근 홍보 (문자·우편 중 가장 최근 1건) ---------- */
const PROMO_KIND = { sms: '단문 문자', lms: '장문 문자', mms: '사진 문자', kakao: '카카오톡', phone_app: '폰 문자', mail: '📮 우편' };
function lastPromoManager(m) {
  const sites = new Set(curJobs(m.id).map((j) => j.site_id).filter(Boolean));
  for (const x of D.sends) {
    if (x.is_test) continue;
    const hit = (x.recipients || []).some((r) => (x.channel === 'mail' ? sites.has(r.site_id) : r.manager_id === m.id && r.ok !== false));
    if (hit) return x;
  }
  return null;
}
function lastPromoSite(site) {
  const ids = new Set(siteManagers(site.id).map((m) => m.id));
  for (const x of D.sends) {
    if (x.is_test) continue;
    const hit = (x.recipients || []).some((r) => (x.channel === 'mail' ? r.site_id === site.id : ids.has(r.manager_id) && r.ok !== false));
    if (hit) return x;
  }
  return null;
}
/** "📣 11.15 · 사진 문자 · 제목" (없으면 '아직 보낸 홍보 없음') */
function promoTag(x, short) {
  if (!x) return '<span class="sl-promo none">📣 아직 보낸 홍보 없음</span>';
  return `<span class="sl-promo">📣 ${dot(x.created_at).slice(short ? 5 : 0)} · ${PROMO_KIND[x.channel] || esc(x.channel)}${x.promo_title ? ` · ${esc(x.promo_title)}` : ''}</span>`;
}

/* ---------- 불러오기 ---------- */
async function load() {
  root.innerHTML = '<p class="hint" style="padding:30px 0">불러오고 있습니다...</p>';
  const r = await Promise.all([
    sb.from('sites').select('*').order('name'),
    sb.from('managers').select('*').order('created_at', { ascending: false }),
    sb.from('manager_jobs').select('*').order('start_date', { ascending: false, nullsFirst: false }),
    sb.from('promos').select('*').order('created_at', { ascending: false }),
    sb.from('promo_sends').select('*').order('created_at', { ascending: false }).limit(500),
    sb.from('sales_settings').select('*'),
  ]);
  const err = r.find((x) => x.error);
  if (err) {
    root.innerHTML = `<div class="notice"><b>고객사 리스트 자료표가 아직 준비되지 않았습니다.</b>
      <span>Supabase → SQL Editor 에서 저장소의 <code>supabase/sales.sql</code> 내용을 한 번 실행해 주세요. 실행 후 이 화면을 새로고침하면 됩니다.</span>
      <span class="hint">${esc(err.error.message)}</span><div><button class="btn btn-line btn-sm" type="button" id="sl-retry">↻ 다시 불러오기</button></div></div>`;
    root.querySelector('#sl-retry').onclick = load;
    return;
  }
  [D.sites, D.managers, D.jobs, D.promos, D.sends] = r.slice(0, 5).map((x) => x.data || []);
  D.settings = {}; (r[5].data || []).forEach((x) => { D.settings[x.key] = x.value || ''; });
  D.mails = D.sends.filter((x) => x.channel === 'mail');
  D.loaded = true;
  mount();
}

/* ---------- 화면 틀 ---------- */
function mount() {
  root.innerHTML = `<div class="sl-subs" role="tablist">${SUBS.map(([k, t]) => `<button type="button" role="tab" data-sub="${k}" aria-selected="${k === V.sub}">${t}${k === 'sites' ? '<span class="badge hidden" id="sl-need"></span>' : ''}${k === 'managers' ? '<span class="badge hidden" id="sl-web"></span>' : ''}${k === 'mail' ? '<span class="badge hidden" id="sl-call"></span>' : ''}</button>`).join('')}</div><div id="sl-body"></div>`;
  root.querySelectorAll('[data-sub]').forEach((b) => { b.onclick = () => { V.sub = b.dataset.sub; mount(); }; });
  const need = D.sites.filter((s) => s.need_new_manager).length;
  const nb = root.querySelector('#sl-need'); nb.textContent = need || ''; nb.classList.toggle('hidden', !need);
  if (V.sub === 'managers') { if (!V.webSeen) V.webSeen = seenAt(); markWebSeen(); }
  refreshBadge();
  ({ managers: drawManagers, sites: drawSites, promos: drawPromos, send: drawSend, mail: drawMail, find: drawFind, kapt: drawKapt, history: drawHistory, settings: drawSettings })[V.sub]();
}
const body = () => root.querySelector('#sl-body');

/* =========================================================
 * 1. 담당자 (관리소장 · 건물 관리인 · 건물주 등)
 * ========================================================= */
function drawManagers() {
  const F = { all: '전체', consent: '수신 동의', none: '동의 안 받음', optout: '수신거부', worked: '기존 고객' };
  body().innerHTML = `
    <p class="hint">아파트 관리소장님, 건물·빌라 관리인·건물주 등 연락할 분을 모읍니다. 명함을 찍으면 이름·휴대폰·근무지가 자동으로 들어갑니다. 다른 곳으로 옮기시면 <b>근무지 변경</b>을 눌러 주세요. 연락처와 수신 동의는 사람을 따라갑니다.</p>
    <div class="add-row" style="align-items:center">
      <button class="btn btn-primary btn-sm" type="button" id="m-card">📷 명함으로 등록</button>
      <button class="btn btn-line btn-sm" type="button" id="m-add">+ 직접 등록</button>
      <input type="file" id="m-file" accept="image/*" class="hidden">
      <input id="m-q" placeholder="이름 · 근무지 · 번호 찾기" value="${esc(V.mq)}" style="max-width:220px">
      ${kindSelect('m-k', V.mk)}${stSelect('m-s', V.ms)}
      <select id="m-f" style="width:auto">${Object.keys(F).map((k) => `<option value="${k}"${k === V.mf ? ' selected' : ''}>${F[k]}</option>`).join('')}</select>
    </div>
    <div class="sl-kpis">${[['등록', D.managers.length], ['수신 동의', D.managers.filter(sendable).length], ['기존 고객', D.managers.filter((m) => m.worked_with).length], ['수신거부', D.managers.filter((m) => m.opt_out).length]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
    <div class="sl-list" id="m-list"></div>`;
  const draw = () => {
    const qq = V.mq.replace(/\s/g, '').toLowerCase();
    const list = D.managers.filter((m) => {
      if (V.mf === 'consent' && !sendable(m)) return false;
      if (V.mf === 'none' && (m.consent || m.opt_out)) return false;
      if (V.mf === 'optout' && !m.opt_out) return false;
      if (V.mf === 'worked' && !m.worked_with) return false;
      if (V.mk !== 'all' && !mgrKinds(m.id).includes(V.mk)) return false;
      if (V.ms !== 'all' && !mgrStatuses(m.id).includes(V.ms)) return false;
      if (!qq) return true;
      return [m.name, m.title, m.mobile, digits(m.mobile), curSiteText(m.id), m.memo].join(' ').replace(/\s/g, '').toLowerCase().includes(qq);
    });
    root.querySelector('#m-list').innerHTML = list.length ? list.map((m) => `
      <div class="sl-card">
        <div class="sl-co">${curSiteText(m.id) ? `🏢 <b>${esc(curSiteText(m.id))}</b>` : '<span class="hint">🏢 근무지 미등록</span>'}${[...new Set(mgrKinds(m.id))].map((k) => ` <span class="status sl-kind">${k}</span>`).join('')}</div>
        <div class="sl-card-h"><b class="sl-person">${esc(m.name)}</b><span class="hint">${esc(m.title || '')}</span>
          ${m.opt_out ? '<span class="status st-new">수신거부</span>' : m.consent ? '<span class="status st-sent">수신 동의</span>' : '<span class="status st-quote">동의 전</span>'}
          ${m.worked_with ? '<span class="status sl-worked">기존 고객</span>' : ''}
          ${m.source === 'web' ? `<span class="status ${V.webSeen && m.created_at > V.webSeen ? 'st-new">새 신청' : 'st-quote">홈페이지 신청'}</span>` : ''}</div>
        <div class="sl-line">${m.mobile ? `📱 <a href="tel:${digits(m.mobile)}">${esc(tel(m.mobile))}</a>` : '<span class="hint">휴대폰 없음</span>'}</div>
        <div class="sl-line">${promoTag(lastPromoManager(m))}</div>
        <div class="sl-btns"><button class="btn btn-line btn-sm" type="button" data-open="${m.id}">자세히 · 수정</button><button class="btn btn-line btn-sm" type="button" data-move="${m.id}">근무지 변경</button><button class="btn btn-danger btn-sm" type="button" data-mdel="${m.id}">삭제</button></div>
      </div>`).join('') : '<p class="empty">해당하는 담당자가 없습니다. 명함을 찍어 등록해 보세요.</p>';
    root.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => managerModal(byId(D.managers, b.dataset.open)); });
    root.querySelectorAll('[data-move]').forEach((b) => { b.onclick = () => moveModal(byId(D.managers, b.dataset.move)); });
    root.querySelectorAll('[data-mdel]').forEach((b) => { b.onclick = () => deleteManager(byId(D.managers, b.dataset.mdel)); });
  };
  root.querySelector('#m-q').oninput = (e) => { V.mq = e.target.value; draw(); };
  root.querySelector('#m-f').onchange = (e) => { V.mf = e.target.value; draw(); };
  root.querySelector('#m-k').onchange = (e) => { V.mk = e.target.value; draw(); };
  root.querySelector('#m-s').onchange = (e) => { V.ms = e.target.value; draw(); };
  root.querySelector('#m-add').onclick = () => managerModal(null);
  root.querySelector('#m-card').onclick = () => cardCamera(() => root.querySelector('#m-file').click());
  root.querySelector('#m-file').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) scanCard(f); };
  draw();
}

/** 명함 촬영: 화면에 명함 모양 테두리를 띄우고, 테두리 안만 잘라서 읽기 (카메라를 못 쓰면 사진 고르기) */
const CARD_RATIO = 90 / 50;
async function cardCamera(pickFile) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return pickFile();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  } catch (e) { return pickFile(); }
  modal(`<h3 style="margin:0">명함 찍기</h3>
    <div class="sl-cam" id="cam-box"><video id="cam-v" autoplay playsinline muted></video><div class="sl-cam-frame" id="cam-f"><span></span><span></span><span></span><span></span></div><p class="sl-cam-tip">명함을 테두리 안에 꽉 차게 맞춰 주세요</p></div>
    <div class="btns" style="justify-content:center"><button class="btn btn-cta" id="cam-shot" style="min-width:140px">📷 찍기</button><button class="btn btn-line" id="cam-pick">사진에서 고르기</button><button class="btn btn-line" id="cam-close">닫기</button></div>`);
  const v = document.getElementById('cam-v');
  v.srcObject = stream;
  const stop = () => { stream.getTracks().forEach((t) => t.stop()); clearInterval(watch); };
  const watch = setInterval(() => { if (!document.body.contains(v) || $('modal').classList.contains('hidden')) stop(); }, 400);
  document.getElementById('cam-close').onclick = () => { stop(); closeModal(); };
  document.getElementById('cam-pick').onclick = () => { stop(); closeModal(); pickFile(); };
  document.getElementById('cam-shot').onclick = () => {
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw) return;
    const box = document.getElementById('cam-box').getBoundingClientRect();
    const fr = document.getElementById('cam-f').getBoundingClientRect();
    const sc = Math.max(box.width / vw, box.height / vh);          // 화면에 보이는 배율 (object-fit: cover)
    const dx = (box.width - vw * sc) / 2, dy = (box.height - vh * sc) / 2;
    const pad = 0.04 * fr.width;                                     // 테두리 바깥 조금 여유
    let x = (fr.left - box.left - pad - dx) / sc, y = (fr.top - box.top - pad - dy) / sc;
    let w = (fr.width + pad * 2) / sc, h = (fr.height + pad * 2) / sc;
    x = Math.max(0, x); y = Math.max(0, y); w = Math.min(vw - x, w); h = Math.min(vh - y, h);
    const c = document.createElement('canvas');
    const out = Math.min(1600, Math.round(w));
    c.width = out; c.height = Math.round(out * h / w);
    c.getContext('2d').drawImage(v, x, y, w, h, 0, 0, c.width, c.height);
    stop();
    c.toBlob((b) => { if (b) scanCard(b); else oops('사진을 만들지 못했습니다.'); }, 'image/jpeg', 0.9);
  };
}

async function scanCard(file) {
  modal('<h3>명함을 읽고 있습니다</h3><p class="hint">10초 정도 걸립니다...</p>');
  try {
    const s = await shrinkToBlob(file, 1600);
    if (!s) throw new Error('사진을 열지 못했습니다.');
    const b64 = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(s.blob); });
    const j = await api('/api/card-scan', { b64 });
    const c = j.card || {};
    managerModal(null, { name: c.name, title: c.title || '', mobile: c.mobile, email: c.email, site: c.org, office_tel: c.office_tel, office_fax: c.office_fax, address: c.address, mgmt_company: c.mgmt_company, cardBlob: s.blob, cardUrl: s.url });
  } catch (e) {
    oops('명함을 읽지 못했습니다. 직접 입력해 주세요.', e);
  }
}

/** 구분 고르기 (아파트 / 건물·빌라 / 기타). 근무지 이름을 적으면 자동으로 맞춰 주고, 직접 고르면 그대로 둠 */
function kindPicker(id, cur) {
  return `<div class="sl-kinds" role="radiogroup" aria-label="구분" id="${id}">${SITE_KINDS.map((k) => `<label class="sl-kindopt"><input type="radio" name="${id}" value="${k}"${k === cur ? ' checked' : ''}> ${k}</label>`).join('')}</div>`;
}
function bindKind(nameInputId, pickerId) {
  const inp = document.getElementById(nameInputId), box = document.getElementById(pickerId);
  if (!inp || !box) return;
  let touched = false;
  box.querySelectorAll('input').forEach((r) => { r.onchange = () => { touched = true; }; });
  const auto = () => {
    if (touched) return;
    const ex = siteByName(inp.value);
    const k = ex ? kindOf(ex.kind) : inp.value.trim() ? guessKind(inp.value) : '';
    box.querySelectorAll('input').forEach((r) => { r.checked = r.value === k; });
  };
  inp.addEventListener('input', auto); inp.addEventListener('change', auto); auto();
}
const readKind = (pickerId) => { const r = document.querySelector(`#${pickerId} input:checked`); return r ? r.value : ''; };

function siteDatalist() { return `<datalist id="sl-sites">${D.sites.map((s) => `<option value="${esc(s.name)}">`).join('')}</datalist>`; }

function managerModal(m, pre) {
  const isNew = !m;
  const x = m || { name: '', title: '', mobile: '', email: '', consent: false, consent_how: HOW[1], worked_with: false, memo: '' };
  if (pre) Object.keys(pre).forEach((k) => { if (pre[k] && k in x) x[k] = pre[k]; });
  const jobs = m ? D.jobs.filter((j) => j.manager_id === m.id) : [];
  modal(`<h3>${isNew ? '담당자 등록' : '담당자 정보'}</h3>
    ${pre && pre.cardUrl ? `<img src="${pre.cardUrl}" alt="명함 사진" style="max-height:160px;border-radius:10px;object-fit:contain;background:#F7F9FB"><p class="hint" style="margin:0">명함에서 읽은 내용입니다. 틀린 곳이 있으면 고쳐 주세요.</p>` : ''}
    <div class="row2"><label class="f">이름<input id="mm-name" value="${esc(x.name)}"></label><label class="f">직함<input id="mm-title" list="sl-titles" value="${esc(x.title || '')}" placeholder="관리소장 · 관리인 · 건물주 등"><datalist id="sl-titles">${TITLES.map((t) => `<option value="${t}">`).join('')}</datalist></label></div>
    <div class="row2"><label class="f">휴대폰<input id="mm-mobile" inputmode="tel" value="${esc(tel(x.mobile))}"></label><label class="f">이메일<input id="mm-email" type="email" value="${esc(x.email || '')}"></label></div>
    ${isNew ? `<label class="f">현재 근무지 (아파트·건물 이름) <span class="hint">(등록된 곳에서 고르거나 새 이름을 적으면 함께 만들어집니다)</span><input id="mm-site" list="sl-sites" value="${esc((pre && pre.site) || '')}">${siteDatalist()}</label>
      <div class="f"><span>근무지 구분 <span class="hint">(이름을 보고 자동으로 골라 두었습니다. 다르면 바꿔 주세요)</span></span>${kindPicker('mm-kind', '')}</div>`
      : (() => { const cs = curJobs(m.id).map(jobSite).filter(Boolean)[0]; return cs ? `<div class="f"><span>근무지 구분 <span class="hint">(${esc(cs.name)})</span></span>${kindPicker('mm-kind', kindOf(cs.kind))}</div>` : ''; })()}
    <div class="sl-consent">
      <label class="sl-chk"><input type="checkbox" id="mm-consent"${x.consent && !x.opt_out ? ' checked' : ''}> <b>홍보 문자·카톡 수신에 동의하셨습니다</b></label>
      <select id="mm-how" style="width:auto">${opt(HOW, x.consent_how || HOW[1])}</select>
      ${m && m.consent_at ? `<span class="hint">동의 기록: ${fmtDate(m.consent_at)} · ${esc(m.consent_how || '')}</span>` : ''}
      ${m && m.opt_out ? `<span class="hint" style="color:var(--stop)">${fmtDate(m.opt_out_at)} 수신거부하셨습니다. 다시 동의를 받으신 경우에만 체크해 주세요.</span>` : ''}
    </div>
    <label class="sl-chk"><input type="checkbox" id="mm-worked"${x.worked_with ? ' checked' : ''}> <b>기존 고객</b> <span class="hint">(마하파킹과 거래·작업한 적이 있는 분)</span></label>
    <label class="f">메모 <span class="hint">(성향, 관심 장비, 다음 연락 시기 등)</span><textarea id="mm-memo">${esc(x.memo || '')}</textarea></label>
    ${m ? `<div><b style="font-size:14px">근무 이력</b><ul class="sl-hist">${jobs.length ? jobs.map((j) => `<li><span>${esc(jobName(j))}</span><span class="hint">${fmtDate(j.start_date) || '?'} ~ ${j.is_current ? '현재' : fmtDate(j.end_date)}</span></li>`).join('') : '<li class="hint">근무 이력이 없습니다.</li>'}</ul></div>` : ''}
    <div class="btns"><button class="btn btn-primary" id="mm-save">저장</button>${m ? '<button class="btn btn-line" id="mm-move">근무지 변경</button><button class="btn btn-danger" id="mm-del">삭제</button>' : ''}<button class="btn btn-line" data-close>닫기</button></div>
    <p class="hint" id="mm-msg" role="status"></p>`);
  const g = (id) => document.getElementById(id);
  if (isNew) bindKind('mm-site', 'mm-kind');
  g('mm-save').onclick = async () => {
    const name = g('mm-name').value.trim();
    if (!name) { g('mm-msg').textContent = '이름을 적어 주세요.'; return; }
    const consent = g('mm-consent').checked;
    const row = { name, title: g('mm-title').value.trim(), mobile: digits(g('mm-mobile').value) || null, email: g('mm-email').value.trim() || null, worked_with: g('mm-worked').checked, memo: g('mm-memo').value.trim() || null, updated_at: nowIso() };
    if (consent && !(m && m.consent && !m.opt_out)) Object.assign(row, { consent: true, consent_at: nowIso(), consent_how: g('mm-how').value, opt_out: false, opt_out_at: null });
    if (!consent && m && m.consent) Object.assign(row, { consent: false });
    if (consent && m && m.consent && g('mm-how').value !== m.consent_how) row.consent_how = g('mm-how').value;
    if (isNew && g('mm-site').value.trim() && !readKind('mm-kind')) { g('mm-msg').textContent = '근무지 구분(아파트 / 건물·빌라 / 기타)을 골라 주세요.'; return; }
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
        if (siteName) await startJob(saved, siteName, today(), pre, readKind('mm-kind'));
      } else {
        const saved = await q(sb.from('managers').update(row).eq('id', m.id).select().single(), '저장하지 못했습니다.');
        const cs = curJobs(m.id).map(jobSite).filter(Boolean)[0], k = readKind('mm-kind');
        if (cs && k && k !== kindOf(cs.kind)) { await sb.from('sites').update({ kind: k, updated_at: nowIso() }).eq('id', cs.id); cs.kind = k; }
        Object.assign(m, saved);
      }
      closeModal(); mount();
    } catch (e) { g('mm-save').disabled = false; oops(e.userMsg || '저장하지 못했습니다.', e); }
  };
  if (m) {
    g('mm-move').onclick = () => moveModal(m);
    g('mm-del').onclick = () => deleteManager(m);
  }
}

function deleteManager(m) {
  modal(`<h3>${esc(m.name)} 님을 삭제할까요?</h3><p>연락처·명함 사진·근무 이력이 함께 지워집니다. 되돌릴 수 없습니다.</p><div class="btns"><button class="btn btn-danger" id="mm-del2">삭제</button><button class="btn btn-line" data-close>취소</button></div>`);
  document.getElementById('mm-del2').onclick = async () => {
    try {
      if (m.card_path) await sb.storage.from('cards').remove([m.card_path]);
      await q(sb.from('managers').delete().eq('id', m.id), '삭제하지 못했습니다.');
      D.managers = D.managers.filter((y) => y.id !== m.id); D.jobs = D.jobs.filter((j) => j.manager_id !== m.id);
      closeModal(); mount();
    } catch (e) { oops(e.userMsg || '삭제하지 못했습니다.', e); }
  };
}

/** 단지 찾기 또는 새로 만들기 (새 단지는 영업 대상) */
async function ensureSite(name, pre, kind) {
  let s = siteByName(name);
  if (s) {
    if (kind && kind !== kindOf(s.kind)) { await sb.from('sites').update({ kind, updated_at: nowIso() }).eq('id', s.id); s.kind = kind; }
    return { site: s, created: false };
  }
  const row = { name: name.trim(), kind: kind || guessKind(name), status: 'lead' };
  if (pre) { if (pre.office_tel) row.office_tel = digits(pre.office_tel); if (pre.office_fax) row.office_fax = digits(pre.office_fax); if (pre.address) row.address = pre.address; if (pre.mgmt_company) row.mgmt_company = pre.mgmt_company; }
  s = await q(sb.from('sites').insert(row).select().single(), '단지를 만들지 못했습니다.');
  D.sites.push(s); D.sites.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return { site: s, created: true };
}

async function startJob(m, siteName, start, pre, kind) {
  const { site, created } = await ensureSite(siteName, pre, kind);
  const job = await q(sb.from('manager_jobs').insert({ manager_id: m.id, site_id: site.id, site_name: site.name, start_date: start || today(), is_current: true }).select().single(), '근무 이력을 저장하지 못했습니다.');
  D.jobs.unshift(job);
  if (site.need_new_manager) { await sb.from('sites').update({ need_new_manager: false, updated_at: nowIso() }).eq('id', site.id); site.need_new_manager = false; }
  return { site, created };
}

function moveModal(m) {
  const cur = curJobs(m.id);
  modal(`<h3>${esc(m.name)} ${esc(m.title || '')}님 근무지 변경</h3>
    <p class="hint" style="margin:0">지금 근무지: <b>${esc(cur.map(jobName).join(', ') || '없음')}</b><br>옮기시면 이전 근무지는 "새 담당자 확인 필요"로 표시되고, 새 근무지가 아직 거래처가 아니면 <b>영업 대상</b>으로 등록됩니다.</p>
    <label class="f">새 근무지 (아파트·건물 이름)<input id="mv-site" list="sl-sites" placeholder="아파트·건물 이름">${siteDatalist()}</label>
    <div class="f"><span>새 근무지 구분</span>${kindPicker('mv-kind', '')}</div>
    <label class="f">옮기신 날<input id="mv-date" type="date" value="${today()}"></label>
    <div class="btns"><button class="btn btn-primary" id="mv-go">변경하기</button><button class="btn btn-line" data-close>취소</button></div>
    <p class="hint" id="mv-msg" role="status"></p>`);
  const g = (id) => document.getElementById(id);
  bindKind('mv-site', 'mv-kind');
  g('mv-go').onclick = async () => {
    const name = g('mv-site').value.trim(), d = g('mv-date').value || today();
    if (!name) { g('mv-msg').textContent = '새 근무지 이름을 적어 주세요.'; return; }
    if (cur.some((j) => jobName(j).replace(/\s/g, '') === name.replace(/\s/g, ''))) { g('mv-msg').textContent = '지금 근무 중인 곳과 같습니다.'; return; }
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
      const { site, created } = await startJob(m, name, d, null, readKind('mv-kind'));
      modal(`<h3>근무지를 바꿨습니다</h3>
        <p><b>${esc(m.name)}</b> ${esc(m.title || '')}님 → <b>${esc(site.name)}</b></p>
        ${site.status !== 'client' ? `<div class="notice"><b>${esc(site.name)}</b>${created ? '을(를) 새로 만들고' : '은(는)'} 영업 대상입니다. 마하파킹을 아시는 분이 계신 곳이니 먼저 연락해 보세요.</div>` : ''}
        ${flagged.length ? `<p class="hint">${esc(flagged.join(', '))}: 다음 방문 때 새 담당자 명함을 받아 주세요.</p>` : ''}
        <button class="btn btn-primary" data-close>확인</button>`);
      mount();
    } catch (e) { g('mv-go').disabled = false; oops(e.userMsg || '변경하지 못했습니다.', e); }
  };
}

/* =========================================================
 * 2. 단지·건물 (거래처)
 * ========================================================= */
function drawSites() {
  const F = { all: '전체 상태', client: '거래처', lead: '영업 대상', need: '새 담당자 확인 필요', hold: '보류' };
  body().innerHTML = `
    <p class="hint">아파트 · 건물·빌라 · 기타로 나눠 관리합니다. 거래처는 그대로 남고 담당자만 바뀝니다. 견적·작업·세금계산서도 앞으로 이곳에 이어 붙습니다.</p>
    <div class="add-row" style="align-items:center">
      <button class="btn btn-primary btn-sm" type="button" id="s-add">+ 등록</button>
      <input id="s-q" placeholder="이름 · 지역 찾기" value="${esc(V.sq)}" style="max-width:220px">
      <select id="s-k" style="width:auto">${[KIND_ALL].concat(SITE_KINDS.map((k) => [k, k])).map(([v, t]) => `<option value="${v}"${v === V.sk ? ' selected' : ''}>${t}</option>`).join('')}</select>
      <select id="s-f" style="width:auto">${Object.keys(F).map((k) => `<option value="${k}"${k === V.sf ? ' selected' : ''}>${F[k]}</option>`).join('')}</select>
    </div>
    <div class="sl-kpis">${[['아파트', D.sites.filter((s) => kindOf(s.kind) === '아파트').length], ['건물·빌라', D.sites.filter((s) => kindOf(s.kind) === '건물·빌라').length], ['거래처', D.sites.filter((s) => s.status === 'client').length], ['새 담당자 확인', D.sites.filter((s) => s.need_new_manager).length]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
    <div class="sl-list" id="s-list"></div>`;
  const draw = () => {
    const qq = V.sq.replace(/\s/g, '').toLowerCase();
    const list = D.sites.filter((s) => {
      if (V.sf === 'need' ? !s.need_new_manager : V.sf !== 'all' && s.status !== V.sf) return false;
      if (V.sk !== 'all' && kindOf(s.kind) !== V.sk) return false;
      return !qq || [s.name, s.region, s.address, s.mgmt_company].join(' ').replace(/\s/g, '').toLowerCase().includes(qq);
    });
    root.querySelector('#s-list').innerHTML = list.length ? list.map((s) => {
      const ms = siteManagers(s.id), st = SITE_ST[s.status] || SITE_ST.lead;
      return `<div class="sl-card">
        <div class="sl-card-h"><b>${esc(s.name)}</b><span class="status sl-kind">${kindOf(s.kind)}</span><span class="status ${st[1]}">${st[0]}</span>${s.need_new_manager ? '<span class="status st-new">새 담당자 확인</span>' : ''}${s.region ? `<span class="hint">${esc(s.region)}</span>` : ''}</div>
        <div class="sl-line">👤 ${ms.length ? ms.map((m) => `${esc(m.name)} ${esc(m.title || '')}`).join(', ') : '<span class="hint">담당자 미등록</span>'}</div>
        <div class="sl-line">${s.office_tel ? `☎ <a href="tel:${digits(s.office_tel)}">${esc(tel(s.office_tel))}</a>` : ''}${s.office_fax ? ` <span class="hint">팩스 ${esc(tel(s.office_fax))}</span>` : ''}${s.households ? ` <span class="hint">· ${s.households}세대</span>` : ''}</div>
        <div class="sl-line">${promoTag(lastPromoSite(s))}${(() => { const lm = lastMail(s.id), lp = lastPromoSite(s); return lm && lp && lp.channel === 'mail' && lm.called ? ' <span class="status st-sent">전화 완료</span>' : ''; })()}</div>
        <div class="sl-btns"><button class="btn btn-line btn-sm" type="button" data-sopen="${s.id}">자세히 · 수정</button><button class="btn btn-danger btn-sm" type="button" data-sdel="${s.id}">삭제</button></div>
      </div>`;
    }).join('') : '<p class="empty">해당하는 곳이 없습니다.</p>';
    root.querySelectorAll('[data-sopen]').forEach((b) => { b.onclick = () => siteModal(byId(D.sites, b.dataset.sopen)); });
    root.querySelectorAll('[data-sdel]').forEach((b) => { b.onclick = () => deleteSite(byId(D.sites, b.dataset.sdel)); });
  };
  root.querySelector('#s-q').oninput = (e) => { V.sq = e.target.value; draw(); };
  root.querySelector('#s-f').onchange = (e) => { V.sf = e.target.value; draw(); };
  root.querySelector('#s-k').onchange = (e) => { V.sk = e.target.value; draw(); };
  root.querySelector('#s-add').onclick = () => siteModal(null);
  draw();
}

function siteModal(s) {
  const x = s || { name: '', kind: '아파트', region: '', address: '', office_tel: '', office_fax: '', households: '', mgmt_company: '', equipment: '', status: 'lead', need_new_manager: false, memo: '' };
  const hist = s ? D.jobs.filter((j) => j.site_id === s.id) : [];
  modal(`<h3>${s ? '단지·건물 정보' : '단지·건물 등록'}</h3>
    <div class="row2"><label class="f">이름 <span class="hint">(아파트·건물·빌라 이름)</span><input id="ss-name" value="${esc(x.name)}"></label><label class="f">구분<select id="ss-kind">${opt(SITE_KINDS, kindOf(x.kind))}</select></label></div>
    <div class="row2"><label class="f">지역<input id="ss-region" value="${esc(x.region || '')}" placeholder="예) 안양 만안구"></label><label class="f">상태<select id="ss-status">${Object.keys(SITE_ST).map((k) => `<option value="${k}"${k === x.status ? ' selected' : ''}>${SITE_ST[k][0]}</option>`).join('')}</select></label></div>
    <label class="f">주소<input id="ss-addr" value="${esc(x.address || '')}"></label>
    <div class="row3"> <label class="f">관리사무소·대표 전화<input id="ss-tel" inputmode="tel" value="${esc(tel(x.office_tel))}"></label><label class="f">팩스<input id="ss-fax" inputmode="tel" value="${esc(tel(x.office_fax))}"></label><label class="f">세대수·호수<input id="ss-hh" inputmode="numeric" value="${esc(x.households || '')}"></label></div>
    <label class="f">위탁관리회사<input id="ss-mc" value="${esc(x.mgmt_company || '')}"></label>
    <label class="f">설치 장비 <span class="hint">(차단기 대수, 제조사, 번호인식 여부 등)</span><textarea id="ss-eq">${esc(x.equipment || '')}</textarea></label>
    <label class="f">메모<textarea id="ss-memo">${esc(x.memo || '')}</textarea></label>
    <label class="sl-chk"><input type="checkbox" id="ss-need"${x.need_new_manager ? ' checked' : ''}> 새 담당자 확인 필요</label>
    ${s ? `<div><b style="font-size:14px">이곳의 담당자 이력</b><ul class="sl-hist">${hist.length ? hist.map((j) => { const m = byId(D.managers, j.manager_id); return `<li><span>${esc(m ? m.name : '?')} ${esc(m ? m.title || '' : '')}</span><span class="hint">${fmtDate(j.start_date) || '?'} ~ ${j.is_current ? '현재' : fmtDate(j.end_date)}</span></li>`; }).join('') : '<li class="hint">아직 없습니다.</li>'}</ul></div>` : ''}
    <div class="btns"><button class="btn btn-primary" id="ss-save">저장</button>${s ? '<button class="btn btn-danger" id="ss-del">삭제</button>' : ''}<button class="btn btn-line" data-close>닫기</button></div>
    <p class="hint" id="ss-msg" role="status"></p>`);
  const g = (id) => document.getElementById(id);
  g('ss-save').onclick = async () => {
    const name = g('ss-name').value.trim();
    if (!name) { g('ss-msg').textContent = '이름을 적어 주세요.'; return; }
    const same = siteByName(name);
    if (same && (!s || same.id !== s.id)) { g('ss-msg').textContent = '같은 이름이 이미 등록되어 있습니다.'; return; }
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
  if (s) g('ss-del').onclick = () => deleteSite(s);
}

function deleteSite(s) {
  modal(`<h3>${esc(s.name)}을(를) 삭제할까요?</h3><p>담당자 정보는 남고, 근무 이력에는 이름만 남습니다.</p><div class="btns"><button class="btn btn-danger" id="ss-del2">삭제</button><button class="btn btn-line" data-close>취소</button></div>`);
  document.getElementById('ss-del2').onclick = async () => {
    try {
      await q(sb.from('sites').delete().eq('id', s.id), '삭제하지 못했습니다.');
      D.sites = D.sites.filter((y) => y.id !== s.id); D.jobs.forEach((j) => { if (j.site_id === s.id) j.site_id = null; });
      closeModal(); mount();
    } catch (e) { oops(e.userMsg || '삭제하지 못했습니다.', e); }
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
    <p class="hint">작업 사례 사진·홍보 이미지·동영상을 올려 두면 <b>보내기</b>에서 골라 보낼 수 있습니다. 홍보물마다 받는 분이 열어 볼 수 있는 보기 페이지(${SITE}/m/?p=…)가 자동으로 생깁니다.</p>
    <form class="sl-box" id="p-form" novalidate>
      <b>새 홍보물 올리기</b>
      <label class="f">제목<input id="p-title" placeholder="예) 안양 OO아파트 차단기 업싸이클링 사례"></label>
      <label class="f">파일 <span class="hint">(이미지 또는 동영상 · 동영상은 50MB 이하, 휴대폰 세로 영상 권장)</span><input id="p-file" type="file" accept="image/*,video/mp4,video/quicktime,video/webm"></label>
      <label class="f">기본 안내 문구 <span class="hint">(보낼 때 고칠 수 있습니다)</span><textarea id="p-body" placeholder="예) 안녕하세요, 마하파킹입니다.&#10;고장 난 차단기를 통째로 바꾸지 않고 부품만 살려 새것처럼 고친 사례를 보내드립니다."></textarea></label>
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
  const F = V.send2;
  const shown = ok.filter((m) => {
    if (F.kind !== 'all' && !mgrKinds(m.id).includes(F.kind)) return false;
    if (F.st !== 'all' && !mgrStatuses(m.id).includes(F.st)) return false;
    if (F.worked && !m.worked_with) return false;
    const qq = F.q.replace(/\s/g, '');
    return !qq || [m.name, m.title, curSiteText(m.id), m.mobile].join(' ').replace(/\s/g, '').includes(qq);
  });
  const night = kstHour() >= 21 || kstHour() < 8;
  body().innerHTML = `
    <div class="sl-step"><b><span class="sl-no">1</span>홍보물 고르기</b>
      <select id="x-promo"><option value="">홍보물 없이 문구만 보내기</option>${D.promos.filter((p) => p.is_public).map((p) => `<option value="${p.id}"${p.id === S.promo ? ' selected' : ''}>${esc(p.title)} (${p.kind === 'video' ? '동영상' : '이미지'})</option>`).join('')}</select>
      ${promo ? `<p class="hint" style="margin:6px 0 0">${promo.kind === 'image' ? '이미지가 사진 문자(MMS)로 함께 가고, 크게 보는 주소도 붙습니다.' : '동영상은 문자에 넣을 수 없어 "영상 보기" 주소가 붙습니다.'}</p>` : ''}
    </div>
    <div class="sl-step"><b><span class="sl-no">2</span>받는 분 고르기</b>
      <div class="add-row" style="margin:6px 0;align-items:center">${kindSelect('x-k', F.kind)}${stSelect('x-s', F.st)}<input id="x-q" placeholder="이름 · 근무지 찾기" value="${esc(F.q)}" style="max-width:180px"><label class="sl-chk"><input type="checkbox" id="x-w"${F.worked ? ' checked' : ''}> 기존 고객만</label></div>
      <div class="add-row" style="margin:0 0 6px"><button class="btn btn-line btn-sm" type="button" id="x-all">보이는 분 모두 선택 (${shown.length})</button><button class="btn btn-line btn-sm" type="button" id="x-clear">모두 해제</button></div>
      <p class="hint" style="margin:0 0 6px">수신 동의한 분만 고를 수 있습니다. 빠진 분: 동의 전 ${ex.none}명 · 수신거부 ${ex.out}명 · 휴대폰 없음 ${ex.noNum}명</p>
      <div class="sl-pick">${shown.length ? shown.map((m) => `<label class="sl-chk"><input type="checkbox" data-pick="${m.id}"${S.ids.has(m.id) ? ' checked' : ''}> <span><b>${esc(m.name)}</b> <span class="hint">${esc(curSiteText(m.id) || '')} · ${esc(tel(m.mobile))}</span><br>${promoTag(lastPromoManager(m), true)}</span></label>`).join('') : '<p class="empty">수신 동의한 분이 아직 없습니다. 담당자 화면에서 동의를 체크해 주세요.</p>'}</div>
      <p style="margin:6px 0 0"><b id="x-count">${S.ids.size}</b>명 선택</p>
    </div>
    <div class="sl-step"><b><span class="sl-no">3</span>문구 쓰기</b>
      <div class="add-row" style="margin:2px 0 4px;align-items:center"><span class="hint">문구 예시:</span>${SITE_KINDS.map((k) => `<button class="btn btn-line btn-sm" type="button" data-tpl="${k}">${k}용</button>`).join('')}</div>
      <textarea id="x-text" style="min-height:120px" placeholder="안녕하세요, 마하파킹입니다.">${esc(S.text)}</textarea>
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
  $$('#x-k').onchange = (e) => { F.kind = e.target.value; drawSend(); };
  $$('#x-s').onchange = (e) => { F.st = e.target.value; drawSend(); };
  $$('#x-q').onchange = (e) => { F.q = e.target.value; drawSend(); };
  $$('#x-w').onchange = (e) => { F.worked = e.target.checked; drawSend(); };
  $$('#x-all').onclick = () => { shown.forEach((m) => S.ids.add(m.id)); drawSend(); };
  $$('#x-clear').onclick = () => { S.ids.clear(); drawSend(); };
  root.querySelectorAll('[data-pick]').forEach((c) => { c.onchange = () => { if (c.checked) S.ids.add(c.dataset.pick); else S.ids.delete(c.dataset.pick); count(); }; });
  $$('#x-text').oninput = (e) => { S.text = e.target.value; drawPrev(); };
  root.querySelectorAll('[data-tpl]').forEach((b) => { b.onclick = () => { S.text = TEMPLATES[b.dataset.tpl]; $$('#x-text').value = S.text; drawPrev(); }; });
  const go = async (test) => {
    const msg = $$('#x-msg');
    const warn = (t) => modal(`<h3>${t}</h3><button class="btn btn-primary" data-close>확인</button>`);
    if (!S.text.trim()) return warn('3번 "문구 쓰기"에 보낼 내용을 먼저 적어 주세요.');
    if (!test && !S.ids.size) return warn('2번에서 받는 분을 골라 주세요.');
    const run = async () => {
      closeModal();
      $$('#x-test').disabled = true; $$('#x-go').disabled = true; msg.textContent = '보내고 있습니다...';
      try {
        const j = await api('/api/promo-send', { promo_id: S.promo || null, manager_ids: test ? [] : [...S.ids], text: S.text, test });
        msg.textContent = '';
        modal(`<h3>${test ? '테스트 문자를 보냈습니다' : '보냈습니다'}</h3><p>성공 <b>${j.ok}</b>건 · 실패 <b>${j.fail}</b>건${j.skipped ? ` · 동의 확인 안 돼 제외 ${j.skipped}명` : ''}</p>${j.failed && j.failed.length ? `<ul class="sl-hist">${j.failed.map((f) => `<li><span>${esc(f.name)} ${esc(tel(f.phone))}</span><span class="hint">${esc(f.error || '')}</span></li>`).join('')}</ul>` : ''}<button class="btn btn-primary" data-close>확인</button>`);
        const h = await sb.from('promo_sends').select('*').order('created_at', { ascending: false }).limit(500);
        if (!h.error) { D.sends = h.data; D.mails = D.sends.filter((x) => x.channel === 'mail'); }
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
      const h = await sb.from('promo_sends').select('*').order('created_at', { ascending: false }).limit(500);
      if (!h.error) { D.sends = h.data; D.mails = D.sends.filter((x) => x.channel === 'mail'); }
      V.sub = 'history'; mount();
    } catch (e) { oops(e.userMsg || '기록하지 못했습니다.', e); }
  };
  drawPrev();
}

/* =========================================================
 * 4-2. 우편 (주소 라벨 · e-그린우편 파일 · 발송 기록 · 전화할 곳)
 * 기록은 promo_sends 에 channel='mail' 로 저장 (recipients: [{site_id, name, address, ok, called}])
 * ========================================================= */
const CALL_AFTER_DAYS = 7;
function lastMail(siteId) {
  for (const m of D.mails) {
    const r = (m.recipients || []).find((x) => x.site_id === siteId);
    if (r) return { date: m.created_at, title: m.promo_title, called: !!r.called };
  }
  return null;
}
/** 우편 보내고 7일 지났는데 아직 전화하지 않은 곳 */
function callDue() {
  const limit = Date.now() - CALL_AFTER_DAYS * 864e5, out = [], seen = new Set();
  D.mails.forEach((m) => {
    if (new Date(m.created_at).getTime() > limit) return;
    (m.recipients || []).forEach((r, i) => {
      if (r.called || seen.has(r.site_id)) return;
      seen.add(r.site_id);
      out.push({ send: m, idx: i, r });
    });
  });
  return out;
}
const addrOf = (x) => (x.address || '').trim();
const toWhom = (x) => (kindOf(x.kind) === '아파트' ? `${x.name} 관리사무소 관리소장님 귀하` : `${x.name} 관리자님 귀하`);

function drawMail() {
  const M = V.mail;
  if (!M.date) M.date = today();
  const list = D.sites.filter((x) => {
    if (M.kind !== 'all' && kindOf(x.kind) !== M.kind) return false;
    if (M.st !== 'all' && x.status !== M.st) return false;
    const qq = M.q.replace(/\s/g, '');
    return !qq || [x.name, x.region, x.address].join(' ').replace(/\s/g, '').includes(qq);
  });
  [...M.ids].forEach((id) => { const x = byId(D.sites, id); if (!x || !addrOf(x)) M.ids.delete(id); });
  const due = callDue();
  const titles = [...new Set(['주간 자가점검표'].concat(D.promos.map((p) => p.title)).concat(D.mails.map((m) => m.promo_title).filter(Boolean)))];
  body().innerHTML = `
    <p class="hint">우편(DM)은 문자와 달리 미리 동의를 받지 않아도 보낼 수 있습니다. 보낼 곳을 고르고 → 주소 라벨을 인쇄하거나 e-그린우편 파일을 받고 → <b>우편 보낸 것으로 기록</b>을 누르면, ${CALL_AFTER_DAYS}일 뒤 "전화할 곳"에 나타납니다.</p>
    ${due.length ? `<div class="sl-step"><b>📞 전화할 곳 <span class="badge">${due.length}</span> <span class="hint" style="font-weight:400">우편 보내고 ${CALL_AFTER_DAYS}일이 지났습니다. "자료 받아 보셨나요?" 전화해 보세요</span></b>
      <ul class="sl-hist">${due.map((d, k) => { const x = byId(D.sites, d.r.site_id); const ms = x ? siteManagers(x.id) : []; const ph = ms.find((m) => isMobile(m.mobile)); const call = ph ? ph.mobile : x && x.office_tel; return `<li><span><b>${esc(x ? x.name : d.r.name)}</b> <span class="hint">${dot(d.send.created_at)} · ${esc(d.send.promo_title || '')}${ms.length ? ' · ' + esc(ms.map((m) => m.name + ' ' + (m.title || '')).join(', ')) : ''}</span></span><span style="display:flex;gap:6px">${call ? `<a class="btn btn-primary btn-sm" href="tel:${digits(call)}">☎ ${esc(tel(call))}</a>` : ''}<button class="btn btn-line btn-sm" type="button" data-called="${k}">전화 완료</button></span></li>`; }).join('')}</ul></div>` : ''}
    <div class="sl-step"><b><span class="sl-no">1</span>보낼 곳 고르기</b>
      <div class="add-row" style="margin:4px 0;align-items:center">
        ${kindSelect('ml-kind', M.kind)}${stSelect('ml-st', M.st)}
        <input id="ml-q" placeholder="이름 · 지역 · 주소 찾기" value="${esc(M.q)}" style="max-width:200px">
        <button class="btn btn-line btn-sm" type="button" id="ml-all">보이는 곳 모두 선택</button><button class="btn btn-line btn-sm" type="button" id="ml-none">모두 해제</button>
      </div>
      <div class="sl-pick">${list.length ? list.map((x) => { const lm = lastMail(x.id), ad = addrOf(x); return `<label class="sl-chk"${ad ? '' : ' style="opacity:.6"'}><input type="checkbox" data-mpick="${x.id}"${M.ids.has(x.id) ? ' checked' : ''}${ad ? '' : ' disabled'}> <span><b>${esc(x.name)}</b> <span class="status sl-kind">${kindOf(x.kind)}</span> <span class="hint">${ad ? esc(ad) : '주소 없음 — 단지·건물에서 주소를 넣어 주세요'}</span><br>${promoTag(lastPromoSite(x), true)}</span></label>`; }).join('') : '<p class="empty">해당하는 곳이 없습니다. 단지·건물에서 먼저 등록해 주세요.</p>'}</div>
      <p style="margin:6px 0 0"><b id="ml-n">${M.ids.size}</b>곳 선택</p>
    </div>
    <div class="sl-step"><b><span class="sl-no">2</span>주소 라벨 · 우편 파일</b>
      <div class="btns"><button class="btn btn-line" type="button" id="ml-label">🖨 주소 라벨 인쇄 (A4 16칸)</button><button class="btn btn-line" type="button" id="ml-csv">⬇ e-그린우편용 주소 파일</button></div>
      <p class="hint" style="margin:6px 0 0">라벨은 A4 16칸(2줄 × 8칸) 라벨지에 맞춰 인쇄됩니다. 주소 파일은 엑셀에서 열리며, 우체국 e-그린우편에 받는 사람 목록으로 올릴 수 있습니다. (우편번호 칸은 비어 있으니 필요하면 채워 주세요)</p>
    </div>
    <div class="sl-step"><b><span class="sl-no">3</span>우편 보낸 것으로 기록</b>
      <div class="row2"><label class="f">보낸 홍보물<input id="ml-title" list="ml-titles" value="${esc(M.title)}" placeholder="예) 주간 자가점검표 + 작업 사례 전단"><datalist id="ml-titles">${titles.map((t) => `<option value="${esc(t)}">`).join('')}</datalist></label>
      <label class="f">보낸 날<input id="ml-date" type="date" value="${esc(M.date)}"></label></div>
      <div class="btns" style="margin-top:8px"><button class="btn btn-cta" type="button" id="ml-save">📮 우편 보낸 것으로 기록</button></div>
    </div>`;
  const $$ = (x) => root.querySelector(x);
  $$('#ml-kind').onchange = (e) => { M.kind = e.target.value; drawMail(); };
  $$('#ml-st').onchange = (e) => { M.st = e.target.value; drawMail(); };
  $$('#ml-q').onchange = (e) => { M.q = e.target.value; drawMail(); };
  $$('#ml-all').onclick = () => { list.forEach((x) => { if (addrOf(x)) M.ids.add(x.id); }); drawMail(); };
  $$('#ml-none').onclick = () => { M.ids.clear(); drawMail(); };
  root.querySelectorAll('[data-mpick]').forEach((c) => { c.onchange = () => { if (c.checked) M.ids.add(c.dataset.mpick); else M.ids.delete(c.dataset.mpick); $$('#ml-n').textContent = M.ids.size; }; });
  $$('#ml-title').oninput = (e) => { M.title = e.target.value; };
  $$('#ml-date').onchange = (e) => { M.date = e.target.value; };
  const chosen = () => D.sites.filter((x) => M.ids.has(x.id));
  const need = () => { if (!M.ids.size) { modal('<h3>보낼 곳을 먼저 골라 주세요</h3><button class="btn btn-primary" data-close>확인</button>'); return false; } return true; };
  $$('#ml-label').onclick = () => { if (need()) printLabels(chosen()); };
  $$('#ml-csv').onclick = () => {
    if (!need()) return;
    const rows = [['받는분', '우편번호', '주소', '구분', '전화']].concat(chosen().map((x) => [toWhom(x), '', addrOf(x), kindOf(x.kind), tel(x.office_tel)]));
    const csv = '\ufeff' + rows.map((r) => r.map((v) => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `마하파킹_우편주소_${today()}.csv`; document.body.appendChild(a); a.click(); a.remove();
  };
  $$('#ml-save').onclick = () => {
    if (!need()) return;
    if (!M.title.trim()) { modal('<h3>보낸 홍보물 이름을 적어 주세요</h3><p class="hint">예) 주간 자가점검표</p><button class="btn btn-primary" data-close>확인</button>'); return; }
    const sel = chosen();
    modal(`<h3>${sel.length}곳에 우편을 보낸 것으로 기록할까요?</h3><p>${esc(M.title)} · ${dot(M.date)}</p><p class="hint">${CALL_AFTER_DAYS}일 뒤 "전화할 곳"에 나타납니다.</p><div class="btns"><button class="btn btn-cta" id="ml-yes">기록</button><button class="btn btn-line" data-close>취소</button></div>`);
    document.getElementById('ml-yes').onclick = async () => {
      try {
        const when = new Date(`${M.date}T12:00:00+09:00`).toISOString();
        const row = await q(sb.from('promo_sends').insert({ channel: 'mail', promo_title: M.title.trim(), recipients: sel.map((x) => ({ site_id: x.id, name: x.name, address: addrOf(x), ok: true, called: false })), total: sel.length, ok: sel.length, fail: 0, created_at: when }).select().single(), '기록하지 못했습니다.');
        D.sends.unshift(row); D.sends.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        D.mails = D.sends.filter((x) => x.channel === 'mail');
        M.ids.clear();
        modal(`<h3>기록했습니다 📮</h3><p>${sel.length}곳 · ${esc(row.promo_title)}</p><p class="hint">단지·건물 카드에 발송 날짜가 표시되고, "보낸 기록"에도 남습니다.</p><button class="btn btn-primary" data-close>확인</button>`);
        mount();
      } catch (e) { oops(e.userMsg || '기록하지 못했습니다.', e); }
    };
  };
  root.querySelectorAll('[data-called]').forEach((b) => {
    b.onclick = async () => {
      const d = due[+b.dataset.called];
      const rec = (d.send.recipients || []).map((r, i) => (i === d.idx || r.site_id === d.r.site_id ? { ...r, called: true, called_at: nowIso() } : r));
      try {
        await q(sb.from('promo_sends').update({ recipients: rec }).eq('id', d.send.id), '저장하지 못했습니다.');
        d.send.recipients = rec;
        // 같은 곳에 그 전에 보낸 우편도 전화 완료로
        for (const m of D.mails) {
          if (m === d.send || m.created_at > d.send.created_at) continue;   // 그 뒤에 새로 보낸 우편은 다시 전화 대상
          const old = m.recipients || [];
          if (old.some((r) => r.site_id === d.r.site_id && !r.called)) {
            const nr = old.map((r) => (r.site_id === d.r.site_id ? { ...r, called: true, called_at: nowIso() } : r));
            const u = await sb.from('promo_sends').update({ recipients: nr }).eq('id', m.id);
            if (!u.error) m.recipients = nr;
          }
        }
        mount();
      } catch (e) { oops(e.userMsg || '저장하지 못했습니다.', e); }
    };
  });
}

/** A4 16칸(2 × 8) 주소 라벨 인쇄 */
function printLabels(list) {
  const w = window.open('', '_blank');
  if (!w) { oops('팝업이 막혀 있습니다. 주소창 오른쪽에서 이 사이트의 팝업을 허용해 주세요.'); return; }
  const cell = (x) => `<div class="lb"><div class="ad">${esc(addrOf(x))}</div><div class="to">${esc(toWhom(x))}</div></div>`;
  const pages = [];
  for (let i = 0; i < list.length; i += 16) pages.push(`<div class="sheet">${list.slice(i, i + 16).map(cell).join('')}</div>`);
  w.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>마하파킹 주소 라벨</title><style>
    @page{size:A4;margin:0}
    *{box-sizing:border-box}
    body{margin:0;font-family:"Malgun Gothic","Noto Sans KR",sans-serif}
    .sheet{width:210mm;height:297mm;padding:12.9mm 4.5mm 0;display:grid;grid-template-columns:99.1mm 99.1mm;grid-template-rows:repeat(8,33.9mm);align-content:start;column-gap:2.8mm;break-after:page;overflow:hidden}
    .sheet:last-child{break-after:auto}
    .lb{padding:4mm 6mm;display:flex;flex-direction:column;justify-content:center;gap:2.5mm;overflow:hidden;break-inside:avoid}
    .ad{font-size:10.5pt;line-height:1.35}
    .to{font-size:11.5pt;font-weight:700}
    @media screen{body{background:#eee}.sheet{background:#fff;margin:10px auto;box-shadow:0 2px 10px rgba(0,0,0,.2)}.lb{outline:1px dashed #ccc}}
  </style></head><body>${pages.join('')}<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
  w.document.close();
}

/* =========================================================
 * 5. 보낸 기록
 * ========================================================= */
const CH = { sms: '단문 문자', lms: '장문 문자', mms: '사진 문자', kakao: '카카오톡', phone_app: '폰 문자앱', mail: '📮 우편' };
function drawHistory() {
  body().innerHTML = `<p class="hint">문자와 우편을 누구에게 언제 무엇을 보냈는지 남습니다. "받은 분"을 누르면 목록이 나옵니다.</p>
    <div class="tbl-wrap"><table><thead><tr><th>보낸 날</th><th>홍보물</th><th>방식</th><th class="num">성공</th><th class="num">실패</th><th></th></tr></thead><tbody>${D.sends.length ? D.sends.map((s) => `<tr><td>${dot(s.created_at)} ${String(new Date(s.created_at).toTimeString()).slice(0, 5)}</td><td>${esc(s.promo_title || '(문구만)')}${s.is_test ? ' <span class="status st-quote">테스트</span>' : ''}</td><td>${CH[s.channel] || esc(s.channel)}</td><td class="num">${s.ok}</td><td class="num">${s.fail}</td><td><button class="mini" type="button" data-hs="${s.id}">받은 분</button></td></tr>`).join('') : '<tr><td colspan="6" class="empty">아직 보낸 기록이 없습니다.</td></tr>'}</tbody></table></div>`;
  root.querySelectorAll('[data-hs]').forEach((b) => {
    b.onclick = async () => {
      const r = await sb.from('promo_sends').select('*').eq('id', b.dataset.hs).single();
      if (r.error) return oops('불러오지 못했습니다.', r.error);
      const s = r.data;
      if (s.channel === 'mail') {
        modal(`<h3>📮 ${esc(s.promo_title || '우편')} · ${dot(s.created_at)}</h3><p class="hint" style="margin:0">${(s.recipients || []).length}곳에 보냄</p><ul class="sl-hist">${(s.recipients || []).map((x) => `<li><span><b>${esc(x.name || '')}</b> <span class="hint">${esc(x.address || '')}</span></span><span class="status ${x.called ? 'st-sent' : 'st-quote'}">${x.called ? '전화 완료' : '전화 전'}</span></li>`).join('')}</ul><button class="btn btn-primary" data-close>닫기</button>`);
        return;
      }
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
    ['test_to', '테스트 받을 번호', '대표님 휴대폰 · 옆 버튼을 누르면 바로 테스트 문자가 갑니다'],
    ['optout_tel', '080 수신거부 번호', '있으면 문자 끝에 "무료수신거부 080-…"이 들어갑니다. 없으면 수신거부 페이지 주소가 들어갑니다'],
  ];
  body().innerHTML = `<form class="sl-box" id="st-form" novalidate style="max-width:640px">
      ${fields.map(([k, t, h]) => k === 'test_to'
        ? `<div class="sl-testrow"><label class="f">${t} <span class="hint">${h}</span><span class="sl-inline"><input data-set="${k}" id="st-test" inputmode="tel" value="${esc(tel(S[k]))}" placeholder="010-0000-0000"><button class="btn btn-cta btn-sm" type="button" id="st-testgo">테스트 보내기</button></span></label></div>`
        : `<label class="f">${t} <span class="hint">${h}</span><input data-set="${k}" value="${esc(k === 'company' ? S[k] || '' : tel(S[k]))}"></label>`).join('')}
      <div class="btns"><button class="btn btn-primary" type="submit">저장</button></div><p class="hint" id="st-msg2" role="status"></p>
    </form>
    <div class="sl-box" style="max-width:640px"><b>처음 한 번 해 둘 일</b>
      <ol class="hint" style="margin:6px 0 0;padding-left:18px;display:grid;gap:4px">
        <li>솔라피(solapi.com) 가입 → 발신번호 070-4866-1036 등록 (통신서비스 이용증명원 필요)</li>
        <li>솔라피 콘솔 → API Key 발급 → Vercel 환경변수에 <code>SOLAPI_API_KEY</code>, <code>SOLAPI_API_SECRET</code> 넣고 Redeploy</li>
        <li>080 무료 수신거부 번호를 신청하면 위 칸에 넣어 주세요 (광고 문자에 권장)</li>
        <li>카카오톡 발송은 카카오톡 채널 개설 · 비즈니스 인증 후 연결합니다</li>
      </ol></div>`;
  root.querySelector('#st-testgo').onclick = async () => {
    const btn = root.querySelector('#st-testgo'), to = digits(root.querySelector('#st-test').value);
    if (!isMobile(to)) { modal('<h3>휴대폰 번호(010…)를 넣어 주세요</h3><button class="btn btn-primary" data-close>확인</button>'); return; }
    btn.disabled = true; btn.textContent = '보내는 중...';
    try {
      if (to !== D.settings.test_to) { await sb.from('sales_settings').upsert({ key: 'test_to', value: to }); D.settings.test_to = to; }
      const j = await api('/api/promo-send', { test: true, test_to: to, text: '문자 발송 테스트입니다. 이 문자가 보이면 정상입니다.' });
      modal(`<h3>${j.ok ? '테스트 문자를 보냈습니다' : '보내지 못했습니다'}</h3><p>${esc(tel(to))} 로 ${j.ok ? '보냈습니다. 1분 안에 도착하는지 확인해 주세요.' : esc((j.failed[0] || {}).error || '')}</p><div class="sl-phone"><div class="sl-bubble">${esc(buildMessage('문자 발송 테스트입니다. 이 문자가 보이면 정상입니다.', null))}</div></div><button class="btn btn-primary" data-close>확인</button>`);
    } catch (err) { oops('테스트 문자를 보내지 못했습니다.', err); }
    finally { btn.disabled = false; btn.textContent = '테스트 보내기'; }
  };
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

/* ---------- 알림: 홈페이지 '소식 받기' 새 신청 + 새 담당자 확인이 필요한 곳 ---------- */
const SEEN_KEY = 'maha_sales_seen';
const seenAt = () => { try { return localStorage.getItem(SEEN_KEY) || '1970-01-01T00:00:00Z'; } catch (e) { return '1970-01-01T00:00:00Z'; } };
function setBadge(el, n) { if (!el) return; el.textContent = n || ''; el.classList.toggle('hidden', !n); }
async function refreshBadge() {
  let web = 0, need = 0;
  if (D.loaded) {
    web = D.managers.filter((m) => m.source === 'web' && m.created_at > seenAt()).length;
    need = D.sites.filter((x) => x.need_new_manager).length;
  } else {
    const [a, b] = await Promise.all([
      sb.from('managers').select('id', { count: 'exact', head: true }).eq('source', 'web').gt('created_at', seenAt()),
      sb.from('sites').select('id', { count: 'exact', head: true }).eq('need_new_manager', true),
    ]);
    if (a.error || b.error) return;   // 자료표가 없거나 로그인 전
    web = a.count || 0; need = b.count || 0;
  }
  const calls = D.loaded ? callDue().length : 0;
  setBadge(document.getElementById('sales-badge'), web + need + calls);
  setBadge(root && root.querySelector('#sl-web'), web);
  setBadge(root && root.querySelector('#sl-call'), calls);
}
function markWebSeen() {
  const newest = D.managers.filter((m) => m.source === 'web').map((m) => m.created_at).sort().pop();
  if (newest && newest > seenAt()) { try { localStorage.setItem(SEEN_KEY, newest); } catch (e) {} }
}

/* ---------- 시작: 탭을 처음 열 때 불러오기 ---------- */
const tabBtn = document.querySelector('#admin-tabs [data-tab="sales"]');
if (tabBtn) tabBtn.addEventListener('click', () => { if (!D.loaded) load(); });
// 로그인 후 관리자 화면이 보이면 알림 개수 확인, 이후 5분마다
const startBadge = () => { const v = document.getElementById('view-admin'); if (v && !v.classList.contains('hidden')) { refreshBadge(); return true; } return false; };
if (!startBadge()) { const t = setInterval(() => { if (startBadge()) clearInterval(t); }, 1000); }
setInterval(() => { if (!document.hidden) { if (D.loaded) { Promise.all([sb.from('managers').select('*').order('created_at', { ascending: false }), sb.from('sites').select('*').order('name')]).then(([m, x]) => { if (!m.error) D.managers = m.data; if (!x.error) D.sites = x.data; refreshBadge(); }); } else refreshBadge(); } }, 5 * 60 * 1000);


/* ---------- 🏢 아파트 명단 (공공데이터: 국토교통부 공동주택 단지 목록·기본 정보) ---------- */
const KAPT_SIDO = [['11', '서울'], ['41', '경기'], ['28', '인천'], ['26', '부산'], ['27', '대구'], ['29', '광주'], ['30', '대전'], ['31', '울산'], ['36', '세종'], ['51', '강원'], ['43', '충북'], ['44', '충남'], ['52', '전북'], ['46', '전남'], ['47', '경북'], ['48', '경남'], ['50', '제주']];
const KAPT_KEY = 'maha_kapt_v1';
/* 공공데이터 항목 이름 → 한글 (기본 정보 + 상세 정보). 목록에 없는 항목은 원래 이름 그대로 엑셀에 넣습니다. */
const KAPT_LABELS = {
  kaptCode: '단지코드', kaptName: '단지명', codeAptNm: '단지 분류', kaptAddr: '법정동 주소', doroJuso: '도로명 주소', zipcode: '우편번호', bjdCode: '법정동코드',
  kaptTel: '관리사무소 전화', kaptFax: '관리사무소 팩스', kaptUrl: '홈페이지',
  codeSaleNm: '분양 형태', codeHeatNm: '난방 방식', codeHallNm: '복도 유형', codeMgrNm: '관리 방식', kaptUsedate: '사용승인일',
  kaptTarea: '연면적(㎡)', kaptMarea: '관리비 부과면적(㎡)', privArea: '주거전용면적(㎡)', kaptDongCnt: '동 수', kaptdaCnt: '세대 수', hoCnt: '호 수',
  kaptMparea60: '전용 60㎡ 이하 세대', kaptMparea85: '전용 60~85㎡ 세대', kaptMparea135: '전용 85~135㎡ 세대', kaptMparea136: '전용 135㎡ 초과 세대',
  kaptMparea_60: '전용 60㎡ 이하 세대', kaptMparea_85: '전용 60~85㎡ 세대', kaptMparea_135: '전용 85~135㎡ 세대', kaptMparea_136: '전용 135㎡ 초과 세대',
  kaptBcompany: '시공사', kaptAcompany: '시행사', kaptTopFloor: '최고 층수', ktownFlrNo: '지상 층수', kaptBaseFloor: '지하 층수', kaptdEcntp: '승강기(승객용)',
  codeMgr: '일반관리 방식', kaptMgrCnt: '일반관리 인원', kaptCcompany: '일반관리 계약업체(위탁관리회사)',
  codeSec: '경비관리 방식', kaptdScnt: '경비 인원', kaptdSecCom: '경비 계약업체',
  codeClean: '청소관리 방식', kaptdClcnt: '청소 인원', codeGarbage: '음식물 처리 방법',
  codeDisinf: '소독관리 방식', kaptdDcnt: '연간 소독 횟수', disposalType: '소독 방법',
  codeStr: '건물 구조', kaptdEcapa: '수전 용량', codeEcon: '세대 전기 계약 방식', codeEmgr: '전기안전관리자 선임', codeFalarm: '화재수신반 방식', codeWsupply: '급수 방식',
  codeElev: '승강기 관리 형태', kaptdEcnt: '승강기 대수',
  kaptdPcnt: '주차대수(지상)', kaptdPcntu: '주차대수(지하)', codeNet: '주차관제·홈네트워크', kaptdCccnt: 'CCTV 대수',
  groundElChargerCnt: '전기차 충전기(지상)', undergroundElChargerCnt: '전기차 충전기(지하)',
  welfareFacility: '부대·복리시설', convenientFacility: '편의시설', educationFacility: '교육시설',
  kaptdWtimebus: '버스정류장 거리', subwayLine: '지하철 호선', subwayStation: '지하철역', kaptdWtimesub: '지하철역 거리',
  useYn: '사용 여부', _detailError: '상세 정보 오류',
};
const kLabel = (k) => KAPT_LABELS[k] || k;

const K = { run: false, stop: false, msg: '', sidoF: 'all', q: '', db: null };
/* 전국 2만 곳은 localStorage(5MB)에 다 안 들어가서 IndexedDB에 저장합니다. */
const kIdb = () => new Promise((ok, no) => { const r = indexedDB.open('maha_kapt', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
async function kIdbGet(k) { const d = await kIdb(); return new Promise((ok) => { const t = d.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => ok(t.result); t.onerror = () => ok(null); }); }
async function kIdbSet(k, v) { const d = await kIdb(); return new Promise((ok, no) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => ok(); t.onerror = () => no(t.error); }); }
async function kaptLoad() {
  if (K.db) return K.db;
  try { K.db = await kIdbGet(KAPT_KEY); } catch (e) { K.db = null; }
  if (!K.db) { try { K.db = JSON.parse(localStorage.getItem(KAPT_KEY)); if (K.db) K.db.sidos = KAPT_SIDO.map((x) => x[0]); localStorage.removeItem(KAPT_KEY); } catch (e) { K.db = null; } }
  if (!K.db) K.db = { sidos: KAPT_SIDO.map((x) => x[0]), listed: {}, list: {}, info: {} };
  // 예전에 0곳으로 끝난 시·도는 '받음' 표시를 지워 다시 받게 하기
  const has = {}; Object.values(K.db.list || {}).forEach((a) => { has[a.sc] = 1; });
  Object.keys(K.db.listed || {}).forEach((sc) => { if (!has[sc]) delete K.db.listed[sc]; });
  return K.db;
}
async function kaptSave() {
  try { await kIdbSet(KAPT_KEY, K.db); return true; } catch (e) { K.msg = '이 브라우저에 저장하지 못했습니다. 지금까지 받은 것은 엑셀로 먼저 저장해 두세요.'; return false; }
}
const kaptRows = () => {
  const db = K.db;
  return Object.values(db.list).filter((a) => db.sidos.includes(a.sc)).map((a) => Object.assign({}, a, db.info[a.code] || {}, { name: (db.info[a.code] && db.info[a.code].name) || a.name }));
};
function kaptCount() {
  const db = K.db;
  const all = Object.values(db.list).filter((a) => db.sidos.includes(a.sc));
  const done = all.filter((a) => db.info[a.code] && db.info[a.code].raw).length;
  const listedAll = db.sidos.every((c) => db.listed[c]);
  return { all: all.length, done, listedAll, left: all.length - done };
}

async function kaptRun() {
  const db = await kaptLoad(); K.trace = null;
  K.run = true; K.stop = false; K.msg = '단지 목록을 받는 중…'; drawKapt();
  try {
    for (const sc of db.sidos) {
      if (K.stop) break;
      if (db.listed[sc]) continue;
      let page = 1, got = 0, total = 1;
      while (got < total && !K.stop) {
        const r = await api('/api/kapt', { action: 'list', sido: sc, page });
        r.list.forEach((x) => { db.list[x.code] = Object.assign(x, { sc }); });
        if (!r.list.length && page === 1 && r.trace) K.trace = r.trace;
        got += r.list.length; total = r.total || got;
        K.msg = `${KAPT_SIDO.find((x) => x[0] === sc)[1]} 단지 목록 ${got.toLocaleString()} / ${total.toLocaleString()}`; kaptPaint();
        if (!r.list.length) break;
        page++;
      }
      if (!K.stop && got > 0) db.listed[sc] = true;   // 0곳이면 다음에 다시 받아 보기
      kaptSave();
    }
    const todo = Object.values(db.list).filter((a) => db.sidos.includes(a.sc) && !(db.info[a.code] && db.info[a.code].raw)).map((a) => a.code);
    const CH = 16;
    const chunks = [];
    for (let i = 0; i < todo.length; i += CH) chunks.push(todo.slice(i, i + CH));
    let n = 0; K.infoErr = '';
    const worker = async () => {
      while (chunks.length && !K.stop) {
        const c = chunks.shift();
        const r = await api('/api/kapt', { action: 'info', codes: c });
        r.info.forEach((x) => { if (x.ok) db.info[x.code] = x; else if (!K.infoErr) K.infoErr = x.error; });
        n += c.length;
        if (n % 480 < CH) kaptSave();
        const ct = kaptCount();
        K.msg = `관리사무소 연락처 받는 중… ${ct.done.toLocaleString()} / ${ct.all.toLocaleString()}곳`; kaptPaint();
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    kaptSave();
    const ct = kaptCount();
    if (!ct.all && K.trace) { K.msg = '공공데이터에서 단지 목록이 0곳으로 왔습니다. 아래 응답 내용을 클로드에게 보여 주세요.\n' + K.trace.join('\n'); K.run = false; drawKapt(); return; }
    K.msg = K.stop ? `멈췄습니다. ${ct.done.toLocaleString()} / ${ct.all.toLocaleString()}곳까지 받았습니다.` : ct.left ? `${ct.left.toLocaleString()}곳은 연락처 정보를 받지 못했습니다. "이어서 불러오기"를 다시 눌러 보세요.${K.infoErr ? `\n이유: ${K.infoErr}` : ''}` : `다 받았습니다. 모두 ${ct.all.toLocaleString()}곳입니다.`;
  } catch (e) {
    kaptSave();
    K.msg = e.message;
  }
  K.run = false; drawKapt();
}

function kaptPaint() {
  const ct = kaptCount();
  const m = root.querySelector('#kp-msg'); if (m) m.textContent = K.msg;
  const b = root.querySelector('#kp-bar'); if (b) b.style.width = (ct.all ? Math.round((ct.done / ct.all) * 100) : 0) + '%';
}

function kaptFiltered() {
  const qq = K.q.replace(/\s/g, '');
  return kaptRows().filter((x) => (K.sidoF === 'all' || x.sc === K.sidoF) && (!qq || [x.name, x.sido, x.sigungu, x.dong, x.doro, x.addr].join(' ').replace(/\s/g, '').includes(qq)))
    .sort((a, b) => (a.sc + a.sigungu + a.name).localeCompare(b.sc + b.sigungu + b.name, 'ko'));
}

async function kaptExcel(list) {
  if (!window.XLSX) {
    await new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'; sc.onload = ok; sc.onerror = () => no(new Error('엑셀 도구를 불러오지 못했습니다.')); document.head.appendChild(sc); });
  }
  const head = ['시·도', '시·군·구', '읍·면·동', '단지명', '관리사무소 전화', '관리사무소 팩스', '우편번호', '도로명 주소', '지번 주소', '세대수', '동수', '주차대수(합)', '관리 방식', '사용승인일', '단지코드'];
  const shown = new Set(['kaptCode', 'kaptName', 'kaptTel', 'kaptFax', 'zipcode', 'doroJuso', 'kaptAddr', 'kaptdaCnt', 'kaptDongCnt', 'codeMgrNm', 'kaptUsedate']);
  const extra = [];
  list.forEach((x) => Object.keys(x.raw || {}).forEach((k) => { if (!shown.has(k) && !extra.includes(k)) extra.push(k); }));
  extra.sort((a, b) => (Object.keys(KAPT_LABELS).indexOf(a) + 1 || 999) - (Object.keys(KAPT_LABELS).indexOf(b) + 1 || 999));
  const ud = (v) => (v ? String(v).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3') : '');
  const rows = list.map((x) => [x.sido || '', x.sigungu || '', x.dong || '', x.name || '', tel(x.tel), tel(x.fax), x.zip || '', x.doro || '', x.addr || '', x.households || '', x.dongs || '', x.parking || '', x.mgr || '', ud(x.usedate), x.code]
    .concat(extra.map((k) => { const v = (x.raw || {})[k]; return v === undefined ? '' : /^\d+(\.\d+)?$/.test(v) && !/Code|zip|Tel|Fax/i.test(k) ? Number(v) : v; })));
  head.push(...extra.map(kLabel));
  const ws = XLSX.utils.aoa_to_sheet([head].concat(rows));
  ws['!cols'] = [6, 10, 10, 26, 15, 15, 8, 40, 40, 7, 6, 9, 10, 11, 11].concat(extra.map(() => 14)).map((w) => ({ wch: w }));
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: head.length - 1 } }) };
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  const note = XLSX.utils.aoa_to_sheet([
    ['마하파킹 — 아파트 관리사무소 연락처'],
    [`받은 날: ${today()}  ·  ${rows.length.toLocaleString()}곳`],
    ['출처: 국토교통부 공동주택 단지 목록·기본 정보 (공공데이터포털, K-apt 등록 단지)'],
    ['※ 전화·방문·우편(DM) 영업용입니다. 광고 문자·팩스는 받는 분이 미리 동의한 경우에만 보낼 수 있습니다 (정보통신망법 제50조).'],
  ]);
  note['!cols'] = [{ wch: 100 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '관리사무소 연락처');
  XLSX.utils.book_append_sheet(wb, note, '안내');
  const names = [...new Set(list.map((x) => x.sido).filter(Boolean))].join('_') || '아파트';
  XLSX.writeFile(wb, `마하파킹_아파트관리사무소_${names}_${today()}.xlsx`);
}

async function kaptImport(list) {
  const fresh = list.filter((x) => !siteByName(x.name));
  if (!fresh.length) { K.msg = '모두 이미 고객사 리스트에 있습니다.'; kaptPaint(); return; }
  if (!confirm(`${fresh.length.toLocaleString()}곳을 고객사 리스트(단지·건물)에 "영업 대상"으로 넣을까요?\n(이미 같은 이름이 있는 ${(list.length - fresh.length).toLocaleString()}곳은 건너뜁니다)`)) return;
  const rows = fresh.map((x) => ({ name: x.name, kind: '아파트', region: [x.sido, x.sigungu].filter(Boolean).join(' ').replace(/특별자치시|특별자치도|특별시|광역시/g, '').replace(/^(경기|충청북|충청남|전라북|전라남|경상북|경상남|강원)도 /, '$1 ').trim() || null, address: x.doro || x.addr || null, office_tel: digits(x.tel) || null, office_fax: digits(x.fax) || null, households: x.households || null, status: 'lead', memo: `공공데이터 단지코드 ${x.code}`, updated_at: nowIso() }));
  let done = 0;
  try {
    for (let i = 0; i < rows.length; i += 200) {
      const got = await q(sb.from('sites').insert(rows.slice(i, i + 200)).select(), '고객사 리스트에 넣지 못했습니다.');
      D.sites.push(...got); done += got.length;
      K.msg = `고객사 리스트에 넣는 중… ${done.toLocaleString()} / ${rows.length.toLocaleString()}`; kaptPaint();
    }
    D.sites.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    K.msg = `${done.toLocaleString()}곳을 고객사 리스트에 넣었습니다. (단지·건물 → 상태 "영업 대상")`;
  } catch (e) { K.msg = `${done.toLocaleString()}곳까지 넣고 멈췄습니다: ${e.message}`; }
  drawKapt();
}

/* ---------- 🔎 건물 하나씩 찾기 (아파트·빌라·상가·오피스텔·학교·주차장 등) ----------
 * 카카오 장소 검색(api/place.js) + 아파트면 공공데이터(K-apt) 관리사무소 정보 한 곳만 받아 오기 */
const FD = { q: '', list: [], page: 1, end: true, msg: '', busy: false, kapt: {} };
const placeKind = (cat, name) => {
  const t = `${cat} ${name}`;
  if (/아파트/.test(t)) return '아파트';
  if (/오피스텔/.test(t)) return '오피스텔';
  if (/빌라|연립|다세대|주택/.test(t)) return '빌라';
  if (/주차장/.test(t)) return '공영주차장';
  if (/상가|빌딩|타워|센터|건물|오피스|병원|마트|백화점|호텔/.test(t)) return '상가';
  return '기타';
};
const placeRegion = (addr) => String(addr || '').split(' ').slice(0, 2).join(' ').replace(/특별자치시|특별자치도|특별시|광역시/g, '').replace(/^(경기|충청북|충청남|전라북|전라남|경상북|경상남|강원)도 /, '$1 ').trim();
async function findSearch(more) {
  const qq = FD.q.trim(); if (qq.length < 2) { FD.msg = '찾을 이름을 두 글자 이상 적어 주세요. 예) 안양 OO빌딩, 평촌 OO아파트'; drawFind(); return; }
  FD.busy = true; FD.msg = '찾는 중…'; if (!more) { FD.list = []; FD.page = 1; } drawFind();
  try {
    const r = await api('/api/place', { q: qq, page: FD.page });
    FD.list = FD.list.concat(r.list); FD.end = r.end; FD.page = r.page + 1;
    FD.msg = FD.list.length ? `${FD.list.length}곳 찾았습니다${r.end ? '' : ' (더 있음)'}.` : '찾은 곳이 없습니다. 지역 이름을 함께 적어 보세요. 예) 수원 OO빌딩';
  } catch (e) { FD.msg = e.message; }
  FD.busy = false; drawFind();
}
/* 아파트면 공공데이터에서 관리사무소 전화·팩스·세대수 받아 오기 (그 시·도 단지 목록에서 이름으로 찾음) */
async function findKapt(p) {
  const db = await kaptLoad();
  const FULL = { 충북: '충청북', 충남: '충청남', 전북: '전라북', 전남: '전라남', 경북: '경상북', 경남: '경상남' };
  const sido = KAPT_SIDO.find(([, n]) => p.jibun.startsWith(n) || p.address.startsWith(n) || (FULL[n] && (p.address.startsWith(FULL[n]) || p.jibun.startsWith(FULL[n]))));
  const key = p.id; FD.kapt[key] = { busy: true }; drawFind();
  try {
    if (!sido) throw new Error('주소에서 시·도를 알아보지 못했습니다.');
    const sc = sido[0];
    if (!Object.values(db.list).some((a) => a.sc === sc)) {   // 그 시·도 단지 목록을 아직 안 받았으면 목록만 받기
      let page = 1, got = 0, total = 1;
      while (got < total) { const r = await api('/api/kapt', { action: 'list', sido: sc, page }); r.list.forEach((x) => { db.list[x.code] = Object.assign(x, { sc }); }); got += r.list.length; total = r.total || got; if (!r.list.length) break; page++; }
      if (got) db.listed[sc] = true; kaptSave();
    }
    const nm = (s) => String(s || '').replace(/\s|아파트|\(.*?\)/g, '');
    const cands = Object.values(db.list).filter((a) => a.sc === sc && (nm(a.name) === nm(p.name) || nm(p.name).includes(nm(a.name)) || nm(a.name).includes(nm(p.name))));
    const pick = cands.find((a) => p.address.includes(a.sigungu || '@@')) || cands[0];
    if (!pick) throw new Error('공공데이터(K-apt)에 등록된 아파트를 찾지 못했습니다.');
    if (!db.info[pick.code]) { const r = await api('/api/kapt', { action: 'info', codes: [pick.code] }); r.info.forEach((x) => { if (x.ok) db.info[x.code] = x; else throw new Error(x.error || '정보를 받지 못했습니다.'); }); kaptSave(); }
    FD.kapt[key] = { info: Object.assign({}, pick, db.info[pick.code] || {}) };
  } catch (e) { FD.kapt[key] = { error: e.message }; }
  drawFind();
}
async function findAdd(p) {
  const k = FD.kapt[p.id] && FD.kapt[p.id].info;
  const row = { name: (k && k.name) || p.name, kind: placeKind(p.category, p.name), region: placeRegion(p.address) || null, address: (k && (k.doro || k.addr)) || p.address || null,
    office_tel: digits((k && k.tel) || p.phone) || null, office_fax: digits(k && k.fax) || null, households: (k && k.households) || null, status: 'lead',
    memo: [p.category && `분류: ${p.category}`, k && k.code && `공공데이터 단지코드 ${k.code}`, p.url && `카카오맵 ${p.url}`].filter(Boolean).join(' · '), updated_at: nowIso() };
  try { const got = await q(sb.from('sites').insert(row).select(), '고객사 리스트에 넣지 못했습니다.'); D.sites.push(...got); D.sites.sort((a, b) => a.name.localeCompare(b.name, 'ko')); FD.msg = `"${row.name}"을(를) 고객사 리스트(단지·건물)에 넣었습니다.`; }
  catch (e) { FD.msg = e.message; }
  drawFind();
}
function drawFind() {
  body().innerHTML = `
    <p class="hint">아파트뿐 아니라 <b>빌라·상가·오피스텔·병원·학교·공영주차장 등 모든 건물</b>을 이름으로 하나씩 찾습니다. 아파트는 공공데이터에서 <b>관리사무소 전화·팩스·세대수</b>도 받아 올 수 있습니다.</p>
    <form class="add-row" id="fd-form" style="margin:6px 0;align-items:center">
      <input id="fd-q" placeholder="예) 안양 OO빌딩 · 평촌 OO아파트 · 수원시청 주차장" value="${esc(FD.q)}" style="flex:1;min-width:220px" autocomplete="off">
      <button class="btn btn-primary" type="submit"${FD.busy ? ' disabled' : ''}>🔎 찾기</button>
    </form>
    <p id="fd-msg" role="status" style="margin:6px 0;font-weight:700">${esc(FD.msg)}</p>
    ${FD.list.length ? `<div class="fd-list">${FD.list.map((p) => {
      const k = FD.kapt[p.id] || {}, kin = k.info, apt = placeKind(p.category, p.name) === '아파트', reg = siteByName((kin && kin.name) || p.name);
      return `<div class="fd-item">
        <div class="fd-h"><b>${esc(p.name)}</b> <span class="hint">${esc(p.category.split(' > ').slice(-2).join(' · '))}</span>${reg ? ' <span class="status st-sent">등록됨</span>' : ''}</div>
        <div class="hint">${esc(p.address)}${p.jibun && p.jibun !== p.address ? ` (${esc(p.jibun)})` : ''}</div>
        <div>${p.phone ? `☎ <a href="tel:${digits(p.phone)}">${esc(p.phone)}</a>` : '<span class="hint">전화번호 없음</span>'}${p.url ? ` · <a href="${esc(p.url)}" target="_blank" rel="noopener">지도 보기</a>` : ''}</div>
        ${kin ? `<div class="fd-kapt">🏢 관리사무소 ☎ ${kin.tel ? `<a href="tel:${digits(kin.tel)}"><b>${esc(tel(kin.tel))}</b></a>` : '-'} · 팩스 ${esc(tel(kin.fax)) || '-'} · ${kin.households ? kin.households + '세대' : ''}${kin.mgr ? ' · ' + esc(kin.mgr) : ''}</div>` : ''}
        ${k.error ? `<div class="hint" style="color:var(--stop)">${esc(k.error)}</div>` : ''}
        <div class="btns" style="margin-top:6px">
          ${apt && !kin ? `<button class="btn btn-line btn-sm" type="button" data-fkapt="${esc(p.id)}"${k.busy ? ' disabled' : ''}>${k.busy ? '받는 중…' : '🏢 관리사무소 정보 받기'}</button>` : ''}
          <button class="btn btn-primary btn-sm" type="button" data-fadd="${esc(p.id)}"${reg ? ' disabled' : ''}>＋ 고객사 리스트에 넣기</button>
        </div></div>`;
    }).join('')}</div>${FD.end ? '' : `<div class="btns"><button class="btn btn-line" type="button" id="fd-more"${FD.busy ? ' disabled' : ''}>더 보기</button></div>`}` : ''}
    <p class="hint" style="margin-top:12px">⚠ 찾은 전화번호는 전화·방문·우편 영업용입니다. 광고 문자·팩스는 받는 분이 미리 동의한 경우에만 보낼 수 있습니다.</p>`;
  const f = root.querySelector('#fd-form');
  f.onsubmit = (e) => { e.preventDefault(); FD.q = root.querySelector('#fd-q').value; findSearch(false); };
  const more = root.querySelector('#fd-more'); if (more) more.onclick = () => findSearch(true);
  root.querySelectorAll('[data-fkapt]').forEach((b) => { b.onclick = () => findKapt(FD.list.find((p) => p.id === b.dataset.fkapt)); });
  root.querySelectorAll('[data-fadd]').forEach((b) => { b.onclick = () => { b.disabled = true; findAdd(FD.list.find((p) => p.id === b.dataset.fadd)); }; });
}

async function drawKapt() {
  if (!K.db) { body().innerHTML = '<p class="hint">불러오는 중…</p>'; await kaptLoad(); if (V.sub !== 'kapt') return; }
  const db = K.db;
  const ct = kaptCount();
  const started = Object.keys(db.list).length > 0;
  const list = kaptFiltered();
  const show = list.slice(0, 300);
  const pct = ct.all ? Math.round((ct.done / ct.all) * 100) : 0;
  const ready = ct.listedAll && !ct.left && ct.all;
  body().innerHTML = `
    <p class="hint">국토교통부 공공데이터(K-apt에 등록된 아파트)에서 <b>관리사무소 전화·팩스·주소·세대수</b>를 한꺼번에 받아 엑셀로 저장합니다. 빌라·작은 건물은 들어 있지 않습니다.</p>
    <div class="sl-step"><b><span class="sl-no">1</span>지역 고르기</b>
      <div class="btns" style="margin:2px 0 6px"><button class="btn btn-line btn-sm" type="button" id="kp-sall"${K.run ? ' disabled' : ''}>전국 모두</button><button class="btn btn-line btn-sm" type="button" id="kp-snone"${K.run ? ' disabled' : ''}>모두 해제</button></div>
      <div class="add-row" style="margin:4px 0;flex-wrap:wrap">${KAPT_SIDO.map(([c, n]) => `<label class="sl-chk"><input type="checkbox" data-ksido="${c}"${db.sidos.includes(c) ? ' checked' : ''}${K.run ? ' disabled' : ''}> ${n}${db.listed[c] ? ' <span class="hint">✓</span>' : ''}</label>`).join('')}</div>
    </div>
    <div class="sl-step"><b><span class="sl-no">2</span>불러오기</b>
      <div class="btns">
        ${K.run ? '<button class="btn btn-line" type="button" id="kp-stop">⏸ 멈추기</button>' : `<button class="btn btn-cta" type="button" id="kp-go">${started && !ready ? '▶ 이어서 불러오기' : ready ? '↻ 새로 받은 지역 불러오기' : '▶ 불러오기'}</button>`}
        ${!K.run && started ? '<button class="btn btn-line btn-sm" type="button" id="kp-reset">처음부터 다시</button>' : ''}
        ${K.run ? '' : '<button class="btn btn-line btn-sm" type="button" id="kp-check">🔎 연결 점검</button>'}
      </div>
      <div style="height:10px;background:var(--line);border-radius:6px;overflow:hidden;margin:10px 0 4px"><div id="kp-bar" style="height:100%;width:${pct}%;background:var(--brand);transition:width .3s"></div></div>
      <p id="kp-msg" role="status" style="margin:0;font-weight:700;white-space:pre-wrap;word-break:break-all">${esc(K.msg || (started ? `${ct.done.toLocaleString()} / ${ct.all.toLocaleString()}곳 받음` : '아직 받은 것이 없습니다.'))}</p>
      <p class="hint" style="margin:4px 0 0">전국은 약 2만 곳이라 30분 넘게 걸리고, 공공데이터 하루 사용량(서비스당 약 1만 번)을 넘으면 멈춥니다. 그러면 다음 날 <b>이어서 불러오기</b>를 누르세요. 남은 곳부터 받습니다 (전국은 보통 2~3일). 받는 동안 이 화면을 켜 두세요.</p>
    </div>
    <div class="sl-step"><b><span class="sl-no">3</span>엑셀로 저장 · 고객사 리스트에 넣기</b>
      <div class="add-row" style="margin:4px 0;align-items:center">
        <select id="kp-sf" style="width:auto"><option value="all">전체 지역</option>${KAPT_SIDO.filter(([c]) => db.sidos.includes(c)).map(([c, n]) => `<option value="${c}"${K.sidoF === c ? ' selected' : ''}>${n}</option>`).join('')}</select>
        <input id="kp-q" placeholder="시·군·구, 동, 단지명 찾기 (예: 수지구)" value="${esc(K.q)}" style="max-width:240px">
        <span><b>${list.length.toLocaleString()}</b>곳</span>
      </div>
      <div class="btns"><button class="btn btn-primary" type="button" id="kp-xlsx"${list.length ? '' : ' disabled'}>⬇ 엑셀 파일로 저장</button><button class="btn btn-line" type="button" id="kp-imp"${list.length && !K.run ? '' : ' disabled'}>＋ 보이는 곳을 고객사 리스트에 넣기</button></div>
      <p class="hint" style="margin:6px 0 0">지역·검색으로 좁힌 그대로 저장됩니다. 고객사 리스트에 넣으면 우편(DM) 라벨 인쇄와 전화 영업에 바로 쓸 수 있습니다.</p>
      <div class="tbl-wrap" style="margin-top:10px;max-height:420px;overflow:auto"><table><thead><tr><th>지역</th><th>단지명 · 주소 <span class="hint" style="font-weight:400">(누르면 전체 정보)</span></th><th>관리사무소 전화</th><th>팩스</th><th>세대</th><th>주차</th></tr></thead><tbody>
        ${show.length ? show.map((x) => `<tr data-kinfo="${esc(x.code)}" style="cursor:pointer"><td>${esc([x.sigungu, x.dong].filter(Boolean).join(' '))}</td><td><b>${esc(x.name)}</b>${siteByName(x.name) ? ' <span class="status st-sent">등록됨</span>' : ''}${x.doro || x.addr ? `<br><span class="hint">${x.zip ? '(' + esc(x.zip) + ') ' : ''}${esc(x.doro || x.addr)}</span>` : ''}</td><td style="white-space:nowrap">${x.tel ? `<a href="tel:${digits(x.tel)}">${esc(tel(x.tel))}</a>` : '<span class="hint">-</span>'}</td><td style="white-space:nowrap">${esc(tel(x.fax)) || '<span class="hint">-</span>'}</td><td>${x.households || ''}</td><td>${x.parking || ''}</td></tr>`).join('') : '<tr><td colspan="6" class="empty">받은 단지가 없습니다.</td></tr>'}
      </tbody></table></div>
      ${list.length > show.length ? `<p class="hint">화면에는 앞의 300곳만 보입니다. 엑셀에는 ${list.length.toLocaleString()}곳이 모두 들어갑니다.</p>` : ''}
    </div>
    <p class="hint">⚠ 이 명단은 전화·방문·우편(DM) 영업용입니다. 광고 문자·팩스는 받는 분이 미리 동의한 경우에만 보낼 수 있습니다 (정보통신망법 제50조).</p>`;
  const $$ = (x) => root.querySelector(x);
  root.querySelectorAll('[data-ksido]').forEach((c) => { c.onchange = () => { const s = new Set(db.sidos); if (c.checked) s.add(c.dataset.ksido); else s.delete(c.dataset.ksido); db.sidos = KAPT_SIDO.map((x) => x[0]).filter((x) => s.has(x)); kaptSave(); K.msg = ''; drawKapt(); }; });
  const setS = (list) => { db.sidos = list; kaptSave(); K.msg = ''; drawKapt(); };
  if ($$('#kp-sall')) $$('#kp-sall').onclick = () => setS(KAPT_SIDO.map((x) => x[0]));
  if ($$('#kp-snone')) $$('#kp-snone').onclick = () => setS([]);
  if ($$('#kp-go')) $$('#kp-go').onclick = () => { if (!db.sidos.length) { K.msg = '지역을 하나 이상 골라 주세요.'; kaptPaint(); return; } kaptRun(); };
  if ($$('#kp-check')) $$('#kp-check').onclick = async () => {
    K.msg = '공공데이터 연결을 점검하는 중…'; kaptPaint();
    try {
      const r = await api('/api/kapt', { action: 'check' });
      const line = (t, x) => `${t}: ${x.ok ? `✅ 정상${x.n ? '' : ' (결과 0건)'}` : `❌ ${x.error}`}`;
      K.msg = `${line('① 단지 목록제공 서비스', r.list)}\n${line('② 기본 정보제공 서비스(전화·팩스)', r.info)}${r.detail ? '\n' + line('③ 상세 정보(주차·관리업체 등)', r.detail) : ''}${r.detail && r.detail.sample ? ` · 주차 ${(+r.detail.sample.kaptdPcnt || 0) + (+r.detail.sample.kaptdPcntu || 0)}대` : ''}`;
      const tr = [].concat(r.list.trace || [], r.info.trace || [], (r.detail && !r.detail.ok && r.detail.trace) || []);
      const sm = r.info && r.info.sample; if (sm) K.msg += `\n예) ${sm.kaptName || ''} · 전화 ${sm.kaptTel || '(없음)'} · 팩스 ${sm.kaptFax || '(없음)'}` + (sm.kaptTel ? '' : `\n받은 항목: ${Object.keys(sm).join(', ')}`);
      if (!(r.list.ok && r.info.ok && (!r.detail || r.detail.ok)) && tr.length) K.msg += '\n\n— 응답 내용 (클로드에게 보여 주세요) —\n' + tr.join('\n');
    } catch (e) { K.msg = e.message; }
    drawKapt();
  };
  if ($$('#kp-stop')) $$('#kp-stop').onclick = () => { K.stop = true; K.msg = '멈추는 중…'; kaptPaint(); };
  if ($$('#kp-reset')) $$('#kp-reset').onclick = () => { if (!confirm('지금까지 받은 아파트 명단을 지우고 처음부터 다시 받을까요?')) return; K.db = { sidos: db.sidos, listed: {}, list: {}, info: {} }; kaptSave(); K.msg = ''; drawKapt(); };
  $$('#kp-sf').onchange = (e) => { K.sidoF = e.target.value; drawKapt(); };
  $$('#kp-q').onchange = (e) => { K.q = e.target.value; drawKapt(); };
  $$('#kp-xlsx').onclick = async () => { $$('#kp-xlsx').disabled = true; try { await kaptExcel(list); } catch (e) { K.msg = e.message; kaptPaint(); } $$('#kp-xlsx').disabled = false; };
  $$('#kp-imp').onclick = () => kaptImport(list);
  root.querySelectorAll('[data-kinfo]').forEach((tr) => { tr.onclick = (e) => {
    if (e.target.closest('a')) return;
    const x = list.find((y) => y.code === tr.dataset.kinfo); if (!x) return;
    const raw = x.raw || {};
    const keys = Object.keys(raw).sort((a, b) => (Object.keys(KAPT_LABELS).indexOf(a) + 1 || 999) - (Object.keys(KAPT_LABELS).indexOf(b) + 1 || 999));
    modal(`<h3>${esc(x.name)}</h3>${keys.length ? `<div class="tbl-wrap" style="max-height:60vh;overflow:auto"><table><tbody>${keys.map((k) => `<tr><th style="white-space:nowrap;text-align:left">${esc(kLabel(k))}</th><td>${esc(/Tel|Fax/.test(k) ? tel(raw[k]) : raw[k])}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">아직 상세 정보를 받지 않았습니다. "이어서 불러오기"를 눌러 주세요.</p>'}<div class="btns"><button class="btn btn-line" data-close>닫기</button></div>`);
  }; });
}
