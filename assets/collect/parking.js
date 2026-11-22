/* 🅿 주차장 명단 — 관리자 "건물 목록 수집"의 세 번째 탭
 *  공공데이터포털 「전국주차장정보표준데이터」 파일(csv · xls · xlsx)을 올리면 전국 공영·민영 주차장과 관리기관 전화번호가 들어옵니다.
 *  찾기(시·도 · 시군구 · 검색어 · 면수 · 공영/민영 · 노상/노외/부설) → 고치기 · 삭제 · 직접 추가 → 엑셀 저장 · 고객사 리스트에 넣기
 *  이 PC(IndexedDB)는 빨리 열기 위한 복사본이고, 진짜 명단은 서버 표 parking_lot 에 있습니다 (어느 PC에서든 같은 명단).
 */
import { mselHtml, mselBind } from './msel.js';
export function makePark(ctx) {
  const { sb, body, D, digits, tel, nowIso, loadXlsxLib, isOpen, redrawTabs } = ctx;
  const P = { db: null, loading: null, msg: '', q: '', sidos: [], sggs: [], min: 0, max: 0, kind: '', type: '', hasTel: false, notReg: false, limit: 100 };
  const S = { sent: {}, ver: {}, at: '', off: false, busy: false, again: false, timer: 0, note: '' };
  const DBKEY = 'maha_park_v1', SENTKEY = 'maha_park_sent_v1';
  const KO = new Intl.Collator('ko');
  const h32 = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + s.length.toString(36); };
  const num = (s) => { const m = String(s == null ? '' : s).replace(/,/g, '').match(/\d+(\.\d+)?/); return m ? Math.round(parseFloat(m[0])) : null; };
  const nmKey = (s) => String(s || '').replace(/\s|\(.*?\)/g, '');
  const SIDO_SHORT = (s) => String(s || '').replace(/특별자치시|특별자치도|특별시|광역시/, '').replace(/^(경상|전라|충청)(남|북)도$/, (m, a, b) => a[0] + b).replace(/도$/, '').replace(/^전븍/, '전북') || '기타';

  /* ---------- 이 PC 복사본 (IndexedDB) ---------- */
  const idb = () => new Promise((ok, no) => { const r = indexedDB.open('maha_park', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  async function iget(k) { const d = await idb(); return new Promise((ok) => { const t = d.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => ok(t.result); t.onerror = () => ok(null); }); }
  async function iset(k, v) { const d = await idb(); return new Promise((ok, no) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => ok(); t.onerror = () => no(t.error); }); }
  async function load() {
    if (P.db) return P.db;
    if (P.loading) return P.loading;
    P.loading = (async () => {
      try { P.db = await iget(DBKEY); } catch (e) { P.db = null; }
      if (!P.db) P.db = { list: {} };
      try { const s = await iget(SENTKEY); if (s) Object.assign(S, { sent: s.sent || {}, ver: s.ver || {}, at: s.at || '' }); } catch (e) {}
      if (Object.keys(P.db.list).length) { S.note = '☁ 서버와 맞추는 중…'; pull().then((n) => { if (n && isOpen() && !P.busy) draw(); else paint(); }); } else await pull();
      return P.db;
    })();
    try { return await P.loading; } finally { P.loading = null; }
  }
  async function save() { try { await iset(DBKEY, P.db); } catch (e) {} schedule(); }
  const keepSent = () => iset(SENTKEY, { sent: S.sent, ver: S.ver, at: S.at }).catch(() => {});

  /* ---------- 서버 표 parking_lot (code, data jsonb, updated_at) ---------- */
  function row(code) {   // 칸 이름은 _meta 에 한 번만, 값은 순서대로(rv) — 용량 줄이기
    const a = P.db.list[code]; if (!a) return { code, data: null };
    const o = Object.assign({}, a);
    if (a.raw) { const H = P.db.rawh || (P.db.rawh = []), rv = []; Object.keys(a.raw).forEach((k) => { let i = H.indexOf(k); if (i < 0) { H.push(k); i = H.length - 1; } rv[i] = a.raw[k]; }); for (let i = 0; i < rv.length; i++) if (rv[i] === undefined) rv[i] = null; o.rv = rv; delete o.raw; }
    return { code, data: o };
  }
  const unrow = (d) => { if (!d || !d.rv) return d; const H = P.db.rawh || [], raw = {}; d.rv.forEach((v, i) => { if (v != null && H[i]) raw[H[i]] = v; }); const o = Object.assign({}, d, { raw }); delete o.rv; return o; };
  const meta = () => ({ code: '_meta', data: { fileAt: P.db.fileAt || null, fileCnt: P.db.fileCnt || null, rawh: P.db.rawh || [], resetAt: P.db.resetAt || null } });
  function off(e) {
    if (/parking_lot|schema cache|does not exist/i.test((e && e.message) || '')) { S.off = true; S.note = '⚠ 서버에 주차장 표가 아직 없어 이 PC에만 저장됩니다. (supabase/parking.sql 실행 필요)'; return true; }
    S.note = '⚠ 서버에 저장하지 못했습니다. 잠시 뒤 다시 저장합니다. (' + ((e && e.message) || e) + ')'; return false;
  }
  async function pull() {
    if (S.off) return 0;
    try {
      const heads = [];
      for (let o = 0; ; o += 1000) {
        let qy = sb.from('parking_lot').select('code,updated_at').order('updated_at').order('code').range(o, o + 999);
        if (S.at) qy = qy.gt('updated_at', S.at);
        const { data, error } = await qy; if (error) throw error;
        heads.push(...data); if (data.length < 1000) break;
      }
      const want = heads.filter((h) => S.ver[h.code] !== h.updated_at).map((h) => h.code);
      const rows = [];
      for (let i = 0; i < want.length; i += 300) {
        const { data, error } = await sb.from('parking_lot').select('code,data,updated_at').in('code', want.slice(i, i + 300)); if (error) throw error;
        rows.push(...data);
        if (want.length > 1000) { S.note = `☁ 서버에서 명단 받는 중… ${Math.min(i + 300, want.length).toLocaleString()} / ${want.length.toLocaleString()}곳`; if (!Object.keys(P.db.list).length) P.msg = S.note; paint(); }
      }
      const m = rows.find((r) => r.code === '_meta');
      if (m && m.data && m.data.resetAt && m.data.resetAt !== (P.db.resetAt || null) && S.at) { P.db = { list: {}, resetAt: m.data.resetAt }; Object.assign(S, { sent: {}, ver: {}, at: '' }); return pull(); }
      if (m && m.data) { Object.assign(P.db, { fileAt: m.data.fileAt, fileCnt: m.data.fileCnt, rawh: m.data.rawh || P.db.rawh, resetAt: m.data.resetAt || null }); }
      rows.forEach((r) => {
        S.ver[r.code] = r.updated_at;
        if (r.code === '_meta') { S.sent._meta = h32(JSON.stringify(meta())); return; }
        if (r.data) P.db.list[r.code] = unrow(r.data); else delete P.db.list[r.code];
        S.sent[r.code] = h32(JSON.stringify(row(r.code)));
      });
      if (heads.length) S.at = heads.reduce((x, h) => (h.updated_at > x ? h.updated_at : x), S.at || '');
      if (rows.length) await iset(DBKEY, P.db).catch(() => {});
      if (heads.length) await keepSent();
      S.note = rows.length ? `☁ 서버 명단과 맞췄습니다 (바뀐 곳 ${(rows.length - (m ? 1 : 0)).toLocaleString()}곳 받음)` : '☁ 서버 명단과 같습니다. 어느 PC에서든 같은 명단이 보입니다.';
      if (/서버에서 명단 받는/.test(P.msg)) P.msg = '';
      schedule(0);
      return rows.length;
    } catch (e) { off(e); return 0; }
  }
  async function push() {
    if (S.off || !P.db) return;
    if (S.busy) { S.again = true; return; }
    S.busy = true;
    try {
      do {
        S.again = false;
        const rows = [], hs = {};
        Object.keys(P.db.list).forEach((c) => { const r = row(c), h = h32(JSON.stringify(r)); if (S.sent[c] !== h) { rows.push(r); hs[c] = h; } });
        Object.keys(S.sent).forEach((c) => { if (c !== '_meta' && !P.db.list[c]) { rows.push({ code: c, data: null }); hs[c] = 'gone'; } });   // 직접 추가했다 지운 곳
        const mm = meta(), mh = h32(JSON.stringify(mm));
        if (S.sent._meta !== mh) { rows.unshift(mm); hs._meta = mh; }
        for (let i = 0; i < rows.length; i += 300) {
          const part = rows.slice(i, i + 300);
          const { data, error } = await sb.from('parking_lot').upsert(part).select('code,updated_at'); if (error) throw error;
          part.forEach((r) => { if (hs[r.code] === 'gone') delete S.sent[r.code]; else S.sent[r.code] = hs[r.code]; });
          (data || []).forEach((r) => { S.ver[r.code] = r.updated_at; });
          if (rows.length > 300) { S.note = `☁ 서버에 저장하는 중… ${Math.min(i + 300, rows.length).toLocaleString()} / ${rows.length.toLocaleString()}곳`; paint(); }
        }
        if (rows.length) { await keepSent(); S.note = `☁ 서버에 저장됨 (${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })})`; }
      } while (S.again);
    } catch (e) { if (!off(e)) schedule(20000); }
    S.busy = false; paint();
  }
  function schedule(ms) { if (S.off || S.timer) return; S.timer = setTimeout(() => { S.timer = 0; push(); }, ms != null ? ms : 1500); }
  window.addEventListener('beforeunload', (e) => { if (S.timer || S.busy) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- 파일 올리기 ---------- */
  async function readFile(file) {
    const db = await load();
    P.msg = '파일을 읽는 중… (전국 파일은 10초쯤 걸립니다)'; paint();
    try {
      await loadXlsxLib();
      const buf = await file.arrayBuffer();
      let wb;
      if (/\.csv$/i.test(file.name)) {   // 공공데이터 csv 는 대부분 EUC-KR(cp949)
        let text = new TextDecoder('utf-8').decode(buf);
        if (/�/.test(text.slice(0, 2000))) { try { text = new TextDecoder('euc-kr').decode(buf); } catch (e) {} }
        wb = XLSX.read(text, { type: 'string' });
      } else wb = XLSX.read(buf, { type: 'array' });
      let rows = [];
      wb.SheetNames.forEach((sn) => { const r = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: false }); if (r.length > rows.length) rows = r; });
      const norm = (h) => String(h || '').replace(/\s|\(.*?\)/g, '');
      const hi = rows.findIndex((r) => r.some((c) => norm(c) === '주차장관리번호'));
      if (hi < 0) throw new Error('파일에서 "주차장관리번호" 칸을 찾지 못했습니다. data.go.kr의 "전국주차장정보표준데이터" 파일(csv · xls)인지 확인해 주세요.');
      const H = rows[hi].map(norm), col = (n) => H.indexOf(norm(n));
      const C = { id: col('주차장관리번호'), name: col('주차장명'), kind: col('주차장구분'), type: col('주차장유형'), doro: col('소재지도로명주소'), jibun: col('소재지지번주소'), spaces: col('주차구획수'),
        mgr: col('관리기관명'), tel: col('전화번호'), lat: col('위도'), lng: col('경도'), fee: col('요금정보'), date: col('데이터기준일자') };
      const g = (r, i) => (i >= 0 ? String(r[i] == null ? '' : r[i]).trim() : '');
      const seen = {}; let cnt = 0, phones = 0;
      rows.slice(hi + 1).forEach((r) => {
        const id = g(r, C.id), name = g(r, C.name); if (!id || !name) return;
        const doro = g(r, C.doro), jibun = g(r, C.jibun), addr = doro || jibun;
        let code = 'P' + id + '~' + h32(name + '|' + addr);
        seen[code] = (seen[code] || 0) + 1; if (seen[code] > 1) code += '#' + seen[code];
        const t = addr.split(/\s+/);
        const raw = {}; rows[hi].forEach((h, i) => { const k = String(h || '').trim(), v = g(r, i); if (k && v) raw[k] = v; });
        const prev = db.list[code] || {};
        db.list[code] = Object.assign(prev, { code, name, kind: g(r, C.kind), type: g(r, C.type), doro, jibun, sido: SIDO_SHORT(t[0]), sgg: t[1] || '', spaces: num(g(r, C.spaces)),
          mgr: g(r, C.mgr), tel: digits(g(r, C.tel)), lat: g(r, C.lat), lng: g(r, C.lng), fee: g(r, C.fee), date: g(r, C.date), file: true, raw });
        cnt++; if (db.list[code].tel) phones++;
      });
      if (!cnt) throw new Error('파일에서 주차장을 하나도 읽지 못했습니다.');
      db.fileAt = new Date().toISOString().slice(0, 10); db.fileCnt = cnt;
      await save();
      P.msg = `파일에서 주차장 ${cnt.toLocaleString()}곳을 읽었습니다 (전화번호 있는 곳 ${phones.toLocaleString()}곳). 직접 고친 전화 · 메모와 지운 곳은 그대로 둡니다.`;
    } catch (e) { P.msg = e.message; }
    draw();
  }

  /* ---------- 찾기 ---------- */
  const merged = (a) => { const my = a.my || {}; return Object.assign({}, a, { tel: my.tel !== undefined ? my.tel : a.tel, memo: my.memo || '' }); };
  const all = () => Object.values(P.db.list).filter((a) => !a.hidden).map(merged);
  const QF = [['all', '전체'], ['name', '주차장명'], ['addr', '주소'], ['tel', '전화번호'], ['mgr', '관리기관'], ['memo', '메모']];
  function match(x, f, qq, qd) {
    const has = (...v) => v.join(' ').replace(/\s/g, '').includes(qq);
    const tl = () => qd.length >= 3 && digits(x.tel).includes(qd);
    if (f === 'name') return has(x.name);
    if (f === 'addr') return has(x.sido, x.sgg, x.doro, x.jibun);
    if (f === 'tel') return tl();
    if (f === 'mgr') return has(x.mgr);
    if (f === 'memo') return has(x.memo);
    return has(x.name, x.doro, x.jibun, x.mgr, x.memo) || tl();
  }
  function filtered() {
    const qq = P.q.replace(/\s/g, ''), qd = digits(P.q), reg = new Set(D.sites.map((x) => nmKey(x.name)));
    return all().filter((x) => (!P.sidos.length || P.sidos.includes(x.sido)) && (!P.sggs.length || P.sggs.includes(x.sido + '|' + x.sgg)) && (!P.kind || x.kind === P.kind) && (!P.type || x.type === P.type)
        && (!P.min || (x.spaces || 0) >= P.min) && (!P.max || (x.spaces || 0) <= P.max) && (!P.hasAddr || x.doro || x.jibun) && (!P.noAddr || !(x.doro || x.jibun)) && (!P.hasTel || x.tel) && (!P.noTel || !x.tel) && (!P.notReg || !reg.has(nmKey(x.name)))
        && (!qq || match(x, P.qf, qq, qd)))
      .sort((a, b) => KO.compare(a.sido + a.sgg + a.name, b.sido + b.sgg + b.name));
  }

  /* ---------- 고치기 · 삭제 · 직접 추가 ---------- */
  function edit(code) {
    const a = code ? P.db.list[code] : null, x = a ? merged(a) : {};
    const raw = (a && a.raw) || {};
    modal(`<h3>${a ? esc(x.name) : '＋ 주차장 직접 추가'}</h3>
      ${a ? `<p class="hint" style="margin:0 0 8px">${esc(x.doro || x.jibun || '')} · ${esc([x.kind, x.type].filter(Boolean).join(' '))}${x.spaces ? ` · ${x.spaces}면` : ''}${x.mgr ? ` · ${esc(x.mgr)}` : ''}</p>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${a ? '' : `<label>주차장명<input id="pe-name"></label><label>면수<input id="pe-sp" inputmode="numeric"></label><label style="grid-column:1/-1">주소<input id="pe-addr" placeholder="예) 경기도 안양시 동안구 ○○로 12"></label>
        <label>구분<select id="pe-kind"><option>공영</option><option>민영</option></select></label><label>유형<select id="pe-type"><option>노외</option><option>노상</option><option>부설</option></select></label>
        <label style="grid-column:1/-1">관리기관<input id="pe-mgr"></label>`}
        <label>전화<input id="pe-tel" inputmode="tel" value="${esc(tel(x.tel || ''))}"></label><span></span>
        <label style="grid-column:1/-1">메모<textarea id="pe-memo" rows="2" placeholder="예) 시설관리공단 담당자 통화함 · 차단기 노후">${esc(x.memo || '')}</textarea></label>
      </div>
      <p class="hint" style="margin:6px 0 0">고친 값은 서버에 저장되어 다른 PC에서도 보이고, 새 파일을 올려도 덮어쓰지 않습니다.</p>
      ${Object.keys(raw).length ? `<details style="margin-top:8px"><summary class="hint" style="cursor:pointer">공공데이터 전체 정보 (${Object.keys(raw).length}개 항목)</summary><div class="tbl-wrap" style="max-height:40vh;overflow:auto"><table><tbody>${Object.keys(raw).map((k) => `<tr><th style="white-space:nowrap;text-align:left">${esc(k)}</th><td>${esc(raw[k])}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
      <div class="btns" style="margin-top:12px"><button class="btn btn-primary" type="button" id="pe-save">저장</button>${a ? '<button class="btn btn-line" type="button" id="pe-del" style="color:var(--stop)">명단에서 삭제</button>' : ''}<button class="btn btn-line" type="button" data-close>닫기</button></div>`, { lock: true });
    const v = (id) => (document.getElementById(id) || {}).value || '';
    document.getElementById('pe-save').onclick = () => {
      const t = digits(v('pe-tel')), memo = v('pe-memo').trim();
      if (a) {
        const my = Object.assign({}, a.my || {});
        if (t !== digits(a.tel)) my.tel = t; else delete my.tel;
        if (memo) my.memo = memo; else delete my.memo;
        a.my = my;
      } else {
        const name = v('pe-name').trim(); if (!name) { alert('주차장명을 넣어 주세요.'); return; }
        const addr = v('pe-addr').trim(), tk = addr.split(/\s+/), code2 = 'M' + Date.now().toString(36).toUpperCase();
        P.db.list[code2] = { code: code2, name, kind: v('pe-kind'), type: v('pe-type'), doro: addr, jibun: '', sido: SIDO_SHORT(tk[0]), sgg: tk[1] || '', spaces: num(v('pe-sp')), mgr: v('pe-mgr').trim(), tel: '', manual: true, my: { tel: t, memo } };
      }
      closeModal(); save(); P.msg = a ? `"${x.name}" 고친 내용을 저장했습니다.` : '주차장을 추가했습니다.'; draw();
    };
    const del = document.getElementById('pe-del');
    if (del) del.onclick = () => {
      if (!confirm(`"${x.name}"을(를) 명단에서 지울까요?\n(새 파일을 올려도 다시 나타나지 않습니다)`)) return;
      if (a.manual) delete P.db.list[code]; else a.hidden = true;
      closeModal(); save(); P.msg = `"${x.name}"을(를) 명단에서 지웠습니다.`; draw();
    };
  }

  /* ---------- 엑셀 · 고객사 리스트 ---------- */
  async function excel(list) {
    await loadXlsxLib();
    const head = ['시·도', '시·군·구', '주차장명', '구분', '유형', '주차면수', '관리기관', '전화', '메모', '도로명 주소', '지번 주소'];
    const extra = []; list.forEach((x) => Object.keys(x.raw || {}).forEach((k) => { if (!extra.includes(k) && !/^(주차장명|주차장구분|주차장유형|소재지도로명주소|소재지지번주소|주차구획수|관리기관명|전화번호)$/.test(k)) extra.push(k); }));
    const rows = list.map((x) => [x.sido, x.sgg, x.name, x.kind, x.type, x.spaces || '', x.mgr, tel(x.tel), x.memo, x.doro, x.jibun].concat(extra.map((k) => (x.raw || {})[k] || '')));
    const ws = XLSX.utils.aoa_to_sheet([head.concat(extra)].concat(rows));
    ws['!cols'] = [6, 10, 28, 6, 6, 8, 20, 14, 24, 36, 36].concat(extra.map(() => 14)).map((w) => ({ wch: w }));
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: head.length + extra.length - 1 } }) };
    const note = XLSX.utils.aoa_to_sheet([['마하파킹 — 주차장 명단'], [`받은 날: ${today()}  ·  ${rows.length.toLocaleString()}곳`], ['출처: 공공데이터포털 전국주차장정보표준데이터 (각 지자체 등록)'], ['※ 광고 문자·팩스는 받는 분이 미리 동의한 경우에만 보낼 수 있습니다 (정보통신망법 제50조).']]);
    note['!cols'] = [{ wch: 90 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '주차장'); XLSX.utils.book_append_sheet(wb, note, '안내');
    XLSX.writeFile(wb, `마하파킹_주차장명단_${[...new Set(list.map((x) => x.sido))].slice(0, 3).join('_') || '전국'}_${today()}.xlsx`);
  }
  async function toSites(list) {
    const reg = new Set(D.sites.map((x) => nmKey(x.name)));
    const fresh = list.filter((x) => !reg.has(nmKey(x.name)));
    if (!fresh.length) { P.msg = '모두 이미 고객사 리스트에 있습니다.'; paint(); return; }
    if (!confirm(`${fresh.length.toLocaleString()}곳을 고객사 리스트에 "영업 대상"으로 넣을까요?\n(같은 이름이 이미 있는 ${(list.length - fresh.length).toLocaleString()}곳은 건너뜁니다)`)) return;
    const rows = fresh.map((x) => ({ name: x.name, kind: x.kind === '공영' ? '공영주차장' : '주차장', region: [x.sido, x.sgg].filter(Boolean).join(' ') || null, address: x.doro || x.jibun || null,
      office_tel: digits(x.tel) || null, status: 'lead', memo: [`${x.kind || ''} ${x.type || ''} ${x.spaces ? x.spaces + '면' : ''}`.trim(), x.mgr && `관리기관 ${x.mgr}`, x.memo].filter(Boolean).join(' · '), updated_at: nowIso() }));
    let done = 0;
    try {
      for (let i = 0; i < rows.length; i += 200) {
        const { data, error } = await sb.from('sites').insert(rows.slice(i, i + 200)).select(); if (error) throw error;
        D.sites.push(...data); done += data.length; P.msg = `고객사 리스트에 넣는 중… ${done.toLocaleString()} / ${rows.length.toLocaleString()}`; paint();
      }
      P.msg = `${done.toLocaleString()}곳을 고객사 리스트에 넣었습니다.`;
    } catch (e) { P.msg = `${done.toLocaleString()}곳까지 넣고 멈췄습니다: ${e.message}`; }
    draw();
  }

  /* ---------- 화면 ---------- */
  function paint() {
    const root = body(); if (!root || !isOpen()) return;
    const m = root.querySelector('#pk-msg'); if (m) { m.textContent = P.msg; m.style.display = P.msg ? '' : 'none'; }
    const s = root.querySelector('#pk-sync'); if (s) s.textContent = S.note;
  }
  async function draw() {
    if (!P.db) { body().innerHTML = '<p class="hint">불러오는 중…</p>'; await load(); if (!isOpen()) return; }
    const db = P.db, every = all(), started = every.length > 0;
    const list = started ? filtered() : [], show = list.slice(0, P.limit);
    const reg = new Set(D.sites.map((x) => nmKey(x.name)));
    const cnt = (f) => every.filter(f).length;
    const sidos = [...new Set(every.map((x) => x.sido))].sort((a, b) => KO.compare(a, b));
    const sggs = !P.sidos.length ? [] : [...new Set(every.filter((x) => x.sgg && P.sidos.includes(x.sido)).map((x) => x.sido + '|' + x.sgg))]
      .sort((a, b) => KO.compare(a, b)).map((k) => { const [d, g] = k.split('|'); return [k, P.sidos.length > 1 ? `${d} ${g}` : g]; });
    const hidden = Object.values(db.list).filter((a) => a.hidden).length;
    const fileBtn = (label, cls) => `<label class="btn ${cls}" style="cursor:pointer">${label}<input type="file" id="pk-file" accept=".csv,.xls,.xlsx" style="display:none"></label>`;
    const how = '<a href="https://www.data.go.kr/data/15012896/standard.do" target="_blank" rel="noopener"><b>data.go.kr → 전국주차장정보표준데이터</b></a>에서 csv 또는 xls 파일을 내려받아 올립니다. (전국 공영·민영 주차장 약 1만 9천 곳 · 관리기관 전화 포함 · 매월 갱신)';
    body().innerHTML = `
      <p id="pk-sync" class="hint" style="margin:0 0 8px;font-weight:700">${esc(S.note)}</p>
      ${started ? `<div class="kp-sum">
        <div><b>${every.length.toLocaleString()}</b><span>주차장</span></div>
        <div><b>${cnt((x) => x.tel).toLocaleString()}</b><span>전화번호</span></div>
        <div><b>${cnt((x) => (x.spaces || 0) >= 100).toLocaleString()}</b><span>100면 이상</span></div>
        <div class="kp-file"><span class="hint">${db.fileAt ? `파일 기준 ${esc(db.fileAt)}` : '직접 모은 명단'}</span>${fileBtn('📂 새 파일로 갱신', 'btn-line btn-sm')}</div>
      </div>` : `<div class="sl-step"><b><span class="sl-no">1</span>공공데이터 파일 올리기</b><p class="hint" style="margin:4px 0 10px">${how}</p>${fileBtn('📂 파일 올리기', 'btn-cta')}</div>`}
      <p id="pk-msg" role="status" style="margin:8px 0;font-weight:700;white-space:pre-wrap;${P.msg ? '' : 'display:none'}">${esc(P.msg)}</p>
      ${started ? `
      <div class="kp-filter">
        ${mselHtml({ id: 'pk-sido', all: '전국', options: sidos.map((d) => [d, d]), selected: P.sidos })}
        ${mselHtml({ id: 'pk-sgg', all: '시·군·구 전체', placeholder: '시·군·구 (시·도를 먼저)', options: sggs, selected: P.sggs })}
        <div class="kp-search"><select id="pk-qf" aria-label="찾을 곳">${QF.map(([v, n]) => `<option value="${v}"${(P.qf || 'all') === v ? ' selected' : ''}>${n}</option>`).join('')}</select><input id="pk-q" type="search" placeholder="${{ all: '검색어', name: '예) 시청 주차장', addr: '예) 동안구, 관악대로', tel: '예) 031-8045', mgr: '예) 시설관리공단', memo: '메모 내용' }[P.qf || 'all']}" value="${esc(P.q)}"></div>
        <label class="kp-hh">면수 <input id="pk-min" inputmode="numeric" value="${P.min || ''}" placeholder="0" aria-label="면수 이상"> 이상 ~ <input id="pk-max" inputmode="numeric" value="${P.max || ''}" placeholder="제한 없음" aria-label="면수 이하"> 이하</label>
      </div>
      <div class="kp-filter kp-chk">
        <select id="pk-kind"><option value="">공영 · 민영</option>${['공영', '민영'].map((k) => `<option${P.kind === k ? ' selected' : ''}>${k}</option>`).join('')}</select>
        <select id="pk-type"><option value="">노상 · 노외 · 부설</option>${['노외', '노상', '부설'].map((k) => `<option${P.type === k ? ' selected' : ''}>${k}</option>`).join('')}</select>
        <label class="sl-chk"><input type="checkbox" id="pk-tel"${P.hasTel ? ' checked' : ''}> 전화 있는 곳만</label>
        <label class="sl-chk"><input type="checkbox" id="pk-notel"${P.noTel ? ' checked' : ''}> 전화 없는 곳만</label>
        <label class="sl-chk"><input type="checkbox" id="pk-hasaddr"${P.hasAddr ? ' checked' : ''}> 주소 있는 곳만</label>
        <label class="sl-chk"><input type="checkbox" id="pk-noaddr"${P.noAddr ? ' checked' : ''}> 주소 없는 곳만</label>
        <label class="sl-chk"><input type="checkbox" id="pk-notreg"${P.notReg ? ' checked' : ''}> 고객사 리스트에 없는 곳만</label>
        ${P.q || P.sidos.length || P.min || P.max || P.kind || P.type || P.hasTel || P.noTel || P.hasAddr || P.noAddr || P.notReg ? '<button class="btn btn-line btn-sm" type="button" id="pk-clear">조건 지우기</button>' : ''}
      </div>
      <div class="kp-bar"><span class="kp-count"><b>${list.length.toLocaleString()}</b>곳</span>
        <div class="btns"><button class="btn btn-primary btn-sm" type="button" id="pk-xlsx"${list.length ? '' : ' disabled'}>⬇ 엑셀 저장</button><button class="btn btn-line btn-sm" type="button" id="pk-imp"${list.length ? '' : ' disabled'}>＋ 고객사 리스트에 넣기</button><button class="btn btn-line btn-sm" type="button" id="pk-add">＋ 주차장 직접 추가</button></div></div>
      <div class="tbl-wrap kp-tbl"><table><thead><tr><th>지역</th><th>주차장명 · 주소 <span class="hint" style="font-weight:400">(누르면 고치기 · 삭제)</span></th><th>구분</th><th>면수</th><th>관리기관 · 전화</th></tr></thead><tbody>
        ${show.length ? show.map((x) => `<tr data-pk="${esc(x.code)}"><td>${esc([x.sido, x.sgg].filter(Boolean).join(' '))}</td><td><b>${esc(x.name)}</b>${reg.has(nmKey(x.name)) ? ' <span class="status st-sent">등록됨</span>' : ''}${x.manual ? ' <span class="hint">(직접 추가)</span>' : ''}${x.memo ? `<br><span class="hint" style="color:var(--brand)">📝 ${esc(x.memo)}</span>` : ''}${x.doro || x.jibun ? `<br><span class="hint">${esc(x.doro || x.jibun)}</span>` : ''}</td><td style="white-space:nowrap">${esc([x.kind, x.type].filter(Boolean).join(' · '))}</td><td>${x.spaces || ''}</td><td>${x.mgr ? `<span class="hint">${esc(x.mgr)}</span><br>` : ''}${x.tel ? `<a href="tel:${digits(x.tel)}">${esc(tel(x.tel))}</a>` : '<span class="hint">-</span>'}</td></tr>`).join('') : '<tr><td colspan="5" class="hint">조건에 맞는 주차장이 없습니다.</td></tr>'}
      </tbody></table></div>
      ${list.length > show.length ? `<div class="btns" style="justify-content:center;margin-top:8px"><button class="btn btn-line btn-sm" type="button" id="pk-more">더 보기 (${show.length.toLocaleString()} / ${list.length.toLocaleString()})</button></div>` : ''}
      <details class="kp-more"><summary>⚙ 명단 관리</summary>
        <p class="hint">${hidden ? `명단에서 지운 주차장 ${hidden.toLocaleString()}곳 (새 파일을 올려도 나타나지 않습니다)` : '지운 주차장이 없습니다.'}</p>
        <div class="btns">${hidden ? '<button class="btn btn-line btn-sm" type="button" id="pk-unhide">지운 곳 모두 되살리기</button>' : ''}<button class="btn btn-line btn-sm" type="button" id="pk-reset" style="color:var(--stop)">명단 전체 지우기</button></div>
        <p class="hint" style="margin-top:8px">${how}</p>
        <p class="hint">전화번호는 지자체가 올린 <b>관리기관(구청 주차 담당 · 시설관리공단 등)</b> 번호인 경우가 많습니다.</p>
      </details>` : ''}
      <p class="hint" style="margin-top:14px">⚠ 이 명단은 전화·방문·우편(DM) 영업용입니다. 광고 문자·팩스는 받는 분이 미리 동의한 경우에만 보낼 수 있습니다 (정보통신망법 제50조).</p>`;
    const $ = (s) => body().querySelector(s), on = (s, ev, fn) => { const el = $(s); if (el) el[ev] = fn; };
    const re = () => { P.msg = ''; P.limit = 100; draw(); };
    on('#pk-file', 'onchange', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) readFile(f); });
    mselBind(body(), 'pk-sido', (v) => { P.sidos = v; P.sggs = P.sggs.filter((k) => v.includes(k.split('|')[0])); re(); });
    mselBind(body(), 'pk-sgg', (v) => { P.sggs = v; re(); });
    on('#pk-q', 'onchange', (e) => { P.q = e.target.value; re(); });
    on('#pk-qf', 'onchange', (e) => { P.qf = e.target.value; if (P.q) re(); else draw(); });
    on('#pk-max', 'onchange', (e) => { P.max = parseInt(digits(e.target.value), 10) || 0; re(); });
    on('#pk-min', 'onchange', (e) => { P.min = parseInt(digits(e.target.value), 10) || 0; re(); });
    on('#pk-kind', 'onchange', (e) => { P.kind = e.target.value; re(); });
    on('#pk-type', 'onchange', (e) => { P.type = e.target.value; re(); });
    on('#pk-tel', 'onchange', (e) => { P.hasTel = e.target.checked; if (P.hasTel) P.noTel = false; re(); });
    on('#pk-notel', 'onchange', (e) => { P.noTel = e.target.checked; if (P.noTel) P.hasTel = false; re(); });
    on('#pk-hasaddr', 'onchange', (e) => { P.hasAddr = e.target.checked; if (P.hasAddr) P.noAddr = false; re(); });
    on('#pk-noaddr', 'onchange', (e) => { P.noAddr = e.target.checked; if (P.noAddr) P.hasAddr = false; re(); });
    on('#pk-notreg', 'onchange', (e) => { P.notReg = e.target.checked; re(); });
    on('#pk-clear', 'onclick', () => { Object.assign(P, { q: '', qf: 'all', sidos: [], sggs: [], min: 0, max: 0, kind: '', type: '', hasTel: false, noTel: false, hasAddr: false, noAddr: false, notReg: false }); re(); });
    on('#pk-more', 'onclick', () => { P.limit += 300; draw(); });
    on('#pk-xlsx', 'onclick', async () => { try { await excel(list); } catch (e) { P.msg = e.message; paint(); } });
    on('#pk-imp', 'onclick', () => toSites(list));
    on('#pk-add', 'onclick', () => edit(null));
    on('#pk-unhide', 'onclick', () => { let n = 0; Object.values(db.list).forEach((a) => { if (a.hidden) { delete a.hidden; n++; } }); save(); P.msg = `${n.toLocaleString()}곳을 되살렸습니다.`; draw(); });
    on('#pk-reset', 'onclick', async () => {
      if (!confirm('주차장 명단 전체를 지울까요?\n(서버에서도 지워져 모든 PC에서 비게 됩니다. 고객사 리스트는 그대로입니다)')) return;
      P.msg = '지우는 중…'; paint();
      P.db = { list: {}, resetAt: new Date().toISOString() };
      if (!S.off) { const { error } = await sb.from('parking_lot').delete().neq('code', '_meta'); if (error) off(error); }
      Object.assign(S, { sent: {}, ver: {} }); await keepSent(); await save(); P.msg = ''; draw();
    });
    body().querySelectorAll('[data-pk]').forEach((tr) => { tr.onclick = (e) => { if (e.target.closest('a')) return; edit(tr.dataset.pk); }; });
  }
  return { draw };
}
