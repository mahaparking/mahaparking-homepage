/* 작업 일정: 네이버 캘린더(CalDAV) 읽기 · 일정 추가 · 삭제 — 관리자만
 *
 * Vercel 환경변수 (Settings → Environment Variables, 넣은 뒤 Redeploy)
 *   NAVER_CALDAV_ID        네이버 아이디 (예: mahaparking)
 *   NAVER_CALDAV_PASSWORD  네이버 "애플리케이션 비밀번호" (일반 로그인 비밀번호 아님)
 *   NAVER_CALDAV_CALENDAR  (선택) 일정을 넣을 캘린더 이름. 비우면 첫 번째 캘린더
 *
 * POST /api/calendar  { action: 'list', from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
 *                     { action: 'add', title, date, start, end, allDay, location, memo, alarms: [분, ...] }
 *                     { action: 'upsert', href?, title, date, start, end, location, memo, alarms }  ← 작업 관리에서 저장할 때 (있으면 고치고 없으면 새로)
 *                     { action: 'delete', href, etag? }
 *                     { action: 'check' }  ← 연결 확인 (캘린더 이름 목록)
 */
const crypto = require('crypto');
const { readBody, send, guard } = require('./_auth');

const BASE = process.env.NAVER_CALDAV_BASE || 'https://caldav.calendar.naver.com';
const KST = 9 * 3600 * 1000;
let CACHE = null; // { home, cals: [{ href, name, color }] }

function auth() {
  return 'Basic ' + Buffer.from(`${process.env.NAVER_CALDAV_ID}:${process.env.NAVER_CALDAV_PASSWORD}`).toString('base64');
}
function abs(href) { return /^https?:/i.test(href) ? href : BASE + (href.startsWith('/') ? '' : '/') + href; }
async function dav(method, url, body, headers) {
  const r = await fetch(abs(url), {
    method,
    headers: Object.assign({ Authorization: auth(), 'Content-Type': 'application/xml; charset=utf-8' }, headers || {}),
    body,
    redirect: 'follow',
  });
  const text = await r.text();
  if (r.status === 401 || r.status === 403) { const e = new Error('네이버 로그인에 실패했습니다. 아이디와 애플리케이션 비밀번호를 확인해 주세요.'); e.code = 401; throw e; }
  return { status: r.status, ok: r.ok || r.status === 207, text, headers: r.headers };
}

/* ---------- XML (네임스페이스 접두어와 상관없이 읽기) ---------- */
const decode = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#13;/g, '\r').replace(/&#10;/g, '\n').replace(/&amp;/g, '&');
function tags(xml, name) {
  const re = new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>)`, 'gi');
  const out = []; let m; while ((m = re.exec(xml))) out.push(m[1] || ''); return out;
}
const first = (xml, name) => (tags(xml, name)[0] || '');
const hrefIn = (xml, name) => decode(first(first(xml, name), 'href')).trim();

/* ---------- 캘린더 찾기 ---------- */
async function discover() {
  if (CACHE) return CACHE;
  const P0 = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>';
  let principal = '';
  for (const u of ['/', '/.well-known/caldav', '/principals/']) {
    try { const r = await dav('PROPFIND', u, P0, { Depth: '0' }); principal = hrefIn(r.text, 'current-user-principal'); if (principal) break; } catch (e) { if (e.code === 401) throw e; }
  }
  if (!principal) principal = `/principals/users/${encodeURIComponent(process.env.NAVER_CALDAV_ID)}/`;
  const P1 = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>';
  const r1 = await dav('PROPFIND', principal, P1, { Depth: '0' });
  const home = hrefIn(r1.text, 'calendar-home-set') || principal;
  const P2 = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"><d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/><a:calendar-color/></d:prop></d:propfind>';
  const r2 = await dav('PROPFIND', home, P2, { Depth: '1' });
  const cals = [];
  tags(r2.text, 'response').forEach((resp) => {
    const rt = first(resp, 'resourcetype');
    if (!/calendar/i.test(rt)) return;
    const comps = first(resp, 'supported-calendar-component-set');
    if (comps && !/VEVENT/i.test(comps)) return; // 할 일 전용 캘린더는 빼기
    const href = decode(first(resp, 'href')).trim();
    cals.push({ href, name: decode(first(resp, 'displayname')).trim() || '캘린더', color: decode(first(resp, 'calendar-color')).trim().slice(0, 7) });
  });
  if (!cals.length) throw new Error('네이버 캘린더 목록을 찾지 못했습니다.');
  CACHE = { home, cals };
  return CACHE;
}

/* ---------- iCalendar ---------- */
function parseIcs(ics) {
  const lines = ics.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const evs = []; let cur = null, depth = 0;
  lines.forEach((ln) => {
    if (/^BEGIN:VEVENT/i.test(ln)) { cur = {}; depth = 0; return; }
    if (/^END:VEVENT/i.test(ln)) { if (cur) evs.push(cur); cur = null; return; }
    if (!cur) return;
    if (/^BEGIN:/i.test(ln)) { depth++; return; }
    if (/^END:/i.test(ln)) { depth--; return; }
    if (depth > 0) return; // VALARM 안쪽은 건너뛰기
    const i = ln.indexOf(':'); if (i < 0) return;
    const head = ln.slice(0, i).split(';'), name = head[0].toUpperCase(), params = {};
    head.slice(1).forEach((p) => { const k = p.split('='); params[k[0].toUpperCase()] = (k[1] || '').replace(/^"|"$/g, ''); });
    const val = ln.slice(i + 1).replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
    if (name === 'EXDATE') (cur.EXDATE = cur.EXDATE || []).push({ v: val, p: params });
    else cur[name] = { v: val, p: params };
  });
  return evs;
}
/** iCal 날짜 → { ms (UTC 기준 시각), allDay } — 시간대 표시가 없거나 TZID 이면 한국 시간으로 봄 */
function icsTime(f) {
  if (!f) return null;
  const v = f.v.trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
  if (!m) return null;
  if (!m[4] || (f.p.VALUE || '').toUpperCase() === 'DATE') return { ms: Date.UTC(+m[1], +m[2] - 1, +m[3]) - KST, allDay: true };
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  if (m[7]) return { ms: utc, allDay: false };
  const tz = f.p.TZID || 'Asia/Seoul';
  return { ms: utc - tzOffset(tz, utc), allDay: false };
}
function tzOffset(tz, approxUtc) {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(approxUtc));
    const g = (t) => +p.find((x) => x.type === t).value;
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - approxUtc;
  } catch (e) { return KST; }
}
const kst = (ms) => new Date(ms + KST).toISOString().slice(0, 16); // 'YYYY-MM-DDTHH:MM' (한국 시간)
const icsUtc = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

/** 반복 일정을 기간 안의 날짜들로 펼치기 (매일 · 매주 · 매월 · 매년, INTERVAL · COUNT · UNTIL · 요일) */
function expand(start, rrule, fromMs, toMs, exdates) {
  const R = {}; rrule.split(';').forEach((kv) => { const k = kv.split('='); R[k[0].toUpperCase()] = (k[1] || '').toUpperCase(); });
  const step = Math.max(1, +R.INTERVAL || 1), count = +R.COUNT || 0;
  const until = R.UNTIL ? (icsTime({ v: R.UNTIL, p: {} }) || {}).ms : Infinity;
  const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const byday = R.BYDAY ? R.BYDAY.split(',').map((d) => DAYS.indexOf(d.slice(-2))).filter((d) => d >= 0) : null;
  const ex = new Set((exdates || []).map((x) => (icsTime(x) || {}).ms));
  const out = []; let n = 0;
  const base = new Date(start.ms + KST); // 한국 시간 기준 날짜 계산
  const push = (ms) => { if (ms > until) return false; n++; if (count && n > count) return false; if (ms >= fromMs && ms < toMs && !ex.has(ms)) out.push(ms); return true; };
  for (let i = 0; i < 1500; i++) {
    let cands = [];
    const d = new Date(base);
    if (R.FREQ === 'DAILY') { d.setUTCDate(base.getUTCDate() + i * step); cands = [d.getTime() - KST]; }
    else if (R.FREQ === 'WEEKLY') {
      const w0 = new Date(base); w0.setUTCDate(base.getUTCDate() - base.getUTCDay() + i * 7 * step);
      (byday || [base.getUTCDay()]).slice().sort().forEach((wd) => { const x = new Date(w0); x.setUTCDate(w0.getUTCDate() + wd); if (x >= base) cands.push(x.getTime() - KST); });
    } else if (R.FREQ === 'MONTHLY') { d.setUTCMonth(base.getUTCMonth() + i * step); if (d.getUTCDate() === base.getUTCDate()) cands = [d.getTime() - KST]; }
    else if (R.FREQ === 'YEARLY') { d.setUTCFullYear(base.getUTCFullYear() + i * step); if (d.getUTCMonth() === base.getUTCMonth()) cands = [d.getTime() - KST]; }
    else { cands = [start.ms]; }
    for (const ms of cands) { if (!push(ms)) return out; }
    if (cands.length && cands[cands.length - 1] >= toMs) break;
    if (!R.FREQ) break;
  }
  return out;
}

async function list(from, to) {
  const { cals } = await discover();
  const fromMs = Date.parse(from + 'T00:00:00+09:00'), toMs = Date.parse(to + 'T00:00:00+09:00') + 86400000;
  const q = `<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${icsUtc(fromMs)}" end="${icsUtc(toMs)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
  const out = [];
  await Promise.all(cals.map(async (cal) => {
    const r = await dav('REPORT', cal.href, q, { Depth: '1' });
    if (!r.ok) return;
    tags(r.text, 'response').forEach((resp) => {
      const data = decode(first(resp, 'calendar-data')); if (!data) return;
      const href = decode(first(resp, 'href')).trim(), etag = decode(first(resp, 'getetag')).trim();
      const evs = parseIcs(data);
      const overrides = evs.filter((e) => e['RECURRENCE-ID']).map((e) => (icsTime(e['RECURRENCE-ID']) || {}).ms);
      evs.forEach((e) => {
        const s = icsTime(e.DTSTART); if (!s) return;
        let en = icsTime(e.DTEND);
        const dur = en ? en.ms - s.ms : (s.allDay ? 86400000 : 3600000);
        const item = (ms) => ({
          href, etag, cal: cal.name, color: cal.color, uid: e.UID ? e.UID.v : '', recurring: !!e.RRULE,
          title: e.SUMMARY ? e.SUMMARY.v : '(제목 없음)', location: e.LOCATION ? e.LOCATION.v : '', memo: e.DESCRIPTION ? e.DESCRIPTION.v : '',
          allDay: s.allDay, start: kst(ms), end: kst(ms + dur),
        });
        if (e.RRULE && !e['RECURRENCE-ID']) expand(s, e.RRULE.v, fromMs - dur, toMs, e.EXDATE).filter((ms) => overrides.indexOf(ms) < 0).forEach((ms) => out.push(item(ms)));
        else if (s.ms < toMs && s.ms + dur > fromMs) out.push(item(s.ms));
      });
    });
  }));
  out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return { events: out, calendars: cals.map((c) => c.name) };
}

function buildIcs(b, uid) {
  const title = String(b.title || '').trim(); if (!title) throw new Error('일정 제목이 없습니다.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) throw new Error('날짜가 없습니다.');
  const now = icsUtc(Date.now());
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MAHAPARKING//Admin//KO', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${now}`, `LAST-MODIFIED:${now}`, `SUMMARY:${esc(title)}`];
  const st = /^\d{2}:\d{2}$/.test(b.start || '') ? b.start : '';
  let alarms = Array.isArray(b.alarms) ? b.alarms.map(Number) : null;
  if (!st) {
    const d = b.date.replace(/-/g, ''); const nx = new Date(Date.parse(b.date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10).replace(/-/g, '');
    L.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${nx}`);
    if (!alarms) alarms = [360];            // 시간 없는 일정: 전날 저녁 6시
  } else {
    const en = /^\d{2}:\d{2}$/.test(b.end || '') ? b.end : '';
    const startMs = Date.parse(`${b.date}T${st}:00+09:00`);
    let endMs = en ? Date.parse(`${b.date}T${en}:00+09:00`) : startMs + 3600000; if (endMs <= startMs) endMs = startMs + 3600000;
    L.push(`DTSTART:${icsUtc(startMs)}`, `DTEND:${icsUtc(endMs)}`);
    if (!alarms) alarms = [1440, 60];       // 하루 전 · 1시간 전
  }
  if (b.location) L.push(`LOCATION:${esc(b.location)}`);
  if (b.memo) L.push(`DESCRIPTION:${esc(b.memo)}`);
  alarms.filter((m) => m > 0 && m <= 7 * 1440).forEach((m) => {
    L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, `TRIGGER:-PT${m}M`, 'END:VALARM');
  });
  L.push('END:VEVENT', 'END:VCALENDAR');
  return L.join('\r\n') + '\r\n';
}
async function targetCal() {
  const { cals } = await discover();
  const want = (process.env.NAVER_CALDAV_CALENDAR || '').trim();
  return (want && cals.find((c) => c.name === want)) || cals[0];
}
async function put(href, ics, isNew) {
  const r = await dav('PUT', href, ics, Object.assign({ 'Content-Type': 'text/calendar; charset=utf-8' }, isNew ? { 'If-None-Match': '*' } : {}));
  if (!r.ok && r.status !== 201 && r.status !== 204) throw new Error(`네이버 캘린더에 넣지 못했습니다. (네이버 응답 ${r.status})`);
}
async function add(b) {
  const cal = await targetCal();
  const id = crypto.randomUUID();
  const href = cal.href.replace(/\/?$/, '/') + id + '.ics';
  await put(href, buildIcs(b, id + '@mahaparking.co.kr'), true);
  return { ok: true, cal: cal.name, href };
}
/** 작업 관리에서 저장: href 가 있으면 그 일정을 고치고, 없으면 새로 만들기 */
async function upsert(b) {
  const { home } = await discover();
  const homePath = home.replace(/^https?:\/\/[^/]+/i, '');
  if (b.href && b.href.indexOf(homePath) === 0) {
    const uid = decodeURIComponent(b.href.split('/').pop().replace(/\.ics$/i, '')) + '@mahaparking.co.kr';
    const r = await dav('PUT', b.href, buildIcs(b, uid), { 'Content-Type': 'text/calendar; charset=utf-8' });
    if (r.ok || r.status === 201 || r.status === 204) return { ok: true, href: b.href };
    if (r.status !== 404 && r.status !== 412) throw new Error(`네이버 캘린더 일정을 고치지 못했습니다. (네이버 응답 ${r.status})`);
  }
  return add(b);   // 처음이거나 네이버에서 지워진 일정이면 새로
}

async function remove(b) {
  if (!b.href || !/^\//.test(b.href)) throw new Error('지울 일정을 찾지 못했습니다.');
  const { home } = await discover();
  const homePath = home.replace(/^https?:\/\/[^/]+/i, '');
  if (b.href.indexOf(homePath) !== 0) throw new Error('이 캘린더의 일정이 아닙니다.');
  const r = await dav('DELETE', b.href, undefined, b.etag ? { 'If-Match': b.etag } : {});
  if (r.status === 412) throw new Error('그 사이에 네이버 캘린더에서 일정이 바뀌었습니다. 새로고침한 뒤 다시 해 주세요.');
  if (!r.ok && r.status !== 204 && r.status !== 404) throw new Error(`일정을 지우지 못했습니다. (네이버 응답 ${r.status})`);
  return { ok: true };
}

module.exports = async (req, res) => {
  if (!(await guard(req, res))) return;
  if (!process.env.NAVER_CALDAV_ID || !process.env.NAVER_CALDAV_PASSWORD) {
    return send(res, 500, { error: 'Vercel 환경변수 NAVER_CALDAV_ID, NAVER_CALDAV_PASSWORD 가 아직 없습니다. 넣은 뒤 Redeploy 해 주세요.', setup: true });
  }
  try {
    const b = await readBody(req);
    if (b.action === 'list') {
      const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
      if (!ok(b.from) || !ok(b.to)) return send(res, 400, { error: '기간이 잘못되었습니다.' });
      return send(res, 200, await list(b.from, b.to));
    }
    if (b.action === 'add') return send(res, 200, await add(b));
    if (b.action === 'upsert') return send(res, 200, await upsert(b));
    if (b.action === 'check') { const c = await discover(); return send(res, 200, { ok: true, calendars: c.cals.map((x) => x.name), target: (await targetCal()).name }); }
    if (b.action === 'delete') return send(res, 200, await remove(b));
    return send(res, 400, { error: '알 수 없는 요청입니다.' });
  } catch (e) {
    CACHE = e.code === 401 ? null : CACHE;
    return send(res, 502, { error: e.message || String(e), naverAuth: e.code === 401 });
  }
};

module.exports._test = { parseIcs, icsTime, expand, list, add, upsert, remove, discover, buildIcs };
