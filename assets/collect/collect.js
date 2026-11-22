/* 건물 목록 수집 — 관리자 화면의 "건물 목록 수집" 메뉴 (마하파킹 ERP · 영업)
 *  🔎 하나씩 찾기 : 아파트·빌라·상가·오피스텔 등 모든 건물 (카카오 장소 검색 api/place.js)
 *  🏢 아파트 명단 : 전국 공동주택 — ① 공공데이터 파일로 단지 목록(횟수 제한 없음) ② 관리사무소 전화·팩스(공공데이터 api/kapt.js, 한 단지 1번)
 *                  ③ 공공데이터 하루 횟수를 다 쓰면 카카오 지도로 전화번호 채우기
 *  모은 곳은 엑셀로 저장하거나 고객사 리스트(sites)에 "영업 대상"으로 넣습니다.
 */
const sb = supabase.createClient(MAHA.SB_URL, MAHA.SB_KEY);
const root = document.getElementById('collect-root');
const D = { sites: [], loaded: false };
const CV = { sub: 'find' };

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
const nowIso = () => new Date().toISOString();
async function q(promise, msg) {
  const r = await promise;
  if (r.error) throw Object.assign(new Error(r.error.message), { userMsg: msg });
  return r.data;
}
async function token() { const { data } = await sb.auth.getSession(); return data.session && data.session.access_token; }
async function api(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `오류 ${r.status}`), { setup: !!j.setup });
  return j;
}
const siteByName = (name) => D.sites.find((s) => s.name.replace(/\s/g, '') === String(name || '').replace(/\s/g, ''));
const body = () => root.querySelector('#cl-body');

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
/* 숫자 칸 읽기: "780.0" · "1,234" 처럼 소수점·쉼표가 붙어도 정확히 (예전에는 780.0 → 7800으로 잘못 읽힘) */
const kNum = (s) => { const m = String(s == null ? '' : s).replace(/,/g, '').match(/-?\d+(\.\d+)?/); if (!m) return null; const v = Math.round(parseFloat(m[0])); return isFinite(v) ? v : null; };
/* 이미 저장된 명단의 세대수 · 동수 · 주차대수를 파일 원본 칸(raw)으로 다시 계산해 바로잡기 (한 번만) */
function kFixNums(db) {
  if (db.numFix) return false;
  const pickRaw = (raw, ...names) => { const ks = Object.keys(raw || {}); for (const nm of names) { const k = ks.find((x) => x.replace(/\s|\(.*?\)/g, '') === nm); if (k) return raw[k]; } return undefined; };
  let fixed = 0;
  Object.values(db.list).forEach((a) => {
    if (!a.file || !a.raw) return;
    const hh = kNum(pickRaw(a.raw, '세대수')), dg = kNum(pickRaw(a.raw, '동수'));
    const pk = kNum(pickRaw(a.raw, '총주차대수')) || ((kNum(pickRaw(a.raw, '지상주차대수')) || 0) + (kNum(pickRaw(a.raw, '지하주차대수')) || 0)) || null;
    const set = { households: hh, dongs: dg, parking: pk };
    Object.keys(set).forEach((k) => { if (set[k] != null && a[k] !== set[k]) { a[k] = set[k]; fixed++; } });
    const i = db.info[a.code];
    if (i && i.src === 'file') Object.keys(set).forEach((k) => { if (set[k] != null) i[k] = set[k]; });
  });
  db.numFix = 1;
  return fixed > 0;
}

const K = { run: false, stop: false, msg: '', sidoF: 'all', q: '', db: null };
/* 전국 2만 곳은 localStorage(5MB)에 다 안 들어가서 IndexedDB에 저장합니다. */
const kIdb = () => new Promise((ok, no) => { const r = indexedDB.open('maha_kapt', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
async function kIdbGet(k) { const d = await kIdb(); return new Promise((ok) => { const t = d.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => ok(t.result); t.onerror = () => ok(null); }); }
async function kIdbSet(k, v) { const d = await kIdb(); return new Promise((ok, no) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => ok(); t.onerror = () => no(t.error); }); }
async function kaptLoad() {
  if (K.db) return K.db;
  if (K.loading) return K.loading;
  K.loading = kaptLoad0(); try { return await K.loading; } finally { K.loading = null; }
}
async function kaptLoad0() {
  try { K.db = await kIdbGet(KAPT_KEY); } catch (e) { K.db = null; }
  if (!K.db) { try { K.db = JSON.parse(localStorage.getItem(KAPT_KEY)); if (K.db) K.db.sidos = KAPT_SIDO.map((x) => x[0]); localStorage.removeItem(KAPT_KEY); } catch (e) { K.db = null; } }
  if (!K.db) K.db = { sidos: KAPT_SIDO.map((x) => x[0]), listed: {}, list: {}, info: {} };
  // 예전에 0곳으로 끝난 시·도는 '받음' 표시를 지워 다시 받게 하기
  const has = {}; Object.values(K.db.list || {}).forEach((a) => { has[a.sc] = 1; });
  Object.keys(K.db.listed || {}).forEach((sc) => { if (!has[sc]) delete K.db.listed[sc]; });
  try { const s = await kIdbGet(SENT_KEY); if (s) { KS.sent = s.sent || {}; KS.at = s.at || ''; } } catch (e) {}
  await kPull();
  if (kFixNums(K.db)) { K.msg = '세대수 · 동수 · 주차대수를 파일 원본 값으로 바로잡았습니다.'; await kaptSave(); } else if (!K.db.numFix) { K.db.numFix = 1; }
  return K.db;
}
async function kaptSave() {
  let ok = true;
  try { await kIdbSet(KAPT_KEY, K.db); } catch (e) { ok = false; }
  kSchedule();
  return ok;
}

/* ---------- 서버(Supabase kapt_complex)에 명단 저장 — 어느 PC에서든 같은 명단 ----------
 * 이 PC(IndexedDB)는 빠르게 열기 위한 복사본이고, 진짜 명단은 서버에 있습니다.
 * 바뀐 단지만 골라 몇 초 뒤 서버에 올리고(kPush), 열 때 다른 PC에서 바뀐 것만 받아옵니다(kPull). */
const SENT_KEY = 'maha_kapt_sent_v1';
const KS = { sent: {}, at: '', off: false, busy: false, again: false, timer: 0, note: '' };
const h32 = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + s.length.toString(36); };
function kRow(code) {   // 서버에 올릴 한 단지 (파일 칸과 같은 값은 빼서 용량 줄이기)
  const a = K.db.list[code] || null, i = K.db.info[code];
  let info = null;
  if (i) { info = Object.assign({}, i); if (i.raw && a && a.raw) { const r = {}; Object.keys(i.raw).forEach((k) => { if (a.raw[k] !== i.raw[k]) r[k] = i.raw[k]; }); info.raw = r; } }
  return { code, list: a, info };
}
const kMeta = () => ({ code: '_meta', list: { sidos: K.db.sidos, listed: K.db.listed, fileAt: K.db.fileAt || null, fileCnt: K.db.fileCnt || null, resetAt: K.db.resetAt || null, numFix: K.db.numFix || 0 }, info: null });
async function kKeepSent() { try { await kIdbSet(SENT_KEY, { sent: KS.sent, at: KS.at }); } catch (e) {} }
function kOff(e) {
  if (/kapt_complex|schema cache|does not exist/i.test((e && e.message) || '')) { KS.off = true; KS.note = '⚠ 서버에 명단 표가 아직 없어 이 PC에만 저장됩니다. (supabase/kapt.sql 실행 필요)'; return true; }
  KS.note = '⚠ 서버에 저장하지 못했습니다. 잠시 뒤 다시 저장합니다. (' + ((e && e.message) || e) + ')'; return false;
}
async function kPull() {
  if (KS.off) return;
  try {
    const rows = [];
    for (let off = 0; ; off += 1000) {
      let qy = sb.from('kapt_complex').select('code,list,info,updated_at').order('updated_at').order('code').range(off, off + 999);
      if (KS.at) qy = qy.gt('updated_at', KS.at);
      const { data, error } = await qy; if (error) throw error;
      rows.push(...data);
      if (rows.length > 3000) { K.msg = `서버에서 명단 받는 중… ${rows.length.toLocaleString()}곳`; kaptPaint(); }
      if (data.length < 1000) break;
    }
    const meta = rows.find((r) => r.code === '_meta');
    if (meta && meta.list && meta.list.resetAt && meta.list.resetAt !== (K.db.resetAt || null) && KS.at) {   // 다른 PC에서 "처음부터 다시" → 이 PC 복사본도 비우고 전부 다시 받기
      K.db = { sidos: K.db.sidos, listed: {}, list: {}, info: {}, resetAt: meta.list.resetAt }; KS.sent = {}; KS.at = ''; return kPull();
    }
    rows.forEach((r) => {
      if (r.code === '_meta') { const m = r.list || {}; if (m.sidos) K.db.sidos = m.sidos; K.db.listed = m.listed || {}; K.db.fileAt = m.fileAt || K.db.fileAt; K.db.fileCnt = m.fileCnt || K.db.fileCnt; K.db.resetAt = m.resetAt || null; if (m.numFix) K.db.numFix = m.numFix; KS.sent._meta = h32(JSON.stringify(kMeta())); return; }
      if (r.list) K.db.list[r.code] = r.list; else delete K.db.list[r.code];
      if (r.info) { const i = r.info; if (i.raw && r.list && r.list.raw) i.raw = Object.assign({}, r.list.raw, i.raw); K.db.info[r.code] = i; } else delete K.db.info[r.code];
      KS.sent[r.code] = h32(JSON.stringify(kRow(r.code)));
    });
    if (rows.length) { KS.at = rows.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), KS.at || ''); await kIdbSet(KAPT_KEY, K.db).catch(() => {}); await kKeepSent(); }
    KS.note = '☁ 서버 명단과 맞췄습니다. 어느 PC에서든 같은 명단이 보입니다.';
    K.msg = '';
    kSchedule(0);   // 이 PC에만 있던 것(서버 저장 전에 받은 것)은 서버로 올리기
  } catch (e) { kOff(e); }
}
async function kPush() {
  if (KS.off || !K.db) return;
  if (KS.busy) { KS.again = true; return; }
  KS.busy = true;
  try {
    do {
      KS.again = false;
      const rows = [], hs = {};
      const m = kMeta(), mh = h32(JSON.stringify(m));
      if (KS.sent._meta !== mh) { rows.push(m); hs._meta = mh; }
      new Set([...Object.keys(K.db.list), ...Object.keys(K.db.info)]).forEach((c) => { const r = kRow(c), h = h32(JSON.stringify(r)); if (KS.sent[c] !== h) { rows.push(r); hs[c] = h; } });
      for (let i = 0; i < rows.length; i += 300) {
        const part = rows.slice(i, i + 300);
        const { error } = await sb.from('kapt_complex').upsert(part); if (error) throw error;
        part.forEach((r) => { KS.sent[r.code] = hs[r.code]; });
        if (rows.length > 300) { KS.note = `☁ 서버에 저장하는 중… ${Math.min(i + 300, rows.length).toLocaleString()} / ${rows.length.toLocaleString()}곳`; kaptPaint(); }
      }
      if (rows.length) { await kKeepSent(); KS.note = `☁ 서버에 저장됨 (${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })})`; }
    } while (KS.again);
  } catch (e) { if (!kOff(e)) kSchedule(20000); }
  KS.busy = false; kaptPaint();
}
function kSchedule(ms) {   // 받는 중에는 15초마다, 평소엔 1.5초 뒤 한 번에
  if (KS.off || KS.timer) return;
  KS.timer = setTimeout(() => { KS.timer = 0; kPush(); }, ms != null ? ms : K.run ? 15000 : 1500);
}
window.addEventListener('beforeunload', (e) => { if (KS.timer || KS.busy) { e.preventDefault(); e.returnValue = ''; } });
/* 단지 한 곳 = 목록 + 받은 정보 + 직접 고친 값(my: 전화·팩스·메모가 가장 우선) */
function kMerge(a, i) {
  i = i || {};
  const pick = (o) => { const r = {}; Object.keys(o || {}).forEach((k) => { const v = o[k]; if (v !== null && v !== undefined && v !== '') r[k] = v; }); return r; };
  const x = Object.assign({}, a, pick(i), { name: i.name || a.name, raw: Object.assign({}, a.raw || {}, i.raw || {}) });
  const my = a.my || {};
  if (my.name) x.name = my.name;
  if (my.tel !== undefined) x.tel = my.tel;
  if (my.fax !== undefined) x.fax = my.fax;
  x.memo = my.memo || '';
  return x;
}
const kaptRows = () => {
  const db = K.db;
  const pick = (o) => { const r = {}; Object.keys(o || {}).forEach((k) => { const v = o[k]; if (v !== null && v !== undefined && v !== '') r[k] = v; }); return r; };
  return Object.values(db.list).filter((a) => !a.hidden && db.sidos.includes(a.sc)).map((a) => kMerge(a, db.info[a.code]));
};
function kaptCount() {
  const db = K.db;
  const all = Object.values(db.list).filter((a) => !a.hidden && db.sidos.includes(a.sc));
  const target = all.filter((a) => !K.minHh || !a.households || a.households >= K.minHh);
  const done = target.filter((a) => a.manual || (db.info[a.code] && db.info[a.code].raw)).length;
  const phones = all.filter((a) => (a.my && a.my.tel) || (db.info[a.code] && db.info[a.code].tel)).length;
  const listedAll = db.sidos.every((c) => db.listed[c]);
  return { all: target.length, total: all.length, done, phones, listedAll, left: target.length - done };
}

function kStatus() { const ct = kaptCount(), started = Object.keys(K.db.list).length > 0; return K.msg || (started ? `대상 ${ct.all.toLocaleString()}곳 중 ${ct.done.toLocaleString()}곳 확인 · 전화번호 ${ct.phones.toLocaleString()}곳` : '아직 받은 것이 없습니다.'); }
function kaptPaint() {
  const ct = kaptCount();
  const m = root.querySelector('#kp-msg'); if (m && K.db) m.textContent = kStatus();
  const sy = root.querySelector('#kp-sync'); if (sy) sy.textContent = KS.note;
  const b = root.querySelector('#kp-bar'); if (b) b.style.width = (ct.all ? Math.round((ct.done / ct.all) * 100) : 0) + '%';
}

function kaptFiltered() {
  const qq = K.q.replace(/\s/g, '');
  return kaptRows().filter((x) => (K.sidoF === 'all' || x.sc === K.sidoF) && (!K.hasTel || x.tel) && (!K.minHh || !x.households || x.households >= K.minHh) && (!qq || [x.name, x.sido, x.sigungu, x.dong, x.doro, x.addr].join(' ').replace(/\s/g, '').includes(qq)))
    .sort((a, b) => (a.sc + a.sigungu + a.name).localeCompare(b.sc + b.sigungu + b.name, 'ko'));
}

async function kaptExcel(list) {
  if (!window.XLSX) {
    await new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'; sc.onload = ok; sc.onerror = () => no(new Error('엑셀 도구를 불러오지 못했습니다.')); document.head.appendChild(sc); });
  }
  const head = ['시·도', '시·군·구', '읍·면·동', '단지명', '관리사무소 전화', '관리사무소 팩스', '우편번호', '도로명 주소', '지번 주소', '세대수', '동수', '주차대수(합)', '관리 방식', '사용승인일', '단지코드'];
  const shown = new Set(['kaptCode', 'kaptName', 'kaptTel', 'kaptFax', 'zipcode', 'doroJuso', 'kaptAddr', 'kaptdaCnt', 'kaptDongCnt', 'codeMgrNm', 'kaptUsedate',
    '시도', '시군구', '읍면', '동리', '단지코드', '단지명', '법정동주소', '우편번호', '도로명주소', '세대수', '동수', '총주차대수', '관리방식', '사용승인일', '관리사무소 연락처', '관리사무소 팩스']);
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
const placeKind = (cat, name) => {   // 고객사 리스트 구분(아파트 · 건물·빌라 · 기타)에 맞춤
  const t = `${cat} ${name}`;
  if (/아파트/.test(t)) return '아파트';
  if (/오피스텔|빌라|연립|다세대|주택|상가|빌딩|타워|센터|건물|오피스|프라자|맨션/.test(t)) return '건물·빌라';
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
      while (got < total) { const r = await api('/api/kapt', { action: 'list', sido: sc, page }); r.list.forEach((x) => { db.list[x.code] = Object.assign(db.list[x.code] || {}, x, { sc }); }); got += r.list.length; total = r.total || got; if (!r.list.length) break; page++; }
      if (got) db.listed[sc] = true; kaptSave();
    }
    const nm = (s) => String(s || '').replace(/\s|아파트|\(.*?\)/g, '');
    const cands = Object.values(db.list).filter((a) => !a.hidden && a.sc === sc && (nm(a.name) === nm(p.name) || nm(p.name).includes(nm(a.name)) || nm(a.name).includes(nm(p.name))));
    const pick = cands.find((a) => p.address.includes(a.sigungu || '@@')) || cands[0];
    if (!pick) throw new Error('공공데이터(K-apt)에 등록된 아파트를 찾지 못했습니다.');
    if (!(db.info[pick.code] && db.info[pick.code].raw) && !pick.manual) { const r = await api('/api/kapt', { action: 'info', codes: [pick.code] }); r.info.forEach((x) => { if (x.ok) db.info[x.code] = x; else throw new Error(x.error || '정보를 받지 못했습니다.'); }); kaptSave(); }
    FD.kapt[key] = { info: kMerge(pick, db.info[pick.code]) };
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


/* ---------- ① 공공데이터 파일로 단지 목록 한 번에 (국토교통부_공동주택 단지 기본 정보 · 엑셀) ---------- */
const SIDO_NAME = { 서울: '11', 경기: '41', 인천: '28', 부산: '26', 대구: '27', 광주: '29', 대전: '30', 울산: '31', 세종: '36', 강원: '51', 충청북: '43', 충북: '43', 충청남: '44', 충남: '44', 전라북: '52', 전북: '52', 전라남: '46', 전남: '46', 경상북: '47', 경북: '47', 경상남: '48', 경남: '48', 제주: '50' };
const sidoCode = (s) => { const t = String(s || '').trim(); const k = Object.keys(SIDO_NAME).find((n) => t.startsWith(n)); return k ? SIDO_NAME[k] : ''; };
async function loadXlsxLib() {
  if (window.XLSX) return;
  await new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'; sc.onload = ok; sc.onerror = () => no(new Error('엑셀 도구를 불러오지 못했습니다.')); document.head.appendChild(sc); });
}
async function kaptFile(file) {
  const db = await kaptLoad();
  K.msg = '파일을 읽는 중… (전국 파일은 10초쯤 걸립니다)'; kaptPaint();
  try {
    await loadXlsxLib();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    let rows = [];
    wb.SheetNames.forEach((sn) => { const r = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: false }); if (r.length > rows.length) rows = r; });
    const norm = (h) => String(h || '').replace(/\s|\(.*?\)|-/g, '');
    const hi = rows.findIndex((r) => r.some((c) => norm(c) === '단지코드'));
    if (hi < 0) throw new Error('파일에서 "단지코드" 칸을 찾지 못했습니다. data.go.kr의 "국토교통부_공동주택 단지 기본 정보" 엑셀 파일인지 확인해 주세요.');
    const H = rows[hi].map(norm);
    const col = (...names) => { for (const n of names) { const i = H.indexOf(norm(n)); if (i >= 0) return i; } for (const n of names) { const i = H.findIndex((h) => h.includes(norm(n))); if (i >= 0) return i; } return -1; };
    const C = { code: col('단지코드'), name: col('단지명'), sido: col('시도'), sgg: col('시군구'), emd: col('읍면'), dong: col('동리'), addr: col('법정동주소'), doro: col('도로명주소'),
      hh: col('세대수'), dongs: col('동수'), mgr: col('관리방식'), use: col('사용승인일'), park: col('총주차대수'), parkG: col('지상주차대수'), parkU: col('지하주차대수'),
      cctv: col('CCTV대수'), pctl: col('주차관제'), net: col('홈네트워크'), office: col('관리사무소주소'), mcomp: col('주택관리업자'), kind: col('단지분류'),
      tel: col('관리사무소연락처', '관리사무소전화'), fax: col('관리사무소팩스'), zip: col('우편번호') };
    if (C.code < 0 || C.name < 0) throw new Error('파일 칸 이름을 알아보지 못했습니다.');
    const g = (r, i) => (i >= 0 ? String(r[i] == null ? '' : r[i]).trim() : '');
    const n = (r, i) => kNum(g(r, i));
    let cnt = 0, phones = 0; const seen = new Set();
    rows.slice(hi + 1).forEach((r) => {
      const code = g(r, C.code); if (!/^[A-Z0-9]{6,12}$/i.test(code)) return;
      const sido = g(r, C.sido), sc = sidoCode(sido) || sidoCode(g(r, C.addr)); if (!sc) return;
      const park = n(r, C.park) || ((n(r, C.parkG) || 0) + (n(r, C.parkU) || 0)) || null;
      // 파일의 모든 칸을 그대로 (K-apt 단지 기본정보 파일은 88칸)
      const raw = {};
      rows[hi].forEach((h, i) => { const k = String(h || '').trim(); const v = g(r, i); if (k && v && !/^시\s*분$/.test(v)) raw[k] = v; });
      db.list[code] = Object.assign(db.list[code] || {}, {
        code, sc, name: g(r, C.name), sido, sigungu: g(r, C.sgg), dong: g(r, C.dong) || g(r, C.emd),
        addr: g(r, C.addr), doro: g(r, C.doro), households: n(r, C.hh), dongs: n(r, C.dongs), mgr: g(r, C.mgr), parking: park,
        pctl: g(r, C.pctl), mcomp: g(r, C.mcomp), file: true, raw,
      });
      // 관리사무소 전화·팩스가 파일에 있으면 공공데이터 호출 없이 바로 채움
      const tel = g(r, C.tel).replace(/[^\d]/g, ''), fax = g(r, C.fax).replace(/[^\d]/g, '');
      if (tel || fax) {
        const prev = db.info[code] || {};
        db.info[code] = Object.assign({}, prev, { code, ok: true, name: g(r, C.name), tel: tel || prev.tel || '', fax: fax || prev.fax || '', zip: g(r, C.zip) || prev.zip || '',
          addr: g(r, C.addr), doro: g(r, C.doro), households: n(r, C.hh), dongs: n(r, C.dongs), mgr: g(r, C.mgr), usedate: g(r, C.use), parking: park, src: 'file', raw });
        phones++;
      }
      seen.add(sc); cnt++;
    });
    if (!cnt) throw new Error('파일에서 단지를 하나도 읽지 못했습니다.');
    seen.forEach((sc) => { db.listed[sc] = true; });
    db.fileAt = new Date().toISOString().slice(0, 10); db.fileCnt = cnt;
    await kaptSave();
    K.msg = `파일에서 ${cnt.toLocaleString()}곳을 읽었습니다${phones ? ` (관리사무소 전화·팩스 있는 곳 ${phones.toLocaleString()}곳은 바로 채움)` : ''}. 공공데이터 호출 없이 바로 씁니다.${phones ? ' 전화번호가 빈 곳만 [이어서 받기]나 [카카오 지도로 채우기]로 채우세요.' : ''}`;
  } catch (e) { K.msg = e.message; }
  drawKapt();
}

/* ---------- ② 관리사무소 전화·팩스 받기 (공공데이터: 한 단지 1번) + ③ 모자라면 카카오 지도로 채우기 ---------- */
async function kaptRun(mode) {
  const db = await kaptLoad(); K.trace = null;
  K.run = true; K.stop = false; K.msg = '시작합니다…'; drawKapt();
  try {
    for (const sc of db.sidos) {   // 파일로 안 받은 지역만 공공데이터 목록 서비스로
      if (K.stop) break;
      if (db.listed[sc]) continue;
      let page = 1, got = 0, total = 1;
      while (got < total && !K.stop) {
        const r = await api('/api/kapt', { action: 'list', sido: sc, page });
        r.list.forEach((x) => { db.list[x.code] = Object.assign(db.list[x.code] || {}, x, { sc }); });
        if (!r.list.length && page === 1 && r.trace) K.trace = r.trace;
        got += r.list.length; total = r.total || got;
        K.msg = `${KAPT_SIDO.find((x) => x[0] === sc)[1]} 단지 목록 ${got.toLocaleString()} / ${total.toLocaleString()}`; kaptPaint();
        if (!r.list.length) break;
        page++;
      }
      if (!K.stop && got > 0) db.listed[sc] = true;
      kaptSave();
    }
    const want = (a) => !a.hidden && !a.manual && db.sidos.includes(a.sc) && (!K.minHh || !a.households || a.households >= K.minHh);
    // 세대수 큰 단지부터 (영업 효과가 큰 곳 먼저)
    const order = (l) => l.sort((a, b) => (b.households || 0) - (a.households || 0)).map((a) => a.code);
    if (mode !== 'kakao') {
      const fromKapt = (i) => i && i.raw && i.src !== 'kakao';   // 카카오로 채운 곳은 다음 날 공공데이터로 다시 확인
      const todo = order(Object.values(db.list).filter((a) => want(a) && !fromKapt(db.info[a.code])));
      const CH = 16, chunks = [];
      for (let i = 0; i < todo.length; i += CH) chunks.push(todo.slice(i, i + CH));
      let quota = '';
      const worker = async () => {
        while (chunks.length && !K.stop && !quota) {
          const c = chunks.shift();
          try {
            const r = await api('/api/kapt', { action: 'info', codes: c, detail: !c.every((code) => db.list[code] && db.list[code].file) });
            r.info.forEach((x) => { if (x.ok) { x.src = 'kapt'; db.info[x.code] = x; } });
          } catch (e) { if (/호출 횟수/.test(e.message)) { quota = e.message; return; } throw e; }
          if (Math.random() < 0.1) kaptSave();
          const ct = kaptCount();
          K.msg = `관리사무소 전화·팩스 받는 중 (공공데이터)… ${ct.done.toLocaleString()} / ${ct.all.toLocaleString()}곳`; kaptPaint();
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      kaptSave();
      if (quota && !K.stop) { K.msg = '공공데이터 오늘 횟수를 다 써서, 카카오 지도로 이어서 찾습니다…'; kaptPaint(); mode = 'kakao'; }
    }
    if (mode === 'kakao' && !K.stop) await kakaoFill(order(Object.values(db.list).filter((a) => { const i = db.info[a.code] || {}; return want(a) && !(a.my && a.my.tel) && (!i.tel || !(i.doro || i.addr || a.doro || a.addr)); })));
    kaptSave();
    const ct = kaptCount();
    if (!ct.total && K.trace) { K.msg = '공공데이터에서 단지 목록이 0곳으로 왔습니다. 아래 응답 내용을 클로드에게 보여 주세요.\n' + K.trace.join('\n'); }
    else if (!K.stop) K.msg = `끝났습니다. 대상 ${ct.all.toLocaleString()}곳 중 ${ct.done.toLocaleString()}곳 확인 · 전화번호 있는 곳 ${ct.phones.toLocaleString()}곳.${ct.left ? `\n남은 ${ct.left.toLocaleString()}곳은 내일 "이어서"를 누르거나 [카카오로 채우기]를 눌러 주세요.` : ''}`;
    else K.msg = `멈췄습니다. ${ct.done.toLocaleString()} / ${ct.all.toLocaleString()}곳까지 받았습니다.`;
  } catch (e) {
    kaptSave();
    K.msg = e.message;
  }
  K.run = false; drawKapt();
}
/* 카카오 지도에서 "시군구 + 단지명 + 관리사무소"로 찾아 전화번호 채우기 */
async function kakaoFill(codes) {
  const db = K.db, nm = (s) => String(s || '').replace(/\s|아파트|\(.*?\)|관리사무소|제?\d+단지$/g, '');
  let i = 0, found = 0, done = 0, stopErr = '';
  const worker = async () => {
    while (i < codes.length && !K.stop && !stopErr) {
      const a = db.list[codes[i++]]; if (!a) continue;
      try {
        const r = await api('/api/place', { q: `${(a.sigungu || '').split(' ')[0]} ${a.name} 관리사무소`.trim() });
        const key = nm(a.name);
        const hit = r.list.find((p) => p.phone && (nm(p.name).includes(key) || key.includes(nm(p.name))) && /관리사무소|아파트/.test(p.name + p.category))
          || r.list.find((p) => p.phone && nm(p.name).includes(key));
        const prev = db.info[a.code] || { code: a.code, ok: true };
        // 주소는 전화번호가 없는 장소(아파트 자체)에서도 가져옵니다.
        const place = hit || r.list.find((p) => (nm(p.name).includes(key) || key.includes(nm(p.name))) && /아파트|주거|관리사무소/.test(p.name + p.category));
        const addrFix = !(prev.doro || prev.addr || a.doro || a.addr) && place ? { doro: place.address || '', addr: place.jibun || '', raw: Object.assign({}, prev.raw || {}, { '주소 출처': `카카오 지도 (${place.name})` }) } : {};
        const base = Object.assign({}, prev, addrFix, { raw: Object.assign({}, prev.raw || {}, addrFix.raw || {}) });
        if (prev.tel) db.info[a.code] = base;
        else if (hit) { found++; db.info[a.code] = Object.assign(base, { tel: hit.phone, src: prev.src || 'kakao', raw: Object.assign(base.raw, { '전화 출처': `카카오 지도 (${hit.name})` }) }); }
        else db.info[a.code] = Object.assign(base, { raw: Object.assign(base.raw, { '전화 출처': '카카오 지도에서 못 찾음' }) });
      } catch (e) { if (e.setup || /카카오/.test(e.message)) { stopErr = e.message; return; } }
      done++;
      if (done % 40 === 0) kaptSave();
      K.msg = `카카오 지도로 전화번호 찾는 중… ${done.toLocaleString()} / ${codes.length.toLocaleString()}곳 (찾음 ${found.toLocaleString()})`; kaptPaint();
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (stopErr) throw new Error(stopErr);
}

async function kaptReset() {
  K.msg = '지우는 중…'; kaptPaint();
  const resetAt = new Date().toISOString();
  K.db = { sidos: K.db.sidos, listed: {}, list: {}, info: {}, resetAt };
  if (!KS.off) { const { error } = await sb.from('kapt_complex').delete().neq('code', '_meta'); if (error) kOff(error); }
  KS.sent = {}; await kKeepSent(); await kaptSave(); K.msg = ''; drawKapt();
}
/* 단지 고치기 · 삭제 · 직접 추가 (서버에 바로 저장) */
function kEdit(code) {
  const db = K.db, a = code ? db.list[code] : null, x = a ? kMerge(a, db.info[code]) : { name: '', sc: K.sidoF !== 'all' ? K.sidoF : '41' };
  const raw = (a && x.raw) || {};
  const keys = Object.keys(raw).sort((p, q2) => (Object.keys(KAPT_LABELS).indexOf(p) + 1 || 999) - (Object.keys(KAPT_LABELS).indexOf(q2) + 1 || 999));
  modal(`<h3>${a ? esc(x.name) : '＋ 단지 직접 추가'}</h3>
    ${a ? `<p class="hint" style="margin:0 0 8px">${esc(x.doro || x.addr || '')}${x.households ? ` · ${x.households}세대` : ''}</p>` : ''}
    <div class="grid2" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${a ? '' : `<label>단지명<input id="ke-name"></label><label>시·도<select id="ke-sc">${KAPT_SIDO.map(([c, n]) => `<option value="${c}"${c === x.sc ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <label style="grid-column:1/-1">주소<input id="ke-addr" placeholder="예) 경기 안양시 동안구 ○○로 12"></label><label>세대수<input id="ke-hh" inputmode="numeric"></label><span></span>`}
      <label>관리사무소 전화<input id="ke-tel" inputmode="tel" value="${esc(tel(x.tel || ''))}"></label>
      <label>팩스<input id="ke-fax" inputmode="tel" value="${esc(tel(x.fax || ''))}"></label>
      <label style="grid-column:1/-1">메모<textarea id="ke-memo" rows="2" placeholder="예) 관리소장 통화함 · 12월 재연락">${esc(x.memo || '')}</textarea></label>
    </div>
    <p class="hint" style="margin:6px 0 0">고친 값은 서버에 저장되어 다른 PC에서도 보이고, 공공데이터를 다시 받아도 덮어쓰지 않습니다.</p>
    ${a && keys.length ? `<details style="margin-top:8px"><summary class="hint" style="cursor:pointer">공공데이터 전체 정보 (${keys.length}개 항목)</summary><div class="tbl-wrap" style="max-height:40vh;overflow:auto"><table><tbody>${keys.map((k) => `<tr><th style="white-space:nowrap;text-align:left">${esc(kLabel(k))}</th><td>${esc(/Tel|Fax/.test(k) ? tel(raw[k]) : raw[k])}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
    <div class="btns" style="margin-top:12px"><button class="btn btn-primary" type="button" id="ke-save">저장</button>${a ? '<button class="btn btn-line" type="button" id="ke-del" style="color:var(--stop)">명단에서 삭제</button>' : ''}<button class="btn btn-line" type="button" data-close>닫기</button></div>`, { lock: true });
  const v = (id) => (document.getElementById(id) || {}).value || '';
  document.getElementById('ke-save').onclick = () => {
    const my = Object.assign({}, (a && a.my) || {});
    const t = digits(v('ke-tel')), f = digits(v('ke-fax')), memo = v('ke-memo').trim();
    if (a) {
      const base = kMerge(Object.assign({}, a, { my: {} }), db.info[code]);   // 원래(공공데이터) 값과 다를 때만 "직접 고친 값"으로
      if (t !== digits(base.tel)) my.tel = t; else delete my.tel;
      if (f !== digits(base.fax)) my.fax = f; else delete my.fax;
      if (memo) my.memo = memo; else delete my.memo;
      a.my = my;
    } else {
      const name = v('ke-name').trim(); if (!name) { alert('단지명을 넣어 주세요.'); return; }
      const sc = v('ke-sc'), addr = v('ke-addr').trim(), nc = 'M' + Date.now().toString(36).toUpperCase();
      const sn = (KAPT_SIDO.find((s2) => s2[0] === sc) || [])[1] || '';
      db.list[nc] = { code: nc, sc, name, sido: sn, sigungu: addr.replace(/^\S+\s/, '').split(' ')[0] || '', dong: '', addr, doro: addr, households: parseInt(digits(v('ke-hh')), 10) || null, manual: true, my: { tel: t, fax: f, memo } };
    }
    closeModal(); kaptSave(); K.msg = a ? `"${x.name}" 고친 내용을 저장했습니다.` : '단지를 추가했습니다.'; drawKapt();
  };
  const del = document.getElementById('ke-del');
  if (del) del.onclick = () => {
    if (!confirm(`"${x.name}"을(를) 명단에서 지울까요?\n(파일을 다시 올려도 다시 나타나지 않습니다)`)) return;
    if (a.manual) { delete db.list[code]; delete db.info[code]; } else a.hidden = true;
    closeModal(); kaptSave(); K.msg = `"${x.name}"을(를) 명단에서 지웠습니다.`; drawKapt();
  };
}

/* ---------- 화면 ---------- */
function mount() {
  root.innerHTML = `<div class="sl-subs" role="tablist">${[['find', '🔎 하나씩 찾기'], ['kapt', '🏢 아파트 명단 (한꺼번에)']].map(([k, t]) => `<button type="button" role="tab" data-sub="${k}" aria-selected="${k === CV.sub}">${t}</button>`).join('')}</div><div id="cl-body"></div>`;
  root.querySelectorAll('[data-sub]').forEach((b) => { b.onclick = () => { CV.sub = b.dataset.sub; mount(); }; });
  (CV.sub === 'find' ? drawFind : drawKapt)();
}
async function drawKapt() {
  if (!K.db) { body().innerHTML = '<p class="hint">불러오는 중…</p>'; await kaptLoad(); if (CV.sub !== 'kapt') return; }
  const db = K.db, ct = kaptCount(), started = Object.keys(db.list).length > 0;
  const list = kaptFiltered(), show = list.slice(0, 300);
  const pct = ct.all ? Math.round((ct.done / ct.all) * 100) : 0;
  body().innerHTML = `
    <p id="kp-sync" class="hint" style="margin:0 0 6px;font-weight:700">${esc(KS.note)}</p>
    <p class="hint">국토교통부 공공데이터(K-apt에 등록된 아파트)로 전국 아파트 명단과 <b>관리사무소 전화·팩스</b>를 모읍니다. 빌라·상가 등은 <b>🔎 하나씩 찾기</b>를 쓰세요.</p>
    <div class="sl-step"><b><span class="sl-no">1</span>단지 목록 — 공공데이터 파일 올리기 <span class="hint" style="font-weight:400">(추천 · 횟수 제한 없음)</span></b>
      <ol class="hint" style="margin:4px 0 8px;padding-left:18px">
        <li><a href="https://www.data.go.kr/data/15073271/fileData.do" target="_blank" rel="noopener"><b>data.go.kr → 국토교통부_공동주택 단지 기본 정보</b></a>에서 엑셀 파일을 내려받습니다. (전국 약 1만 8천 곳 · 매주 갱신)</li>
        <li>아래 [파일 올리기]로 그 파일을 고르면 단지명·주소·세대수·주차대수·주차관제·관리업체가 한 번에 들어옵니다.</li>
      </ol>
      <div class="add-row" style="align-items:center"><label class="btn btn-line btn-sm" style="cursor:pointer">📂 파일 올리기<input type="file" id="kp-file" accept=".xlsx,.xls,.csv" style="display:none"${K.run ? ' disabled' : ''}></label>
        <span class="hint">${db.fileCnt ? `✓ ${esc(db.fileAt || '')} 파일에서 ${db.fileCnt.toLocaleString()}곳 읽음` : '아직 파일을 올리지 않았습니다.'}</span></div>
    </div>
    <div class="sl-step"><b><span class="sl-no">2</span>지역 고르기</b>
      <div class="btns" style="margin:2px 0 6px"><button class="btn btn-line btn-sm" type="button" id="kp-sall"${K.run ? ' disabled' : ''}>전국 모두</button><button class="btn btn-line btn-sm" type="button" id="kp-snone"${K.run ? ' disabled' : ''}>모두 해제</button></div>
      <div class="add-row" style="margin:4px 0;flex-wrap:wrap">${KAPT_SIDO.map(([c, n]) => `<label class="sl-chk"><input type="checkbox" data-ksido="${c}"${db.sidos.includes(c) ? ' checked' : ''}${K.run ? ' disabled' : ''}> ${n}${db.listed[c] ? ' <span class="hint">✓</span>' : ''}</label>`).join('')}</div>
      <label class="add-row" style="align-items:center;margin:6px 0 0">세대수 <input id="kp-minhh" inputmode="numeric" value="${K.minHh || ''}" placeholder="예) 300" style="width:90px"${K.run ? ' disabled' : ''}> 이상인 단지만 <span class="hint">(비우면 전부)</span></label>
    </div>
    <div class="sl-step"><b><span class="sl-no">3</span>관리사무소 전화·팩스 받기</b>
      <div class="btns">
        ${K.run ? '<button class="btn btn-line" type="button" id="kp-stop">⏸ 멈추기</button>' : `<button class="btn btn-cta" type="button" id="kp-go">▶ ${ct.done ? '이어서 받기' : '받기'} (공공데이터)</button><button class="btn btn-line" type="button" id="kp-kakao">📍 카카오 지도로 채우기</button>`}
        ${!K.run && started ? '<button class="btn btn-line btn-sm" type="button" id="kp-reset">처음부터 다시</button>' : ''}
        ${K.run ? '' : '<button class="btn btn-line btn-sm" type="button" id="kp-check">🔎 연결 점검</button>'}
      </div>
      <div style="height:10px;background:var(--line);border-radius:6px;overflow:hidden;margin:10px 0 4px"><div id="kp-bar" style="height:100%;width:${pct}%;background:var(--brand);transition:width .3s"></div></div>
      <p id="kp-msg" role="status" style="margin:0;font-weight:700;white-space:pre-wrap;word-break:break-all">${esc(kStatus())}</p>
      <p class="hint" style="margin:4px 0 0">공공데이터는 <b>한 단지에 1번</b>씩 부르고, 세대수 큰 단지부터 받습니다. 하루 횟수를 다 쓰면 <b>카카오 지도</b>로 자동으로 이어서 찾습니다. 남은 곳은 다음 날 "이어서 받기"를 누르세요.</p>
    </div>
    <div class="sl-step"><b><span class="sl-no">4</span>엑셀로 저장 · 고객사 리스트에 넣기</b>
      <div class="add-row" style="margin:4px 0;align-items:center">
        <select id="kp-sf" style="width:auto"><option value="all">전체 지역</option>${KAPT_SIDO.filter(([c]) => db.sidos.includes(c)).map(([c, n]) => `<option value="${c}"${K.sidoF === c ? ' selected' : ''}>${n}</option>`).join('')}</select>
        <input id="kp-q" placeholder="시·군·구, 동, 단지명 찾기 (예: 수지구)" value="${esc(K.q)}" style="max-width:240px">
        <label class="sl-chk"><input type="checkbox" id="kp-hastel"${K.hasTel ? ' checked' : ''}> 전화번호 있는 곳만</label>
        <span><b>${list.length.toLocaleString()}</b>곳</span>
      </div>
      <div class="btns"><button class="btn btn-primary" type="button" id="kp-xlsx"${list.length ? '' : ' disabled'}>⬇ 엑셀 파일로 저장</button><button class="btn btn-line" type="button" id="kp-imp"${list.length && !K.run ? '' : ' disabled'}>＋ 보이는 곳을 고객사 리스트에 넣기</button><button class="btn btn-line" type="button" id="kp-add">＋ 단지 직접 추가</button></div>
      <div class="tbl-wrap" style="margin-top:10px;max-height:420px;overflow:auto"><table><thead><tr><th>지역</th><th>단지명 · 주소 <span class="hint" style="font-weight:400">(누르면 고치기 · 삭제)</span></th><th>관리사무소 전화</th><th>팩스</th><th>세대</th><th>주차</th></tr></thead><tbody>
        ${show.length ? show.map((x) => `<tr data-kinfo="${esc(x.code)}" style="cursor:pointer"><td>${esc([x.sigungu, x.dong].filter(Boolean).join(' '))}</td><td><b>${esc(x.name)}</b>${siteByName(x.name) ? ' <span class="status st-sent">등록됨</span>' : ''}${x.manual ? ' <span class="hint">(직접 추가)</span>' : ''}${x.memo ? `<br><span class="hint" style="color:var(--brand)">📝 ${esc(x.memo)}</span>` : ''}${x.doro || x.addr ? `<br><span class="hint">${x.zip ? '(' + esc(x.zip) + ') ' : ''}${esc(x.doro || x.addr)}</span>` : ''}</td><td style="white-space:nowrap">${x.tel ? `<a href="tel:${digits(x.tel)}">${esc(tel(x.tel))}</a>${x.src === 'kakao' ? ' <span class="hint">카카오</span>' : ''}` : '<span class="hint">-</span>'}</td><td style="white-space:nowrap">${esc(tel(x.fax)) || '<span class="hint">-</span>'}</td><td>${x.households || ''}</td><td>${x.parking || ''}</td></tr>`).join('') : '<tr><td colspan="6" class="empty">받은 단지가 없습니다.</td></tr>'}
      </tbody></table></div>
      ${list.length > show.length ? `<p class="hint">화면에는 앞의 300곳만 보입니다. 엑셀에는 ${list.length.toLocaleString()}곳이 모두 들어갑니다.</p>` : ''}
    </div>
    <p class="hint">⚠ 이 명단은 전화·방문·우편(DM) 영업용입니다. 광고 문자·팩스는 받는 분이 미리 동의한 경우에만 보낼 수 있습니다 (정보통신망법 제50조).</p>`;
  const $$ = (x) => root.querySelector(x);
  $$('#kp-file').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) kaptFile(f); };
  root.querySelectorAll('[data-ksido]').forEach((c) => { c.onchange = () => { const s = new Set(db.sidos); if (c.checked) s.add(c.dataset.ksido); else s.delete(c.dataset.ksido); db.sidos = KAPT_SIDO.map((x) => x[0]).filter((x) => s.has(x)); kaptSave(); K.msg = ''; drawKapt(); }; });
  const setS = (l) => { db.sidos = l; kaptSave(); K.msg = ''; drawKapt(); };
  if ($$('#kp-sall')) $$('#kp-sall').onclick = () => setS(KAPT_SIDO.map((x) => x[0]));
  if ($$('#kp-snone')) $$('#kp-snone').onclick = () => setS([]);
  $$('#kp-minhh').onchange = (e) => { K.minHh = parseInt(digits(e.target.value), 10) || 0; try { localStorage.setItem('maha_kapt_minhh', K.minHh); } catch (x) {} K.msg = ''; drawKapt(); };
  if ($$('#kp-go')) $$('#kp-go').onclick = () => { if (!db.sidos.length) { K.msg = '지역을 하나 이상 골라 주세요.'; kaptPaint(); return; } kaptRun('kapt'); };
  if ($$('#kp-kakao')) $$('#kp-kakao').onclick = () => { if (!db.sidos.length) { K.msg = '지역을 하나 이상 골라 주세요.'; kaptPaint(); return; } kaptRun('kakao'); };
  if ($$('#kp-check')) $$('#kp-check').onclick = async () => {
    K.msg = '공공데이터 연결을 점검하는 중…'; kaptPaint();
    try {
      const r = await api('/api/kapt', { action: 'check' });
      const line = (t, x) => `${t}: ${x.ok ? `✅ 정상${x.n ? '' : ' (결과 0건)'}` : `❌ ${x.error}`}`;
      K.msg = `${line('① 단지 목록제공 서비스', r.list)}\n${line('② 기본 정보제공 서비스(전화·팩스)', r.info)}`;
    } catch (e) { K.msg = e.message; }
    drawKapt();
  };
  if ($$('#kp-stop')) $$('#kp-stop').onclick = () => { K.stop = true; K.msg = '멈추는 중…'; kaptPaint(); };
  if ($$('#kp-reset')) $$('#kp-reset').onclick = () => { if (!confirm('지금까지 받은 아파트 명단을 지우고 처음부터 다시 받을까요?')) return; kaptReset(); };
  $$('#kp-sf').onchange = (e) => { K.sidoF = e.target.value; drawKapt(); };
  $$('#kp-q').onchange = (e) => { K.q = e.target.value; drawKapt(); };
  $$('#kp-hastel').onchange = (e) => { K.hasTel = e.target.checked; drawKapt(); };
  $$('#kp-xlsx').onclick = async () => { $$('#kp-xlsx').disabled = true; try { await kaptExcel(list); } catch (e) { K.msg = e.message; kaptPaint(); } $$('#kp-xlsx').disabled = false; };
  $$('#kp-imp').onclick = () => kaptImport(list);
  root.querySelectorAll('[data-kinfo]').forEach((tr) => { tr.onclick = (e) => { if (e.target.closest('a')) return; kEdit(tr.dataset.kinfo); }; });
  if ($$('#kp-add')) $$('#kp-add').onclick = () => kEdit(null);
}

async function load() {
  root.innerHTML = '<p class="hint">불러오는 중…</p>';
  try { K.minHh = parseInt(localStorage.getItem('maha_kapt_minhh'), 10) || 0; } catch (e) {}
  const r = await sb.from('sites').select('id,name').limit(20000);
  D.sites = r.error ? [] : (r.data || []); D.loaded = true;
  mount();
}
const tabBtn = document.querySelector('#admin-tabs [data-tab="collect"]');
if (tabBtn) tabBtn.addEventListener('click', () => { if (!D.loaded) load(); else mount(); });
