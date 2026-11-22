/* 🏘 빌라 · 소규모 공동주택 명단 — 관리자 "건물 목록 수집"의 네 번째 탭
 *  건축물대장 표제부(국토교통부 건축HUB, api/bld.js)에서 시·군·구를 골라 받아 옵니다.
 *  아파트(K-apt에 안 나오는 소규모 단지 포함) · 연립 · 다세대(빌라) · 도시형생활주택 · 기숙사만 골라
 *  같은 대지(지번)에 있는 여러 동을 한 곳으로 묶습니다. 세대수 · 주차대수(기계식 포함) · 층수 · 사용승인일.
 *  건축물대장에는 전화번호가 없습니다 → 방문 · 우편(DM)용. 전화는 직접 넣거나 🔎 하나씩 찾기로.
 *  이 PC(IndexedDB)는 빨리 열기 위한 복사본이고, 진짜 명단은 서버 표 house_bld 에 있습니다.
 */
import { mselHtml, mselBind } from './msel.js';
export function makeHouse(ctx) {
  const { sb, body, D, digits, tel, nowIso, loadXlsxLib, isOpen, api } = ctx;
  const P = { db: null, loading: null, msg: '', q: '', qf: 'all', sidos: [], sggs: [], kinds: [], min: 0, max: 0, pmin: 0, mech: false, hasTel: false, noTel: false, notReg: false, limit: 100, busy: false, stop: false, pickSido: [], pickSgg: [] };
  const S = { sent: {}, ver: {}, at: '', off: false, busy: false, again: false, timer: 0, note: '' };
  const DBKEY = 'maha_house_v1', SENTKEY = 'maha_house_sent_v1';
  const KO = new Intl.Collator('ko');
  const h32 = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + s.length.toString(36); };
  const nmKey = (s) => String(s || '').replace(/\s|\(.*?\)/g, '');
  const SIDO_SHORT = (s) => String(s || '').replace(/특별자치시|특별자치도|특별시|광역시/, '').replace(/^(경상|전라|충청)(남|북)도$/, (m, a, b) => a[0] + b).replace(/도$/, '') || '기타';
  const KINDS = ['아파트', '연립', '다세대', '도시형생활주택', '기숙사', '기타'];
  let BJD = null;   // { 시군구코드: [이름, [[법정동코드, 동이름], …]] } (assets/collect/bjd.json, 행정표준코드 법정동)
  async function bjd() { if (!BJD) BJD = await fetch('/assets/collect/bjd.json').then((r) => r.json()); return BJD; }

  /* ---------- 이 PC 복사본 (IndexedDB) ---------- */
  const idb = () => new Promise((ok, no) => { const r = indexedDB.open('maha_house', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  async function iget(k) { const d = await idb(); return new Promise((ok) => { const t = d.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => ok(t.result); t.onerror = () => ok(null); }); }
  async function iset(k, v) { const d = await idb(); return new Promise((ok, no) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => ok(); t.onerror = () => no(t.error); }); }
  async function load() {
    if (P.db) return P.db;
    if (P.loading) return P.loading;
    P.loading = (async () => {
      try { P.db = await iget(DBKEY); } catch (e) { P.db = null; }
      if (!P.db) P.db = { list: {}, done: {} };
      if (!P.db.done) P.db.done = {};
      try { const s = await iget(SENTKEY); if (s) Object.assign(S, { sent: s.sent || {}, ver: s.ver || {}, at: s.at || '' }); } catch (e) {}
      if (Object.keys(P.db.list).length) { S.note = '☁ 서버와 맞추는 중…'; pull().then((n) => { if (n && isOpen() && !P.busy) draw(); else paint(); }); } else await pull();
      return P.db;
    })();
    try { return await P.loading; } finally { P.loading = null; }
  }
  async function save() { try { await iset(DBKEY, P.db); } catch (e) {} schedule(); }
  const keepSent = () => iset(SENTKEY, { sent: S.sent, ver: S.ver, at: S.at }).catch(() => {});

  /* ---------- 서버 표 house_bld (code, data jsonb, updated_at) ---------- */
  function row(code) {   // 칸 이름은 _meta 에 한 번만, 값은 순서대로(rv) — 용량 줄이기
    const a = P.db.list[code]; if (!a) return { code, data: null };
    const o = Object.assign({}, a);
    if (a.raw) { const H = P.db.rawh || (P.db.rawh = []), rv = []; Object.keys(a.raw).forEach((k) => { let i = H.indexOf(k); if (i < 0) { H.push(k); i = H.length - 1; } rv[i] = a.raw[k]; }); for (let i = 0; i < rv.length; i++) if (rv[i] === undefined) rv[i] = null; o.rv = rv; delete o.raw; }
    return { code, data: o };
  }
  const unrow = (d) => { if (!d || !d.rv) return d; const H = P.db.rawh || [], raw = {}; d.rv.forEach((v, i) => { if (v != null && H[i]) raw[H[i]] = v; }); const o = Object.assign({}, d, { raw }); delete o.rv; return o; };
  const meta = () => ({ code: '_meta', data: { done: P.db.done || {}, rawh: P.db.rawh || [], resetAt: P.db.resetAt || null } });
  function off(e) {
    if (/house_bld|schema cache|does not exist/i.test((e && e.message) || '')) { S.off = true; S.note = '⚠ 서버에 빌라 명단 표가 아직 없어 이 PC에만 저장됩니다. (supabase/house.sql 실행 필요)'; return true; }
    S.note = '⚠ 서버에 저장하지 못했습니다. 잠시 뒤 다시 저장합니다. (' + ((e && e.message) || e) + ')'; return false;
  }
  async function pull() {
    if (S.off) return 0;
    try {
      const heads = [];
      for (let o = 0; ; o += 1000) {
        let qy = sb.from('house_bld').select('code,updated_at').order('updated_at').order('code').range(o, o + 999);
        if (S.at) qy = qy.gt('updated_at', S.at);
        const { data, error } = await qy; if (error) throw error;
        heads.push(...data); if (data.length < 1000) break;
      }
      const want = heads.filter((h) => S.ver[h.code] !== h.updated_at).map((h) => h.code);
      const rows = [];
      for (let i = 0; i < want.length; i += 300) {
        const { data, error } = await sb.from('house_bld').select('code,data,updated_at').in('code', want.slice(i, i + 300)); if (error) throw error;
        rows.push(...data);
        if (want.length > 1000) { S.note = `☁ 서버에서 명단 받는 중… ${Math.min(i + 300, want.length).toLocaleString()} / ${want.length.toLocaleString()}곳`; if (!Object.keys(P.db.list).length) P.msg = S.note; paint(); }
      }
      const m = rows.find((r) => r.code === '_meta');
      if (m && m.data && m.data.resetAt && m.data.resetAt !== (P.db.resetAt || null) && S.at) { P.db = { list: {}, done: {}, resetAt: m.data.resetAt }; Object.assign(S, { sent: {}, ver: {}, at: '' }); return pull(); }
      if (m && m.data) { Object.assign(P.db, { done: Object.assign({}, P.db.done || {}, m.data.done || {}), rawh: m.data.rawh || P.db.rawh, resetAt: m.data.resetAt || null }); }
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
          const { data, error } = await sb.from('house_bld').upsert(part).select('code,updated_at'); if (error) throw error;
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
  window.addEventListener('beforeunload', (e) => { if (S.timer || S.busy || P.busy) { e.preventDefault(); e.returnValue = ''; } });


  /* ---------- 건축물대장에서 받아 오기 ---------- */
  const kindOf = (main, etc) => { const t = `${main} ${etc}`; return /도시형/.test(t) ? '도시형생활주택' : /아파트/.test(main) ? '아파트' : /연립/.test(t) ? '연립' : /다세대/.test(t) ? '다세대' : /기숙사/.test(t) ? '기숙사' : /아파트/.test(etc) ? '아파트' : '기타'; };
  const RANK = { 도시형생활주택: 1, 아파트: 2, 연립: 3, 다세대: 4, 기숙사: 5, 기타: 6 };
  function recalc(a) {   // 같은 대지의 여러 동 합치기
    const bs = Object.values(a.b || {});
    a.hh = bs.reduce((s, x) => s + (x[0] || 0), 0); a.park = bs.reduce((s, x) => s + (x[1] || 0), 0); a.mech = bs.reduce((s, x) => s + (x[2] || 0), 0);
    a.flr = Math.max(0, ...bs.map((x) => x[3] || 0)); a.dongs = bs.length;
    a.use = bs.map((x) => x[4]).filter(Boolean).sort()[0] || '';
    a.kind = bs.map((x) => kindOf(x[6], x[7])).sort((p, q) => RANK[p] - RANK[q])[0] || '기타';
    const nm = [...new Set(bs.map((x) => x[8]).filter(Boolean))];
    a.name = nm.length ? nm.sort((p, q) => p.length - q.length)[0] : '';
  }
  function addItems(sgc, bcode, dname, list) {
    const db = P.db, full = BJD[sgc][0], tk = full.split(' ');
    list.forEach((x) => {
      const code = x.bun ? `B${sgc}${bcode}-${x.bun}-${x.ji || '0000'}` : `B${x.pk}`;
      const a = db.list[code] || (db.list[code] = { code, sgc, bjd: bcode, sido: SIDO_SHORT(tk[0]), sgg: tk.slice(1).join(' '), dongName: dname, b: {}, file: true });
      a.jibun = (x.plat || '').replace(/\s*번지$/, ''); if (x.doro) a.doro = x.doro;
      a.b[x.pk || x.dong || 'x'] = [x.hh || x.ho || x.fm || 0, (x.pin || 0) + (x.pia || 0) + (x.pom || 0) + (x.poa || 0), (x.pin || 0) + (x.pom || 0), x.flr || 0, (x.use || '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'), x.dong || '', x.main || '', x.etc || '', x.name || ''];
      recalc(a);
    });
  }
  async function fetchSggs(codes) {
    await bjd(); await load();
    P.busy = true; P.stop = false; P.msg = '받기 시작합니다…'; draw();
    const today = new Date().toISOString().slice(0, 10);
    let calls = 0, found = 0, err = '';
    try {
      for (const sgc of codes) {
        if (P.stop || err) break;
        const [full, dongs] = BJD[sgc] || ['', []];
        const todo = dongs.filter(([b]) => !P.db.done[sgc + b]);
        let k = 0, n = 0;
        const worker = async () => {
          while (k < todo.length && !P.stop && !err) {
            const [bc, dn] = todo[k++];
            try {
              for (let page = 1; ; page++) {
                const r = await api('/api/bld', { sigunguCd: sgc, bjdongCd: bc, pageNo: page }); calls++;
                addItems(sgc, bc, dn, r.list); found += r.list.length;
                if (!r.scanned || page * 100 >= r.total) break;
                if (P.stop) return;
              }
              P.db.done[sgc + bc] = today;
            } catch (e) { err = e.message; return; }
            n++;
            P.msg = `${full} 받는 중… ${n} / ${todo.length}개 동 · 공동주택 건물 ${found.toLocaleString()}동 찾음`; paint();
            if (n % 5 === 0) save();
          }
        };
        await Promise.all([worker(), worker(), worker()]);
      }
    } finally {
      P.busy = false; await save();
      const cnt = Object.values(P.db.list).filter((a) => !a.hidden).length;
      P.msg = err ? `멈췄습니다: ${err}` : P.stop ? '멈췄습니다. [▶ 받기]를 누르면 남은 동부터 이어서 받습니다.' : `끝났습니다. 명단 ${cnt.toLocaleString()}곳 (이번에 공공데이터 ${calls.toLocaleString()}번 불러옴).`;
      draw();
    }
  }

  /* ---------- 찾기 ---------- */
  const merged = (a) => { const my = a.my || {}; return Object.assign({}, a, { name: my.name || a.name, tel: my.tel || '', memo: my.memo || '' }); };
  const all = () => Object.values(P.db.list).filter((a) => !a.hidden).map(merged);
  const QF = [['all', '전체'], ['name', '건물명'], ['addr', '주소'], ['tel', '전화번호'], ['memo', '메모']];
  function match(x, f, qq, qd) {
    const has = (...v) => v.join(' ').replace(/\s/g, '').includes(qq);
    const tl = () => qd.length >= 3 && digits(x.tel).includes(qd);
    if (f === 'name') return has(x.name);
    if (f === 'addr') return has(x.sido, x.sgg, x.dongName, x.doro, x.jibun);
    if (f === 'tel') return tl();
    if (f === 'memo') return has(x.memo);
    return has(x.name, x.sgg, x.dongName, x.doro, x.jibun, x.memo) || tl();
  }
  function filtered() {
    const qq = P.q.replace(/\s/g, ''), qd = digits(P.q), reg = new Set(D.sites.map((x) => nmKey(x.name)));
    return all().filter((x) => (!P.sidos.length || P.sidos.includes(x.sido)) && (!P.sggs.length || P.sggs.includes(x.sido + '|' + x.sgg))
        && (!P.kinds.length || P.kinds.includes(x.kind)) && (!P.min || (x.hh || 0) >= P.min) && (!P.max || (x.hh || 0) <= P.max)
        && (!P.pmin || (x.park || 0) >= P.pmin) && (!P.mech || x.mech > 0)
        && (!P.hasTel || x.tel) && (!P.noTel || !x.tel) && (!P.notReg || !reg.has(nmKey(x.name)))
        && (!qq || match(x, P.qf, qq, qd)))
      .sort((a, b) => KO.compare(a.sido + a.sgg + (a.dongName || '') + a.name, b.sido + b.sgg + (b.dongName || '') + b.name));
  }

  /* ---------- 고치기 · 삭제 · 직접 추가 ---------- */
  function edit(code) {
    const a = code ? P.db.list[code] : null, x = a ? merged(a) : {};
    modal(`<h3>${a ? esc(x.name || '(이름 없는 건물)') : '＋ 건물 직접 추가'}</h3>
      ${a ? `<p class="hint" style="margin:0 0 8px">${esc(x.doro || x.jibun || '')} · ${esc(x.kind)}${x.hh ? ` · ${x.hh}세대` : ''}${x.park ? ` · 주차 ${x.park}대${x.mech ? `(기계식 ${x.mech})` : ''}` : ''}${x.dongs > 1 ? ` · ${x.dongs}개 동` : ''}${x.use ? ` · 사용승인 ${esc(x.use)}` : ''}</p>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <label style="grid-column:1/-1">건물명${a ? ' <span class="hint">(건축물대장 이름을 바꿔 부를 때)</span>' : ''}<input id="he-name" value="${esc(a ? (a.my && a.my.name) || '' : '')}" placeholder="${esc(a ? a.name || '' : '예) OO빌라')}"></label>
        ${a ? '' : `<label style="grid-column:1/-1">주소<input id="he-addr" placeholder="예) 경기도 안양시 동안구 ○○로 12"></label><label>구분<select id="he-kind">${KINDS.map((k) => `<option>${k}</option>`).join('')}</select></label><label>세대수<input id="he-hh" inputmode="numeric"></label>`}
        <label>전화 <span class="hint">(관리인 · 건물주 등)</span><input id="he-tel" inputmode="tel" value="${esc(tel(x.tel || ''))}"></label><span></span>
        <label style="grid-column:1/-1">메모<textarea id="he-memo" rows="2" placeholder="예) 기계식 주차 · 리모컨 차단기 노후 · 반상회 때 재방문">${esc(x.memo || '')}</textarea></label>
      </div>
      ${a && x.b ? `<details style="margin-top:8px"><summary class="hint" style="cursor:pointer">건축물대장 동별 정보 (${Object.keys(x.b).length}개 동)</summary><div class="tbl-wrap" style="max-height:40vh;overflow:auto"><table><thead><tr><th>동</th><th>용도</th><th>세대</th><th>주차(기계식)</th><th>층</th><th>사용승인</th></tr></thead><tbody>${Object.values(x.b).map((v) => `<tr><td>${esc(v[5] || v[8] || '-')}</td><td>${esc([v[6], v[7]].filter(Boolean).join(' · '))}</td><td>${v[0] || ''}</td><td>${v[1] || ''}${v[2] ? ` (${v[2]})` : ''}</td><td>${v[3] || ''}</td><td>${esc(v[4] || '')}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
      <div class="btns" style="margin-top:12px"><button class="btn btn-primary" type="button" id="he-save">저장</button>${a ? '<button class="btn btn-line" type="button" id="he-del" style="color:var(--stop)">명단에서 삭제</button>' : ''}<button class="btn btn-line" type="button" data-close>닫기</button></div>`, { lock: true });
    const v = (id) => (document.getElementById(id) || {}).value || '';
    document.getElementById('he-save').onclick = () => {
      const t = digits(v('he-tel')), memo = v('he-memo').trim(), nm = v('he-name').trim();
      if (a) {
        const my = Object.assign({}, a.my || {});
        if (t) my.tel = t; else delete my.tel;
        if (memo) my.memo = memo; else delete my.memo;
        if (nm) my.name = nm; else delete my.name;
        a.my = my;
      } else {
        if (!nm) { alert('건물명을 넣어 주세요.'); return; }
        const addr = v('he-addr').trim(), tk = addr.split(/\s+/), c2 = 'M' + Date.now().toString(36).toUpperCase();
        P.db.list[c2] = { code: c2, name: nm, kind: v('he-kind'), doro: addr, jibun: '', sido: SIDO_SHORT(tk[0]), sgg: tk[1] || '', dongName: '', hh: parseInt(digits(v('he-hh')), 10) || 0, park: 0, mech: 0, manual: true, my: { tel: t, memo } };
      }
      closeModal(); save(); P.msg = a ? '고친 내용을 저장했습니다.' : '건물을 추가했습니다.'; draw();
    };
    const del = document.getElementById('he-del');
    if (del) del.onclick = () => {
      if (!confirm('이 건물을 명단에서 지울까요?\n(다시 받아도 나타나지 않습니다)')) return;
      if (a.manual) delete P.db.list[code]; else a.hidden = true;
      closeModal(); save(); P.msg = '명단에서 지웠습니다.'; draw();
    };
  }
  async function excel(list) {
    await loadXlsxLib();
    const head = ['시·도', '시·군·구', '동', '건물명', '구분', '세대수', '주차대수', '기계식 주차', '지상 층수', '동 수', '사용승인일', '전화', '메모', '도로명 주소', '지번 주소'];
    const rows = list.map((x) => [x.sido, x.sgg, x.dongName || '', x.name, x.kind, x.hh || '', x.park || '', x.mech || '', x.flr || '', x.dongs || '', x.use || '', tel(x.tel), x.memo, x.doro || '', x.jibun || '']);
    const ws = XLSX.utils.aoa_to_sheet([head].concat(rows));
    ws['!cols'] = [6, 14, 10, 24, 12, 7, 8, 9, 8, 6, 11, 14, 24, 36, 36].map((w) => ({ wch: w }));
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: head.length - 1 } }) };
    const note = XLSX.utils.aoa_to_sheet([['마하파킹 — 빌라 · 소규모 공동주택 명단'], [`받은 날: ${today()}  ·  ${rows.length.toLocaleString()}곳`], ['출처: 국토교통부 건축HUB 건축물대장 표제부 (공공데이터포털)'], ['※ 건축물대장에는 전화번호가 없습니다. 방문 · 우편(DM)용이며, 광고 문자·팩스는 받는 분이 미리 동의한 경우에만 보낼 수 있습니다.']]);
    note['!cols'] = [{ wch: 90 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '빌라·공동주택'); XLSX.utils.book_append_sheet(wb, note, '안내');
    XLSX.writeFile(wb, `마하파킹_빌라명단_${[...new Set(list.map((x) => x.sgg))].slice(0, 3).join('_') || '전체'}_${today()}.xlsx`);
  }
  async function toSites(list) {
    const reg = new Set(D.sites.map((x) => nmKey(x.name)));
    const fresh = list.filter((x) => x.name && !reg.has(nmKey(x.name)));
    const noname = list.filter((x) => !x.name).length;
    if (!fresh.length) { P.msg = noname ? '이름이 있는 건물은 모두 이미 고객사 리스트에 있습니다. (이름 없는 건물은 고쳐서 이름을 넣은 뒤 넣으세요)' : '모두 이미 고객사 리스트에 있습니다.'; paint(); return; }
    if (!confirm(`${fresh.length.toLocaleString()}곳을 고객사 리스트에 "영업 대상"으로 넣을까요?\n(이미 있는 이름${noname ? ' · 이름 없는 건물' : ''}은 건너뜁니다)`)) return;
    const rows = fresh.map((x) => ({ name: x.name, kind: x.kind === '아파트' ? '아파트' : x.kind === '도시형생활주택' ? '도시형생활주택' : '빌라', region: [x.sido, x.sgg].filter(Boolean).join(' ') || null, address: x.doro || x.jibun || null,
      office_tel: digits(x.tel) || null, households: x.hh || null, status: 'lead', memo: [x.kind, x.park ? `주차 ${x.park}대${x.mech ? `(기계식 ${x.mech})` : ''}` : '', x.use && `사용승인 ${x.use}`, x.memo].filter(Boolean).join(' · '), updated_at: nowIso() }));
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
    const m = root.querySelector('#hs-msg'); if (m) { m.textContent = P.msg; m.style.display = P.msg ? '' : 'none'; }
    const s = root.querySelector('#hs-sync'); if (s) s.textContent = S.note;
  }
  async function draw() {
    if (!P.db || !BJD) { body().innerHTML = '<p class="hint">불러오는 중…</p>'; await Promise.all([load(), bjd()]); if (!isOpen()) return; }
    const db = P.db, every = all(), started = every.length > 0;
    const list = started ? filtered() : [], show = list.slice(0, P.limit);
    const reg = new Set(D.sites.map((x) => nmKey(x.name)));
    const cnt = (f) => every.filter(f).length;
    // 받아 올 지역 (행정표준코드 법정동)
    const SG = Object.entries(BJD);
    const pSidos = [...new Set(SG.map(([, v]) => SIDO_SHORT(v[0].split(' ')[0])))];
    const pSggs = !P.pickSido.length ? [] : SG.filter(([, v]) => P.pickSido.includes(SIDO_SHORT(v[0].split(' ')[0]))).map(([c, v]) => [c, (P.pickSido.length > 1 ? v[0] : v[0].split(' ').slice(1).join(' ')) + (() => { const d = v[1].filter(([b]) => db.done[c + b]).length; return d ? (d === v[1].length ? ' ✓' : ` (${d}/${v[1].length})`) : ''; })()]);
    const got = SG.map(([c, v]) => [c, v, v[1].filter(([b]) => db.done[c + b]).length]).filter((x) => x[2]);
    const sidos = [...new Set(every.map((x) => x.sido))].sort((a, b) => KO.compare(a, b));
    const sggs = !P.sidos.length ? [] : [...new Set(every.filter((x) => x.sgg && P.sidos.includes(x.sido)).map((x) => x.sido + '|' + x.sgg))].sort((a, b) => KO.compare(a, b)).map((k) => { const [d, g] = k.split('|'); return [k, P.sidos.length > 1 ? `${d} ${g}` : g]; });
    const hidden = Object.values(db.list).filter((a) => a.hidden).length;
    body().innerHTML = `
      <p id="hs-sync" class="hint" style="margin:0 0 8px;font-weight:700">${esc(S.note)}</p>
      ${started ? `<div class="kp-sum" style="grid-template-columns:repeat(4,auto) 1fr">
        <div><b>${every.length.toLocaleString()}</b><span>전체</span></div>
        <div><b>${cnt((x) => x.kind === '연립' || x.kind === '다세대').toLocaleString()}</b><span>빌라(연립·다세대)</span></div>
        <div><b>${cnt((x) => x.kind === '아파트' && (x.hh || 0) <= 300).toLocaleString()}</b><span>300세대 이하 아파트</span></div>
        <div><b>${cnt((x) => x.kind === '도시형생활주택').toLocaleString()}</b><span>도시형생활주택</span></div>
      </div>` : ''}
      <details class="kp-more"${started ? '' : ' open'} style="margin-top:0"><summary>📥 받아 올 지역 고르기 ${got.length ? `<span class="hint">(받은 시·군·구 ${got.length}곳)</span>` : ''}</summary>
        <p class="hint">건축물대장에서 시·군·구 단위로 받아 옵니다. 시·군·구 하나에 1~5분쯤 걸리고, 공공데이터를 수백 번 부릅니다(하루 한도 안). 받은 곳은 ✓ 표시가 붙고, 멈추면 남은 동부터 이어서 받습니다.</p>
        <div class="kp-filter">
          ${mselHtml({ id: 'hs-psido', all: '시·도 고르기', options: pSidos.map((d) => [d, d]), selected: P.pickSido })}
          ${mselHtml({ id: 'hs-psgg', all: '시·군·구 고르기', placeholder: '시·군·구 (시·도를 먼저)', options: pSggs, selected: P.pickSgg })}
          ${P.busy ? '<button class="btn btn-line btn-sm" type="button" id="hs-stop">⏸ 멈추기</button>' : `<button class="btn btn-cta btn-sm" type="button" id="hs-go"${P.pickSgg.length ? '' : ' disabled'}>▶ 받기 (${P.pickSgg.length}곳)</button>`}
        </div>
        ${got.length ? `<p class="hint" style="margin:6px 0 0">받은 곳: ${got.map(([c, v, d]) => `${esc(v[0].split(' ').slice(1).join(' ') || v[0])}${d < v[1].length ? ` (${d}/${v[1].length}동)` : ''}`).join(' · ')}</p>` : ''}
      </details>
      <p id="hs-msg" role="status" style="margin:8px 0;font-weight:700;white-space:pre-wrap;${P.msg ? '' : 'display:none'}">${esc(P.msg)}</p>
      ${started ? `
      <div class="kp-filter">
        ${mselHtml({ id: 'hs-sido', all: '전국', options: sidos.map((d) => [d, d]), selected: P.sidos })}
        ${mselHtml({ id: 'hs-sgg', all: '시·군·구 전체', placeholder: '시·군·구 (시·도를 먼저)', options: sggs, selected: P.sggs })}
        <div class="kp-search"><select id="hs-qf" aria-label="찾을 곳">${QF.map(([v, n]) => `<option value="${v}"${P.qf === v ? ' selected' : ''}>${n}</option>`).join('')}</select><input id="hs-q" type="search" placeholder="${{ all: '검색어', name: '예) OO빌라', addr: '예) 평촌동, 관악대로', tel: '예) 010-1234', memo: '메모 내용' }[P.qf]}" value="${esc(P.q)}"></div>
      </div>
      <div class="kp-filter">
        ${mselHtml({ id: 'hs-kind', all: '구분 전체', options: KINDS.map((k) => [k, k]), selected: P.kinds })}
        <label class="kp-hh">세대수 <input id="hs-min" inputmode="numeric" value="${P.min || ''}" placeholder="0" aria-label="세대수 이상"> 이상 ~ <input id="hs-max" inputmode="numeric" value="${P.max || ''}" placeholder="제한 없음" aria-label="세대수 이하"> 이하</label>
        <label class="kp-hh">주차 <input id="hs-pmin" inputmode="numeric" value="${P.pmin || ''}" placeholder="0"> 대 이상</label>
      </div>
      <div class="kp-filter kp-chk">
        <label class="sl-chk"><input type="checkbox" id="hs-mech"${P.mech ? ' checked' : ''}> 기계식 주차 있는 곳만</label>
        <label class="sl-chk"><input type="checkbox" id="hs-tel"${P.hasTel ? ' checked' : ''}> 전화 있는 곳만</label>
        <label class="sl-chk"><input type="checkbox" id="hs-notel"${P.noTel ? ' checked' : ''}> 전화 없는 곳만</label>
        <label class="sl-chk"><input type="checkbox" id="hs-notreg"${P.notReg ? ' checked' : ''}> 고객사 리스트에 없는 곳만</label>
        ${P.q || P.sidos.length || P.kinds.length || P.min || P.max || P.pmin || P.mech || P.hasTel || P.noTel || P.notReg ? '<button class="btn btn-line btn-sm" type="button" id="hs-clear">조건 지우기</button>' : ''}
      </div>
      <div class="kp-bar"><span class="kp-count"><b>${list.length.toLocaleString()}</b>곳</span>
        <div class="btns"><button class="btn btn-primary btn-sm" type="button" id="hs-xlsx"${list.length ? '' : ' disabled'}>⬇ 엑셀 저장</button><button class="btn btn-line btn-sm" type="button" id="hs-imp"${list.length ? '' : ' disabled'}>＋ 고객사 리스트에 넣기</button><button class="btn btn-line btn-sm" type="button" id="hs-add">＋ 건물 직접 추가</button></div></div>
      <div class="tbl-wrap kp-tbl"><table><thead><tr><th>지역</th><th>건물명 · 주소 <span class="hint" style="font-weight:400">(누르면 고치기 · 삭제)</span></th><th>구분</th><th>세대</th><th>주차</th><th>층</th><th>사용승인</th></tr></thead><tbody>
        ${show.length ? show.map((x) => `<tr data-hs="${esc(x.code)}"><td>${esc([x.sgg, x.dongName].filter(Boolean).join(' '))}</td><td><b>${esc(x.name || '(이름 없음)')}</b>${reg.has(nmKey(x.name)) && x.name ? ' <span class="status st-sent">등록됨</span>' : ''}${x.manual ? ' <span class="hint">(직접 추가)</span>' : ''}${x.tel ? ` <a href="tel:${digits(x.tel)}">☎ ${esc(tel(x.tel))}</a>` : ''}${x.memo ? `<br><span class="hint" style="color:var(--brand)">📝 ${esc(x.memo)}</span>` : ''}${x.doro || x.jibun ? `<br><span class="hint">${esc(x.doro || x.jibun)}</span>` : ''}</td><td style="white-space:nowrap">${esc(x.kind)}${x.dongs > 1 ? `<br><span class="hint">${x.dongs}개 동</span>` : ''}</td><td>${x.hh || ''}</td><td style="white-space:nowrap">${x.park || ''}${x.mech ? `<br><span class="hint">기계식 ${x.mech}</span>` : ''}</td><td>${x.flr || ''}</td><td style="white-space:nowrap">${esc((x.use || '').slice(0, 7))}</td></tr>`).join('') : '<tr><td colspan="7" class="hint">조건에 맞는 건물이 없습니다.</td></tr>'}
      </tbody></table></div>
      ${list.length > show.length ? `<div class="btns" style="justify-content:center;margin-top:8px"><button class="btn btn-line btn-sm" type="button" id="hs-more">더 보기 (${show.length.toLocaleString()} / ${list.length.toLocaleString()})</button></div>` : ''}
      <details class="kp-more"><summary>⚙ 명단 관리</summary>
        <p class="hint">${hidden ? `명단에서 지운 건물 ${hidden.toLocaleString()}곳 (다시 받아도 나타나지 않습니다)` : '지운 건물이 없습니다.'}</p>
        <div class="btns">${hidden ? '<button class="btn btn-line btn-sm" type="button" id="hs-unhide">지운 곳 모두 되살리기</button>' : ''}<button class="btn btn-line btn-sm" type="button" id="hs-redo">고른 시·군·구 처음부터 다시 받기</button><button class="btn btn-line btn-sm" type="button" id="hs-reset" style="color:var(--stop)">명단 전체 지우기</button></div>
      </details>` : ''}
      <p class="hint" style="margin-top:14px">출처: 국토교통부 건축HUB 건축물대장(표제부). 같은 지번의 여러 동은 한 곳으로 묶었습니다. 건축물대장에는 전화번호가 없어 방문 · 우편(DM) 영업용입니다. ⚠ 광고 문자·팩스는 받는 분이 미리 동의한 경우에만 보낼 수 있습니다.</p>`;
    const root = body(), $ = (s) => root.querySelector(s), on = (s, ev, fn) => { const el = $(s); if (el) el[ev] = fn; };
    const re = () => { P.msg = ''; P.limit = 100; draw(); };
    const intOf = (e) => parseInt(digits(e.target.value), 10) || 0;
    mselBind(root, 'hs-psido', (v) => { P.pickSido = v; const ok = new Set(SG.filter(([, w]) => v.includes(SIDO_SHORT(w[0].split(' ')[0]))).map(([c]) => c)); P.pickSgg = P.pickSgg.filter((c) => ok.has(c)); draw(); });
    mselBind(root, 'hs-psgg', (v) => { P.pickSgg = v; draw(); });
    on('#hs-go', 'onclick', () => fetchSggs(P.pickSgg.slice()));
    on('#hs-stop', 'onclick', () => { P.stop = true; P.msg = '멈추는 중… (지금 받는 동까지 마칩니다)'; paint(); });
    mselBind(root, 'hs-sido', (v) => { P.sidos = v; P.sggs = P.sggs.filter((k) => v.includes(k.split('|')[0])); re(); });
    mselBind(root, 'hs-sgg', (v) => { P.sggs = v; re(); });
    mselBind(root, 'hs-kind', (v) => { P.kinds = v; re(); });
    on('#hs-q', 'onchange', (e) => { P.q = e.target.value; re(); });
    on('#hs-qf', 'onchange', (e) => { P.qf = e.target.value; if (P.q) re(); else draw(); });
    on('#hs-min', 'onchange', (e) => { P.min = intOf(e); re(); });
    on('#hs-max', 'onchange', (e) => { P.max = intOf(e); re(); });
    on('#hs-pmin', 'onchange', (e) => { P.pmin = intOf(e); re(); });
    on('#hs-mech', 'onchange', (e) => { P.mech = e.target.checked; re(); });
    on('#hs-tel', 'onchange', (e) => { P.hasTel = e.target.checked; if (P.hasTel) P.noTel = false; re(); });
    on('#hs-notel', 'onchange', (e) => { P.noTel = e.target.checked; if (P.noTel) P.hasTel = false; re(); });
    on('#hs-notreg', 'onchange', (e) => { P.notReg = e.target.checked; re(); });
    on('#hs-clear', 'onclick', () => { Object.assign(P, { q: '', qf: 'all', sidos: [], sggs: [], kinds: [], min: 0, max: 0, pmin: 0, mech: false, hasTel: false, noTel: false, notReg: false }); re(); });
    on('#hs-more', 'onclick', () => { P.limit += 300; draw(); });
    on('#hs-xlsx', 'onclick', async () => { try { await excel(list); } catch (e) { P.msg = e.message; paint(); } });
    on('#hs-imp', 'onclick', () => toSites(list));
    on('#hs-add', 'onclick', () => edit(null));
    on('#hs-unhide', 'onclick', () => { let n = 0; Object.values(db.list).forEach((a) => { if (a.hidden) { delete a.hidden; n++; } }); save(); P.msg = `${n.toLocaleString()}곳을 되살렸습니다.`; draw(); });
    on('#hs-redo', 'onclick', () => {
      if (!P.pickSgg.length) { P.msg = '위 "📥 받아 올 지역 고르기"에서 다시 받을 시·군·구를 먼저 고르세요.'; paint(); return; }
      if (!confirm(`고른 시·군·구 ${P.pickSgg.length}곳을 처음부터 다시 받을까요? (직접 고친 전화·메모는 그대로 둡니다)`)) return;
      P.pickSgg.forEach((c) => Object.keys(db.done).forEach((k) => { if (k.startsWith(c)) delete db.done[k]; }));
      fetchSggs(P.pickSgg.slice());
    });
    on('#hs-reset', 'onclick', async () => {
      if (!confirm('빌라 명단 전체를 지울까요?\n(서버에서도 지워져 모든 PC에서 비게 됩니다. 고객사 리스트는 그대로입니다)')) return;
      P.msg = '지우는 중…'; paint();
      P.db = { list: {}, done: {}, resetAt: new Date().toISOString() };
      if (!S.off) { const { error } = await sb.from('house_bld').delete().neq('code', '_meta'); if (error) off(error); }
      Object.assign(S, { sent: {}, ver: {} }); await keepSent(); await save(); P.msg = ''; draw();
    });
    root.querySelectorAll('[data-hs]').forEach((tr) => { tr.onclick = (e) => { if (e.target.closest('a')) return; edit(tr.dataset.hs); }; });
  }
  return { draw };
}
