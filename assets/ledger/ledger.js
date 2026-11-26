/* 💰 매입 · 매출 장부 — 관리자 화면 "매입·매출" 탭
 *  엑셀처럼 표 한 장에 바로 입력 (칸을 고치면 바로 서버에 저장)
 *  위쪽: 기간 · 키워드 검색 + 매출 · 매입 · 이익 합계 (검색 결과 기준)
 *  표 구조: supabase/ledger.sql
 */
const sb = supabase.createClient(MAHA.SB_URL, MAHA.SB_KEY);
const root = document.getElementById('ledger-root');
const PROOF = ['세금계산서', '현금영수증', '카드', '현금(증빙 없음)'];
const CAT = ['일반 경비', '재고 구매', '공구 구매'];
const KIND = { in: '매출', out: '매입' };
const L = { rows: [], loaded: false, view: 'in', from: '', to: '', q: '', proof: '', cat: '', msg: '', setup: false, vat: false, rg: {} };
const VIEWS = [['in', '📥 매출'], ['out', '📤 매입'], ['sum', '📊 합계']];
const won = (n) => Number(n || 0).toLocaleString('ko-KR');
const num = (s) => { const n = Number(String(s == null ? '' : s).replace(/[^\d.-]/g, '')); return isFinite(n) ? Math.round(n) : 0; };
const pad = (n) => String(n).padStart(2, '0');
const ymd = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
const canEdit = () => { const b = document.querySelector('#admin-tabs [data-tab="ledger"]'); return !b || b.dataset.level !== 'view'; };
const hasVat = (proof) => proof !== '현금(증빙 없음)';

function range(k) {
  const t = new Date(), y = t.getFullYear(), m = t.getMonth();
  if (k === 'this') return [ymd(new Date(y, m, 1)), ymd(new Date(y, m + 1, 0))];
  if (k === 'last') return [ymd(new Date(y, m - 1, 1)), ymd(new Date(y, m, 0))];
  if (k === 'year') return [`${y}-01-01`, `${y}-12-31`];
  return ['', ''];
}
[L.from, L.to] = range('this');
L.rg = { in: range('this'), out: range('this'), sum: range('year') };

async function load() {
  root.innerHTML = '<p class="hint">불러오는 중…</p>';
  const { data, error } = await sb.from('ledger').select('*').order('d', { ascending: false }).order('created_at', { ascending: false }).limit(5000);
  if (error) {
    L.setup = /schema cache|does not exist/i.test(error.message);
    root.innerHTML = L.setup
      ? '<div class="notice"><b>처음 한 번만 설정이 필요합니다.</b><span>Supabase → SQL Editor 에서 <code>supabase/ledger.sql</code> 내용을 붙여 넣고 Run 을 누른 뒤, 이 화면을 새로고침해 주세요.</span></div>'
      : `<p class="hint">불러오지 못했습니다: ${esc(error.message)}</p>`;
    return;
  }
  L.rows = data || []; L.loaded = true; draw();
}

function filtered() {
  const q = L.q.trim().toLowerCase(), qd = q.replace(/[^\d]/g, '');
  return L.rows.slice().sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : String(b.created_at) < String(a.created_at) ? -1 : 1)).filter((r) => (!L.from || r.d >= L.from) && (!L.to || r.d <= L.to) && (L.view === 'sum' || r.kind === L.view) && (!L.proof || r.proof === L.proof) && (L.view !== 'out' || !L.cat || (r.cat || '일반 경비') === L.cat)
    && (!q || [r.party, r.item, r.memo, r.cat, r.proof, KIND[r.kind]].join(' ').toLowerCase().includes(q) || (qd.length >= 3 && String(r.total).includes(qd))));
}

function sums(list) {
  const s = { in: 0, inSup: 0, out: 0, outSup: 0, byProof: {}, byCat: {} };
  list.forEach((r) => {
    if (r.kind === 'in') { s.in += +r.total; s.inSup += +r.supply; s.byProof[r.proof] = (s.byProof[r.proof] || 0) + +r.total; }
    else { s.out += +r.total; s.outSup += +r.supply; const c = r.cat || '일반 경비'; s.byCat[c] = (s.byCat[c] || 0) + +r.total; }
  });
  return s;
}

const sel = (f, opts, v, dis) => `<select class="lg-c" data-f="${f}"${dis ? ' disabled' : ''}>${opts.map(([k, n]) => `<option value="${esc(k)}"${k === v ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
function rowHtml(r, ro) {
  const dis = ro ? ' disabled' : '';
  return `<tr data-id="${esc(r.id)}" class="lg-${r.kind}">
    <td><input class="lg-c" data-f="d" type="date" value="${esc(r.d)}"${dis}></td>
    ${r.kind === 'out' ? `<td>${sel('cat', CAT.map((c) => [c, c]), r.cat || '일반 경비', ro)}</td>` : ''}
    <td>${sel('proof', PROOF.map((c) => [c, c]), r.proof, ro)}</td>
    <td><input class="lg-c" data-f="party" value="${esc(r.party)}" placeholder="거래처"${dis}></td>
    <td><input class="lg-c" data-f="item" value="${esc(r.item)}" placeholder="내용"${dis}></td>
    <td><input class="lg-c num" data-f="supply" inputmode="numeric" value="${r.supply ? won(r.supply) : ''}"${dis}></td>
    <td><input class="lg-c num" data-f="vat" inputmode="numeric" value="${r.vat ? won(r.vat) : ''}"${dis}></td>
    <td><input class="lg-c num lg-tot" data-f="total" inputmode="numeric" value="${r.total ? won(r.total) : ''}"${dis}></td>
    <td><input class="lg-c" data-f="memo" value="${esc(r.memo)}" placeholder="메모"${dis}></td>
    <td>${ro ? '' : '<button class="lg-del" type="button" title="이 줄 지우기">✕</button>'}</td></tr>`;
}

function head() {
  const qk = (k, n) => { const [a, b] = range(k); return `<button class="btn btn-sm ${L.from === a && L.to === b ? 'btn-primary' : 'btn-line'}" type="button" data-rg="${k}">${n}</button>`; };
  return `<div class="sl-subs" role="tablist" style="margin:0 0 14px">${VIEWS.map(([k, t]) => `<button type="button" role="tab" data-view="${k}" aria-selected="${k === L.view}">${t}</button>`).join('')}</div>
  <div class="lg-search">
    <div class="lg-quick">${qk('this', '이번 달')}${qk('last', '지난 달')}${qk('year', '올해')}${qk('all', '전체')}</div>
    <label>기간 <input type="date" id="lg-from" value="${esc(L.from)}"> ~ <input type="date" id="lg-to" value="${esc(L.to)}"></label>
    ${L.view === 'sum'
      ? `<label class="lg-chk"><input type="checkbox" id="lg-vat"${L.vat ? ' checked' : ''}> 부가세 포함 금액으로 보기</label>`
      : `${L.view === 'out' ? `<select id="lg-cat"><option value="">항목 전체</option>${CAT.map((c) => `<option${L.cat === c ? ' selected' : ''}>${c}</option>`).join('')}</select>` : ''}
    <select id="lg-proof"><option value="">증빙 전체</option>${PROOF.map((p) => `<option${L.proof === p ? ' selected' : ''}>${p}</option>`).join('')}</select>
    <input type="search" id="lg-q" value="${esc(L.q)}" placeholder="거래처 · 내용 · 메모 · 금액 검색">`}
  </div>`;
}

function draw() {
  if (!L.loaded) return;
  if (L.view === 'sum') return drawSum();
  const ro = !canEdit(), list = filtered(), s = sums(list), isIn = L.view === 'in';
  const tot = isIn ? s.in : s.out, sup = isIn ? s.inSup : s.outSup;
  const parts = isIn ? PROOF.map((p) => [p === '현금(증빙 없음)' ? '현금 (증빙 없음)' : p, s.byProof[p] || 0]) : CAT.map((c) => [c, s.byCat[c] || 0]);
  root.innerHTML = head() + `
  <div class="lg-sum lg-sum-${L.view}">
    <div class="lg-card lg-${L.view}"><span>${isIn ? '매출' : '매입'} 합계</span><b>${won(tot)}원</b><small>부가세 빼면 ${won(sup)}원</small></div>
    ${parts.map(([n, v]) => `<div class="lg-card lg-part"><span>${esc(n)}</span><b>${won(v)}원</b></div>`).join('')}
  </div>
  <div class="lg-bar"><b>${list.length.toLocaleString()}건</b>
    ${ro ? '' : `<button class="btn btn-primary btn-sm" type="button" id="lg-add">＋ ${isIn ? '매출' : '매입'} 추가</button>`}
    <button class="btn btn-line btn-sm" type="button" id="lg-xls">⬇ 엑셀 저장</button>
    <span class="hint" id="lg-msg">${esc(L.msg)}</span></div>
  <div class="lg-wrap"><table class="lg-tbl">
    <thead><tr><th style="width:128px">날짜</th>${isIn ? '' : '<th style="width:104px">항목</th>'}<th style="width:128px">증빙</th><th style="width:160px">거래처</th><th style="width:240px">내용</th><th style="width:104px" class="num">공급가</th><th style="width:90px" class="num">부가세</th><th style="width:110px" class="num">합계</th><th style="width:220px">메모</th><th style="width:30px"></th></tr></thead>
    <tbody>${list.length ? list.map((r) => rowHtml(r, ro)).join('') : `<tr><td colspan="10" class="hint" style="padding:18px">${L.rows.some((r) => r.kind === L.view) ? '조건에 맞는 거래가 없습니다.' : `아직 입력한 ${isIn ? '매출' : '매입'}이 없습니다. 위의 [＋ ${isIn ? '매출' : '매입'} 추가]를 눌러 시작하세요.`}</td></tr>`}</tbody>
    ${list.length ? `<tfoot><tr><td colspan="${isIn ? 4 : 5}">검색 결과 합계</td><td class="num">${won(sup)}</td><td class="num">${won(tot - sup)}</td><td class="num">${won(tot)}</td><td colspan="2"></td></tr></tfoot>` : ''}
  </table></div>
  <p class="hint" style="margin-top:8px">칸을 고치고 다른 칸으로 넘어가면 바로 저장됩니다. 공급가나 합계 중 하나만 넣으면 부가세(10%)는 자동으로 계산되고, "현금(증빙 없음)"은 부가세 없이 합계 = 공급가로 잡습니다. Enter를 누르면 아래 줄로 내려갑니다.</p>`;
  bind();
}

/* 📊 합계: 매출 · 매입을 모아 월별로 */
function drawSum() {
  const list = filtered(), V = L.vat, amt = (r) => +(V ? r.total : r.supply);
  const months = {};
  list.forEach((r) => {
    const m = r.d.slice(0, 7), o = months[m] || (months[m] = { inTax: 0, inCash: 0, out: {}, n: 0 });
    o.n++;
    if (r.kind === 'in') { if (r.proof === '세금계산서') o.inTax += amt(r); else o.inCash += amt(r); }
    else { const c = r.cat || '일반 경비'; o.out[c] = (o.out[c] || 0) + amt(r); }
  });
  const keys = Object.keys(months).sort().reverse();
  const T = { inTax: 0, inCash: 0, out: {} };
  const rows = keys.map((m) => {
    const o = months[m], inS = o.inTax + o.inCash, outS = CAT.reduce((a, c) => a + (o.out[c] || 0), 0);
    T.inTax += o.inTax; T.inCash += o.inCash; CAT.forEach((c) => { T.out[c] = (T.out[c] || 0) + (o.out[c] || 0); });
    const pf = inS - outS;
    return `<tr><td><button class="lg-mlink" type="button" data-m="${m}">${m.replace('-', '년 ')}월</button></td><td class="num">${won(o.inTax)}</td><td class="num">${won(o.inCash)}</td><td class="num lg-c-in">${won(inS)}</td>${CAT.map((c) => `<td class="num">${won(o.out[c] || 0)}</td>`).join('')}<td class="num lg-c-out">${won(outS)}</td><td class="num lg-c-pf${pf < 0 ? ' lg-neg' : ''}">${won(pf)}</td></tr>`;
  }).join('');
  const tIn = T.inTax + T.inCash, tOut = CAT.reduce((a, c) => a + (T.out[c] || 0), 0), tPf = tIn - tOut;
  const unit = V ? '부가세 포함' : '부가세 뺀 금액';
  root.innerHTML = head() + `
  <div class="lg-sum">
    <div class="lg-card lg-in"><span>매출</span><b>${won(tIn)}원</b><small>세금계산서 ${won(T.inTax)} · 현금 등 ${won(T.inCash)}</small></div>
    <div class="lg-card lg-out"><span>매입</span><b>${won(tOut)}원</b><small>${CAT.map((c) => `${c} ${won(T.out[c] || 0)}`).join(' · ')}</small></div>
    <div class="lg-card lg-pf"><span>이익</span><b class="${tPf < 0 ? 'lg-neg' : ''}">${won(tPf)}원</b><small>${unit} 기준 (매출 − 매입)</small></div>
  </div>
  <div class="lg-bar"><b>월별 합계</b><span class="hint">${unit} 기준 · 월을 누르면 그 달 매출 장부로 갑니다</span><button class="btn btn-line btn-sm" type="button" id="lg-xls" style="margin-left:auto">⬇ 엑셀 저장</button></div>
  <div class="lg-wrap"><table class="lg-tbl lg-sumtbl">
    <thead><tr><th rowspan="2" style="width:120px">월</th><th colspan="3" class="lg-gh-in">매출</th><th colspan="${CAT.length + 1}" class="lg-gh-out">매입</th><th rowspan="2" class="num" style="width:130px">이익</th></tr>
    <tr><th class="num">세금계산서</th><th class="num">현금 등</th><th class="num">매출 계</th>${CAT.map((c) => `<th class="num">${c}</th>`).join('')}<th class="num">매입 계</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="9" class="hint" style="padding:18px">이 기간에 입력한 거래가 없습니다.</td></tr>'}</tbody>
    ${rows ? `<tfoot><tr><td>합계</td><td class="num">${won(T.inTax)}</td><td class="num">${won(T.inCash)}</td><td class="num">${won(tIn)}</td>${CAT.map((c) => `<td class="num">${won(T.out[c] || 0)}</td>`).join('')}<td class="num">${won(tOut)}</td><td class="num${tPf < 0 ? ' lg-neg' : ''}">${won(tPf)}</td></tr></tfoot>` : ''}
  </table></div>`;
  bind();
  root.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => {
    const [y, m] = b.dataset.m.split('-').map(Number);
    L.rg.sum = [L.from, L.to]; L.view = 'in'; L.from = ymd(new Date(y, m - 1, 1)); L.to = ymd(new Date(y, m, 0)); L.q = ''; L.proof = ''; draw();
  }; });
}

function msg(t) { L.msg = t; const m = root.querySelector('#lg-msg'); if (m) m.textContent = t; }

async function add(kind) {
  const rec = { d: (L.to && L.to < ymd(new Date())) ? L.to : ymd(new Date()), kind, cat: kind === 'out' ? '일반 경비' : '', proof: '세금계산서' };
  const r = await sb.from('ledger').insert(rec).select().single();
  if (r.error) return msg('추가하지 못했습니다: ' + r.error.message);
  L.rows.unshift(r.data); L.q = ''; L.proof = ''; L.cat = '';
  if (L.from && r.data.d < L.from) L.from = '';
  if (L.to && r.data.d > L.to) L.to = '';
  draw();
  const inp = root.querySelector(`tr[data-id="${r.data.id}"] [data-f="party"]`); if (inp) inp.focus();
}

async function save(tr, f, el) {
  const r = L.rows.find((x) => x.id === tr.dataset.id); if (!r) return;
  const old = { ...r };
  if (['supply', 'vat', 'total'].includes(f)) {
    const v = num(el.value), vatOn = hasVat(r.proof);
    if (f === 'supply') { r.supply = v; r.vat = vatOn ? Math.round(v * 0.1) : 0; r.total = r.supply + r.vat; }
    else if (f === 'total') { r.total = v; r.supply = vatOn ? Math.round(v / 1.1) : v; r.vat = r.total - r.supply; }
    else { r.vat = v; r.total = r.supply + v; }
  } else if (f === 'proof') {
    r.proof = el.value;
    if (!hasVat(r.proof)) { r.supply = r.total; r.vat = 0; } else if (!r.vat && r.total) { r.supply = Math.round(r.total / 1.1); r.vat = r.total - r.supply; }
  } else if (f === 'kind') { r.kind = el.value; r.cat = r.kind === 'out' ? (r.cat || '일반 경비') : ''; }
  else r[f] = f === 'd' ? (el.value || ymd(new Date())) : el.value.trim();
  const patch = { d: r.d, kind: r.kind, cat: r.cat, proof: r.proof, party: r.party, item: r.item, supply: r.supply, vat: r.vat, total: r.total, memo: r.memo, updated_at: new Date().toISOString() };
  const changed = Object.keys(patch).some((k) => k !== 'updated_at' && String(patch[k]) !== String(old[k]));
  if (!changed) { if (['supply', 'vat', 'total'].includes(f)) el.value = r[f] ? won(r[f]) : ''; return; }
  msg('저장 중…');
  const res = await sb.from('ledger').update(patch).eq('id', r.id);
  if (res.error) { Object.assign(r, old); msg('저장하지 못했습니다: ' + res.error.message); draw(); return; }
  msg('저장했습니다 ✓');
  if (['kind', 'proof', 'supply', 'vat', 'total', 'd'].includes(f)) {
    const ae = document.activeElement, aTr = ae && ae.closest && ae.closest('tr[data-id]'), aF = ae && ae.dataset && ae.dataset.f;
    draw();
    if (aTr && aF) { const n = root.querySelector(`tr[data-id="${aTr.dataset.id}"] [data-f="${aF}"]`); if (n) n.focus(); }
  }
}

function bind() {
  const $q = (s) => root.querySelector(s);
  root.querySelectorAll('[data-rg]').forEach((b) => { b.onclick = () => { [L.from, L.to] = range(b.dataset.rg); draw(); }; });
  $q('#lg-from').onchange = (e) => { L.from = e.target.value; draw(); };
  $q('#lg-to').onchange = (e) => { L.to = e.target.value; draw(); };
  root.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => {
    L.rg[L.view] = [L.from, L.to]; L.view = b.dataset.view; [L.from, L.to] = L.rg[L.view] || range('this'); L.q = ''; L.proof = ''; L.cat = ''; L.msg = ''; draw();
  }; });
  if ($q('#lg-vat')) $q('#lg-vat').onchange = (e) => { L.vat = e.target.checked; draw(); };
  if ($q('#lg-cat')) $q('#lg-cat').onchange = (e) => { L.cat = e.target.value; draw(); };
  if ($q('#lg-proof')) $q('#lg-proof').onchange = (e) => { L.proof = e.target.value; draw(); };
  let t; if ($q('#lg-q')) $q('#lg-q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { L.q = e.target.value; draw(); const n = $q('#lg-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300); };
  if ($q('#lg-add')) $q('#lg-add').onclick = () => add(L.view);
  $q('#lg-xls').onclick = xls;
  root.querySelectorAll('tr[data-id]').forEach((tr) => {
    tr.querySelectorAll('[data-f]').forEach((el) => {
      el.onchange = () => save(tr, el.dataset.f, el);
      if (el.tagName === 'INPUT') el.onkeydown = (e) => {
        if (e.key !== 'Enter') return; e.preventDefault();
        const nx = tr.nextElementSibling && tr.nextElementSibling.querySelector(`[data-f="${el.dataset.f}"]`);
        el.blur(); if (nx) nx.focus();
      };
    });
    const del = tr.querySelector('.lg-del');
    if (del) del.onclick = () => {
      const r = L.rows.find((x) => x.id === tr.dataset.id);
      modal(`<h3>이 거래를 지울까요?</h3><p>${esc(r.d)} · ${KIND[r.kind]} · ${esc(r.party || '(거래처 없음)')} · ${won(r.total)}원</p><p class="hint">지우면 되돌릴 수 없습니다.</p><div class="btns" style="margin-top:10px"><button class="btn btn-line" data-close>취소</button><button class="btn btn-primary" id="lg-del-ok">지우기</button></div>`);
      document.getElementById('lg-del-ok').onclick = async () => {
        const res = await sb.from('ledger').delete().eq('id', r.id);
        closeModal();
        if (res.error) return msg('지우지 못했습니다: ' + res.error.message);
        L.rows = L.rows.filter((x) => x.id !== r.id); msg('지웠습니다.'); draw();
      };
    };
  });
}

async function xls() {
  if (!window.XLSX) await new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'; sc.onload = ok; sc.onerror = () => no(new Error('엑셀 도구를 불러오지 못했습니다.')); document.head.appendChild(sc); });
  const per = `${L.from || '처음'}_${L.to || '끝'}`, wb = XLSX.utils.book_new();
  if (L.view === 'sum') {
    const ws = XLSX.utils.table_to_sheet(root.querySelector('.lg-sumtbl'));
    ws['!cols'] = [12, 14, 14, 14, 14, 14, 14, 14, 14].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, '월별 합계');
    return XLSX.writeFile(wb, `매입매출_합계_${per}${L.vat ? '_부가세포함' : ''}.xlsx`);
  }
  const isIn = L.view === 'in', list = filtered().slice().sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0)), s = sums(list);
  const rows = [['날짜'].concat(isIn ? [] : ['항목'], ['증빙', '거래처', '내용', '공급가', '부가세', '합계', '메모'])]
    .concat(list.map((r) => [r.d].concat(isIn ? [] : [r.cat || '일반 경비'], [r.proof, r.party, r.item, +r.supply, +r.vat, +r.total, r.memo])));
  const pad0 = isIn ? ['', '', '', ''] : ['', '', '', '', ''];
  rows.push([], ['합계'].concat(pad0.slice(1), [isIn ? s.inSup : s.outSup, isIn ? s.in - s.inSup : s.out - s.outSup, isIn ? s.in : s.out]));
  const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = (isIn ? [11, 14, 18, 28, 12, 10, 12, 20] : [11, 10, 14, 18, 28, 12, 10, 12, 20]).map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, isIn ? '매출' : '매입');
  XLSX.writeFile(wb, `${isIn ? '매출' : '매입'}_${per}.xlsx`);
}

const tabBtn = document.querySelector('#admin-tabs [data-tab="ledger"]');
if (tabBtn) tabBtn.addEventListener('click', () => { if (!L.loaded) load(); else draw(); });
