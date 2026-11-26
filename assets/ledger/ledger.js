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
const L = { rows: [], loaded: false, from: '', to: '', q: '', kind: '', proof: '', msg: '', setup: false };
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
  return L.rows.slice().sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : String(b.created_at) < String(a.created_at) ? -1 : 1)).filter((r) => (!L.from || r.d >= L.from) && (!L.to || r.d <= L.to) && (!L.kind || r.kind === L.kind) && (!L.proof || r.proof === L.proof)
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
    <td>${sel('kind', [['in', '매출'], ['out', '매입']], r.kind, ro)}</td>
    <td>${r.kind === 'out' ? sel('cat', CAT.map((c) => [c, c]), r.cat || '일반 경비', ro) : '<span class="hint">—</span>'}</td>
    <td>${sel('proof', PROOF.map((c) => [c, c]), r.proof, ro)}</td>
    <td><input class="lg-c" data-f="party" value="${esc(r.party)}" placeholder="거래처"${dis}></td>
    <td><input class="lg-c" data-f="item" value="${esc(r.item)}" placeholder="내용"${dis}></td>
    <td><input class="lg-c num" data-f="supply" inputmode="numeric" value="${r.supply ? won(r.supply) : ''}"${dis}></td>
    <td><input class="lg-c num" data-f="vat" inputmode="numeric" value="${r.vat ? won(r.vat) : ''}"${dis}></td>
    <td><input class="lg-c num lg-tot" data-f="total" inputmode="numeric" value="${r.total ? won(r.total) : ''}"${dis}></td>
    <td><input class="lg-c" data-f="memo" value="${esc(r.memo)}" placeholder="메모"${dis}></td>
    <td>${ro ? '' : '<button class="lg-del" type="button" title="이 줄 지우기">✕</button>'}</td></tr>`;
}

function draw() {
  if (!L.loaded) return;
  const ro = !canEdit(), list = filtered(), s = sums(list);
  const profit = s.inSup - s.outSup;
  const qk = (k, n) => { const [a, b] = range(k); return `<button class="btn btn-sm ${L.from === a && L.to === b ? 'btn-primary' : 'btn-line'}" type="button" data-rg="${k}">${n}</button>`; };
  root.innerHTML = `
  <div class="lg-sum">
    <div class="lg-card lg-in"><span>매출</span><b>${won(s.in)}원</b><small>${PROOF.filter((p) => s.byProof[p]).map((p) => `${p === '현금(증빙 없음)' ? '현금' : p} ${won(s.byProof[p])}`).join(' · ') || '—'}</small></div>
    <div class="lg-card lg-out"><span>매입</span><b>${won(s.out)}원</b><small>${CAT.filter((c) => s.byCat[c]).map((c) => `${c} ${won(s.byCat[c])}`).join(' · ') || '—'}</small></div>
    <div class="lg-card lg-pf"><span>이익</span><b class="${profit < 0 ? 'lg-neg' : ''}">${won(profit)}원</b><small>부가세 뺀 금액 기준 (매출 ${won(s.inSup)} − 매입 ${won(s.outSup)})</small></div>
  </div>
  <div class="lg-search">
    <div class="lg-quick">${qk('this', '이번 달')}${qk('last', '지난 달')}${qk('year', '올해')}${qk('all', '전체')}</div>
    <label>기간 <input type="date" id="lg-from" value="${esc(L.from)}"> ~ <input type="date" id="lg-to" value="${esc(L.to)}"></label>
    <select id="lg-kind"><option value="">매출·매입 전체</option><option value="in"${L.kind === 'in' ? ' selected' : ''}>매출만</option><option value="out"${L.kind === 'out' ? ' selected' : ''}>매입만</option></select>
    <select id="lg-proof"><option value="">증빙 전체</option>${PROOF.map((p) => `<option${L.proof === p ? ' selected' : ''}>${p}</option>`).join('')}</select>
    <input type="search" id="lg-q" value="${esc(L.q)}" placeholder="거래처 · 내용 · 메모 · 금액 검색">
  </div>
  <div class="lg-bar"><b>${list.length.toLocaleString()}건</b>
    ${ro ? '' : '<button class="btn btn-primary btn-sm" type="button" id="lg-add-in">＋ 매출 추가</button><button class="btn btn-line btn-sm" type="button" id="lg-add-out">＋ 매입 추가</button>'}
    <button class="btn btn-line btn-sm" type="button" id="lg-xls">⬇ 엑셀 저장</button>
    <span class="hint" id="lg-msg">${esc(L.msg)}</span></div>
  <div class="lg-wrap"><table class="lg-tbl">
    <thead><tr><th style="width:128px">날짜</th><th style="width:66px">구분</th><th style="width:96px">매입 항목</th><th style="width:124px">증빙</th><th style="width:120px">거래처</th><th style="width:180px">내용</th><th style="width:96px" class="num">공급가</th><th style="width:82px" class="num">부가세</th><th style="width:100px" class="num">합계</th><th style="width:110px">메모</th><th style="width:30px"></th></tr></thead>
    <tbody>${list.length ? list.map((r) => rowHtml(r, ro)).join('') : `<tr><td colspan="11" class="hint" style="padding:18px">${L.rows.length ? '조건에 맞는 거래가 없습니다.' : '아직 입력한 거래가 없습니다. 위의 [＋ 매출 추가] · [＋ 매입 추가]를 눌러 시작하세요.'}</td></tr>`}</tbody>
    ${list.length ? `<tfoot><tr><td colspan="6">검색 결과 합계 (매출 − 매입)</td><td class="num">${won(s.inSup - s.outSup)}</td><td class="num">${won(list.reduce((a, r) => a + (r.kind === 'in' ? 1 : -1) * r.vat, 0))}</td><td class="num">${won(s.in - s.out)}</td><td colspan="2"></td></tr></tfoot>` : ''}
  </table></div>
  <p class="hint" style="margin-top:8px">칸을 고치고 다른 칸으로 넘어가면 바로 저장됩니다. 공급가나 합계 중 하나만 넣으면 부가세(10%)는 자동으로 계산되고, "현금(증빙 없음)"은 부가세 없이 합계 = 공급가로 잡습니다. Enter를 누르면 아래 줄로 내려갑니다.</p>`;
  bind();
}

function msg(t) { L.msg = t; const m = root.querySelector('#lg-msg'); if (m) m.textContent = t; }

async function add(kind) {
  const rec = { d: (L.to && L.to < ymd(new Date())) ? L.to : ymd(new Date()), kind, cat: kind === 'out' ? '일반 경비' : '', proof: '세금계산서' };
  const r = await sb.from('ledger').insert(rec).select().single();
  if (r.error) return msg('추가하지 못했습니다: ' + r.error.message);
  L.rows.unshift(r.data); L.q = ''; L.kind = ''; L.proof = '';
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
  $q('#lg-kind').onchange = (e) => { L.kind = e.target.value; draw(); };
  $q('#lg-proof').onchange = (e) => { L.proof = e.target.value; draw(); };
  let t; $q('#lg-q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { L.q = e.target.value; draw(); const n = $q('#lg-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300); };
  if ($q('#lg-add-in')) $q('#lg-add-in').onclick = () => add('in');
  if ($q('#lg-add-out')) $q('#lg-add-out').onclick = () => add('out');
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
  const list = filtered().slice().sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  const rows = [['날짜', '구분', '매입 항목', '증빙', '거래처', '내용', '공급가', '부가세', '합계', '메모']]
    .concat(list.map((r) => [r.d, KIND[r.kind], r.kind === 'out' ? r.cat : '', r.proof, r.party, r.item, +r.supply, +r.vat, +r.total, r.memo]));
  const s = sums(list);
  rows.push([], ['매출 합계', '', '', '', '', '', s.inSup, s.in - s.inSup, s.in], ['매입 합계', '', '', '', '', '', s.outSup, s.out - s.outSup, s.out], ['이익 (공급가 기준)', '', '', '', '', '', s.inSup - s.outSup]);
  const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = [11, 6, 10, 14, 18, 28, 12, 10, 12, 20].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '매입매출');
  XLSX.writeFile(wb, `매입매출_${L.from || '처음'}_${L.to || '끝'}.xlsx`);
}

const tabBtn = document.querySelector('#admin-tabs [data-tab="ledger"]');
if (tabBtn) tabBtn.addEventListener('click', () => { if (!L.loaded) load(); else draw(); });
