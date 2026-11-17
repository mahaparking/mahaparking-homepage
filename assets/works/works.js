/* 작업 · 수금 — 관리자 화면의 "작업 · 수금" 탭 (마하파킹 ERP)
 * 작업 일정(달력) · 작업별 금액 · 비용 · 입금 기록 → 수금 현황 · 월별 합계
 * 표 구조: supabase/works.sql
 */
const sb = supabase.createClient(MAHA.SB_URL, MAHA.SB_KEY);
const root = document.getElementById('works-root');

const ST = {
  planned: ['예정', 'wk-planned'], done: ['작업 완료', 'wk-done'], invoiced: ['계산서 발행', 'wk-inv'], paid: ['수금 완료', 'wk-paid'], canceled: ['취소', 'wk-cancel'],
};
const COST_NAMES = ['자재비', '출장비', '파트너 인건비', '기타'];
const SUBS = [['cal', '📅 작업 일정'], ['collect', '💰 수금 현황'], ['month', '📊 월별 합계']];
const D = { works: [], quotes: [], sites: [], loaded: false };
const V = { sub: 'cal', ym: today().slice(0, 7), day: '', lastChip: '', lastCell: '', lastAt: 0 };

/* ---------- 도구 ---------- */
const num = (v) => { const n = Number(String(v == null ? '' : v).replace(/[^\d.-]/g, '')); return isFinite(n) ? n : 0; };
const sum = (list, k) => (list || []).reduce((a, x) => a + num(x[k]), 0);
const total = (w) => num(w.supply) + num(w.vat);
const paidOf = (w) => sum(w.payments, 'amount');
const costOf = (w) => sum(w.costs, 'amount');
const dueOf = (w) => (w.status === 'canceled' ? 0 : Math.max(0, total(w) - paidOf(w)));
const byId = (list, id) => list.find((x) => x.id === id);
const WD = '일월화수목금토';
const wday = (d) => WD.charAt(new Date(d + 'T00:00:00').getDay());
const daysSince = (d) => Math.floor((Date.parse(today() + 'T00:00:00') - Date.parse(d + 'T00:00:00')) / 86400000);
function oops(msg, err) {
  if (err) console.error(err);
  modal(`<h3>처리하지 못했습니다</h3><p>${esc(msg)}</p><p class="hint">${esc((err && err.message) || '')}</p><button class="btn btn-primary" data-close>확인</button>`);
}
const stBadge = (s) => `<span class="wk-st ${(ST[s] || ST.planned)[1]}">${(ST[s] || ST.planned)[0]}</span>`;

/* ---------- 불러오기 ---------- */
async function load() {
  root.innerHTML = '<p class="hint">불러오고 있습니다...</p>';
  const [w, q, s] = await Promise.all([
    sb.from('works').select('*').order('work_date', { ascending: true, nullsFirst: false }).limit(2000),
    sb.from('quotes').select('id,quote_no,customer_name,title,supply,vat,total,quote_date,items').order('created_at', { ascending: false }).limit(300),
    sb.from('sites').select('id,name,address').order('name').limit(3000),
  ]);
  if (w.error) {
    const missing = /works/.test(w.error.message || '') && /(exist|schema cache|find)/i.test(w.error.message || '');
    root.innerHTML = missing
      ? '<div class="notice"><b>처음 한 번만 설정이 필요합니다.</b><span>Supabase → SQL Editor 에서 <code>supabase/works.sql</code> 내용을 붙여 넣고 Run 을 누른 뒤, 이 화면을 새로고침해 주세요.</span></div>'
      : `<p class="hint">작업 목록을 불러오지 못했습니다. (${esc(w.error.message)})</p>`;
    return;
  }
  D.works = w.data || []; D.quotes = q.data || []; D.sites = s.error ? [] : (s.data || []); D.loaded = true;
  draw();
}

/* ---------- 화면 ---------- */
function draw() {
  root.innerHTML = `<div class="wk-top"><div class="sl-subs" role="tablist" style="margin:0;flex:1">${SUBS.map(([k, t]) => `<button type="button" role="tab" data-sub="${k}" aria-selected="${k === V.sub}">${t}</button>`).join('')}</div>
    <button class="btn btn-primary btn-sm" type="button" id="wk-add">+ 작업 추가</button></div><p class="wk-note${V.note ? '' : ' hidden'}" id="wk-note" role="status">${esc(V.note || '')}</p><div id="wk-body"></div>`;
  root.querySelectorAll('[data-sub]').forEach((b) => { b.onclick = () => { V.sub = b.dataset.sub; draw(); }; });
  $('wk-add').onclick = () => edit(null, V.day ? { work_date: V.day } : null);
  if (V.sub === 'cal') drawCal();
  else if (V.sub === 'collect') drawCollect();
  else drawMonth();
}

/* 작업 일정: 달력 + 그 달 목록 */
function drawCal() {
  const [y, m] = V.ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate(), lead = first.getDay();
  const inMonth = D.works.filter((w) => (w.work_date || '').slice(0, 7) === V.ym);
  const byDay = {}; inMonth.forEach((w) => { (byDay[w.work_date] = byDay[w.work_date] || []).push(w); });
  Object.values(byDay).forEach((l) => l.sort((a, b) => (a.start_time || '99') < (b.start_time || '99') ? -1 : 1));
  const t = today();
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<div class="wk-cell wk-empty"></div>';
  for (let d = 1; d <= days; d++) {
    const ds = `${V.ym}-${String(d).padStart(2, '0')}`, list = byDay[ds] || [], dow = (lead + d - 1) % 7;
    cells += `<button type="button" class="wk-cell${ds === t ? ' wk-today' : ''}${ds === V.day ? ' wk-sel' : ''}${dow === 0 ? ' wk-sun' : dow === 6 ? ' wk-sat' : ''}" data-day="${ds}" aria-label="${m}월 ${d}일 작업 ${list.length}건">
      <span class="wk-d">${d}</span>${list.slice(0, 3).map((w) => `<span class="wk-chip ${(ST[w.status] || ST.planned)[1]}" data-wid="${w.id}" title="두 번 누르면 이 작업 열기">${esc(w.start_time ? w.start_time + ' ' : '')}${esc(w.site_name || w.title)}</span>`).join('')}${list.length > 3 ? `<span class="wk-more">+${list.length - 3}</span>` : ''}${list.length ? `<span class="wk-dot">${list.length}</span>` : ''}</button>`;
  }
  const shown = (V.day ? inMonth.filter((w) => w.work_date === V.day) : inMonth).filter((w) => w.status !== 'canceled' || V.day);
  const undated = D.works.filter((w) => !w.work_date && w.status !== 'canceled');
  $('wk-body').innerHTML = `<div class="wk-nav"><button class="btn btn-line btn-sm" type="button" id="wk-prev" aria-label="이전 달">‹</button><b>${y}년 ${m}월</b><button class="btn btn-line btn-sm" type="button" id="wk-next" aria-label="다음 달">›</button><button class="btn btn-line btn-sm" type="button" id="wk-now">이번 달</button>
      <span class="hint">이번 달 ${inMonth.filter((w) => w.status !== 'canceled').length}건 · 합계 ${won(inMonth.reduce((a, w) => a + (w.status === 'canceled' ? 0 : total(w)), 0))}원</span></div>
    <div class="wk-grid">${[...WD].map((w, i) => `<div class="wk-h${i === 0 ? ' wk-sun' : i === 6 ? ' wk-sat' : ''}">${w}</div>`).join('')}${cells}</div>
    <div class="wk-list-h"><b>${V.day ? `${dot(V.day)} (${wday(V.day)}) 작업` : `${m}월 작업 목록`}</b>${V.day ? '<button class="mini" type="button" id="wk-all">이 달 전체 보기</button>' : ''}</div>
    ${listHtml(shown, V.day ? '이 날은 작업이 없습니다. 위의 [+ 작업 추가]로 넣을 수 있습니다.' : '이 달에는 작업이 없습니다.')}
    ${undated.length && !V.day ? `<div class="wk-list-h"><b>날짜 안 정한 작업</b></div>${listHtml(undated, '')}` : ''}`;
  const go = (k) => { const dt = new Date(y, m - 1 + k, 1); V.ym = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`; V.day = ''; drawCal(); };
  $('wk-prev').onclick = () => go(-1); $('wk-next').onclick = () => go(1);
  $('wk-now').onclick = () => { V.ym = today().slice(0, 7); V.day = ''; drawCal(); };
  if ($('wk-all')) $('wk-all').onclick = () => { V.day = ''; drawCal(); };
  root.querySelectorAll('[data-day]').forEach((b) => {
    b.onclick = (e) => {
      const day = b.dataset.day, chip = e.target.closest && e.target.closest('[data-wid]'), now = Date.now();
      if (chip) {   // 작업을 두 번 누르면 그 작업 열기
        const again = V.lastChip === chip.dataset.wid && now - V.lastAt < 450;
        V.lastChip = chip.dataset.wid; V.lastAt = now;
        if (again) { V.lastChip = ''; return edit(byId(D.works, chip.dataset.wid)); }
        if (V.day !== day) { V.day = day; drawCal(); }
        return;
      }
      if (!(byDay[day] || []).length) return edit(null, { work_date: day });   // 빈 날짜 → 바로 작업 입력
      const again = V.lastCell === day && now - V.lastAt < 450;   // 작업 있는 날짜를 두 번 → 새 작업 입력
      V.lastCell = day; V.lastAt = now;
      if (again) { V.lastCell = ''; return edit(null, { work_date: day }); }
      V.day = V.day === day ? '' : day; drawCal();
    };
  });
  bindList();
}
function listHtml(list, emptyMsg) {
  if (!list.length) return emptyMsg ? `<p class="hint">${emptyMsg}</p>` : '';
  return `<div class="tbl-wrap"><table class="wk-table"><thead><tr><th>작업일</th><th>현장 · 작업</th><th>상태</th><th class="num">합계(VAT포함)</th><th class="num">받은 돈</th><th class="num">미수금</th></tr></thead><tbody>${list.map((w) => `
    <tr data-open="${w.id}" tabindex="0" class="wk-row"><td style="white-space:nowrap">${w.work_date ? `${dot(w.work_date)} (${wday(w.work_date)})` : '<span class="hint">미정</span>'}${w.start_time ? `<br><span class="hint">${esc(w.start_time)}${w.end_time ? '~' + esc(w.end_time) : ''}</span>` : ''}</td>
    <td><b>${esc(w.site_name || '(현장 미입력)')}</b><br><span class="hint">${esc(w.title)}</span></td><td>${stBadge(w.status)}</td>
    <td class="num">${won(total(w))}</td><td class="num">${won(paidOf(w))}</td><td class="num">${dueOf(w) ? `<b class="wk-due">${won(dueOf(w))}</b>` : '<span class="hint">0</span>'}</td></tr>`).join('')}</tbody></table></div>`;
}
function bindList() {
  root.querySelectorAll('[data-open]').forEach((r) => {
    const open = () => edit(byId(D.works, r.dataset.open));
    r.onclick = open; r.onkeydown = (e) => { if (e.key === 'Enter') open(); };
  });
}

/* 수금 현황 */
function drawCollect() {
  const t = today(), ym = t.slice(0, 7);
  const owed = D.works.filter((w) => w.status !== 'canceled' && w.status !== 'planned' && dueOf(w) > 0)
    .sort((a, b) => ((a.invoice_date || a.work_date || '') < (b.invoice_date || b.work_date || '') ? -1 : 1));
  const upcoming = D.works.filter((w) => w.status === 'planned' && dueOf(w) > 0);
  const paidMonth = D.works.reduce((a, w) => a + (w.payments || []).filter((p) => (p.date || '').slice(0, 7) === ym).reduce((s, p) => s + num(p.amount), 0), 0);
  const owedSum = owed.reduce((a, w) => a + dueOf(w), 0), old = owed.filter((w) => daysSince(w.invoice_date || w.work_date || t) > 30);
  $('wk-body').innerHTML = `<div class="st-kpis">
      <div class="st-kpi"><span>받을 돈 (미수금)</span><b class="wk-due">${won(owedSum)}원</b><small>작업 끝난 ${owed.length}건</small></div>
      <div class="st-kpi"><span>30일 넘은 미수금</span><b${old.length ? ' class="wk-due"' : ''}>${old.length}건</b><small>${won(old.reduce((a, w) => a + dueOf(w), 0))}원</small></div>
      <div class="st-kpi"><span>이번 달 들어온 돈</span><b>${won(paidMonth)}원</b><small>${Number(ym.slice(5))}월 입금 기록 합계</small></div>
      <div class="st-kpi"><span>예정 작업 금액</span><b>${won(upcoming.reduce((a, w) => a + total(w), 0))}원</b><small>아직 작업 전 ${upcoming.length}건</small></div></div>
    <div class="wk-list-h"><b>받을 돈 목록</b><span class="hint">오래된 순서 · 계산서 발행일(없으면 작업일) 기준</span></div>
    ${owed.length ? `<div class="tbl-wrap"><table class="wk-table"><thead><tr><th>기준일</th><th>현장 · 작업</th><th>상태</th><th class="num">합계</th><th class="num">받은 돈</th><th class="num">미수금</th><th>지난 날</th><th></th></tr></thead><tbody>${owed.map((w) => {
      const base = w.invoice_date || w.work_date, n = base ? daysSince(base) : 0;
      return `<tr><td style="white-space:nowrap">${base ? dot(base) : '-'}</td><td><button class="wk-link" type="button" data-open="${w.id}"><b>${esc(w.site_name || '(현장 미입력)')}</b></button><br><span class="hint">${esc(w.title)}${w.phone ? ' · ' + esc(w.phone) : ''}</span></td><td>${stBadge(w.status)}</td>
        <td class="num">${won(total(w))}</td><td class="num">${won(paidOf(w))}</td><td class="num"><b class="wk-due">${won(dueOf(w))}</b></td><td${n > 30 ? ' class="wk-due"' : ''} style="white-space:nowrap">${n}일</td>
        <td><button class="btn btn-primary btn-sm" type="button" data-pay="${w.id}">입금 기록</button></td></tr>`;
    }).join('')}</tbody></table></div>` : '<p class="hint">받을 돈이 없습니다. 👍</p>'}`;
  root.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => edit(byId(D.works, b.dataset.open)); });
  root.querySelectorAll('[data-pay]').forEach((b) => { b.onclick = () => quickPay(byId(D.works, b.dataset.pay)); });
}

/* 월별 합계 (최근 12개월) */
function drawMonth() {
  const months = []; const d = new Date(); d.setDate(1);
  for (let i = 0; i < 12; i++) { months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); d.setMonth(d.getMonth() - 1); }
  const rows = months.map((ym) => {
    const ws = D.works.filter((w) => (w.work_date || '').slice(0, 7) === ym && w.status !== 'canceled');
    const sales = ws.reduce((a, w) => a + num(w.supply), 0), cost = ws.reduce((a, w) => a + costOf(w), 0);
    const inflow = D.works.reduce((a, w) => a + (w.payments || []).filter((p) => (p.date || '').slice(0, 7) === ym).reduce((s, p) => s + num(p.amount), 0), 0);
    return { ym, n: ws.length, sales, cost, profit: sales - cost, inflow };
  });
  const T = rows.reduce((a, r) => ({ n: a.n + r.n, sales: a.sales + r.sales, cost: a.cost + r.cost, profit: a.profit + r.profit, inflow: a.inflow + r.inflow }), { n: 0, sales: 0, cost: 0, profit: 0, inflow: 0 });
  $('wk-body').innerHTML = `<p class="hint" style="margin-top:0">매출 · 비용 · 이익은 <b>작업일이 그 달인 작업</b>(취소 빼고, 공급가 기준 · VAT 별도), 입금액은 <b>그 달에 들어온 돈</b>(VAT 포함)입니다.</p>
    <div class="tbl-wrap"><table class="wk-table"><thead><tr><th>월</th><th class="num">작업</th><th class="num">매출 (공급가)</th><th class="num">비용</th><th class="num">이익</th><th class="num">입금액</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${r.ym.replace('-', '년 ')}월</td><td class="num">${r.n}건</td><td class="num">${won(r.sales)}</td><td class="num">${won(r.cost)}</td><td class="num"><b${r.profit < 0 ? ' class="wk-due"' : ''}>${won(r.profit)}</b></td><td class="num">${won(r.inflow)}</td></tr>`).join('')}
    <tr class="wk-sum"><td>12개월 합계</td><td class="num">${T.n}건</td><td class="num">${won(T.sales)}</td><td class="num">${won(T.cost)}</td><td class="num">${won(T.profit)}</td><td class="num">${won(T.inflow)}</td></tr></tbody></table></div>`;
}

/* ---------- 네이버 캘린더로 보내기 (api/calendar.js) ---------- */
function note(t) { V.note = t; const el = $('wk-note'); if (el) { el.textContent = t; el.classList.toggle('hidden', !t); } }
async function calApi(body) {
  const { data } = await sb.auth.getSession();
  const tk = data.session && data.session.access_token;
  const r = await fetch('/api/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` }, body: JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { setup: !!j.setup });
  return j;
}
async function syncCal(w) {
  try {
    if (!w.work_date || w.status === 'canceled') {   // 날짜를 지웠거나 취소 → 네이버에서도 빼기
      if (w.cal_href) { await calApi({ action: 'delete', href: w.cal_href }); await sb.from('works').update({ cal_href: null }).eq('id', w.id); w.cal_href = null; note('네이버 캘린더에서 일정을 뺐습니다.'); }
      return;
    }
    const memo = [w.contact && `담당자: ${w.contact}`, w.phone && `연락처: ${w.phone}`, w.address && `주소: ${w.address}`, total(w) ? `금액: ${won(total(w))}원 (VAT 포함)` : '', w.memo || '', '마하파킹 관리자: https://www.mahaparking.co.kr/admin/'].filter(Boolean).join('\n');
    const r = await calApi({ action: 'upsert', href: w.cal_href || '', title: `[마하파킹] ${w.site_name ? w.site_name + ' · ' : ''}${w.title}`, date: w.work_date, start: w.start_time || '', end: w.end_time || '', location: w.address || w.site_name || '', memo });
    if (r.href && r.href !== w.cal_href) { await sb.from('works').update({ cal_href: r.href }).eq('id', w.id); w.cal_href = r.href; }
    note(`네이버 캘린더에도 넣었습니다. (${w.start_time ? '하루 전 · 1시간 전' : '전날 저녁 6시'} 알림)`);
  } catch (e) {
    note(e.setup ? '작업은 저장했습니다. 네이버 캘린더는 아직 연결 전이라 넣지 못했습니다.' : `작업은 저장했습니다. 네이버 캘린더에는 넣지 못했습니다. (${e.message})`);
  }
}

/* ---------- 작업 추가 · 고치기 ---------- */
function edit(w, preset) {
  const isNew = !w;
  const W = Object.assign({ title: '', site_name: '', contact: '', phone: '', address: '', work_date: today(), start_time: '', end_time: '', status: 'planned', quote_id: null, supply: 0, vat: 0, costs: [], payments: [], invoice_date: '', memo: '' }, w || {}, preset || {});
  let costs = (W.costs || []).map((c) => Object.assign({}, c)), pays = (W.payments || []).map((p) => Object.assign({}, p));
  let items = (W.items || []).map((x) => Object.assign({}, x));
  if (!items.length) items = [{ name: '', qty: 1, price: '' }];
  if (isNew && !costs.length) costs = [{ name: '자재비', amount: '' }, { name: '출장비', amount: '' }];
  const qOpt = '<option value="">견적서 연결 안 함</option>' + D.quotes.map((q) => `<option value="${q.id}"${q.id === W.quote_id ? ' selected' : ''}>${esc(q.quote_no || '')} · ${esc(q.customer_name || '')} · ${won(q.supply)}원</option>`).join('');
  modal(`<h3>${isNew ? '작업 추가' : '작업 · 금액 · 수금'}</h3>
    <div class="wk-form">
      <label class="f wk-span2" for="w-title">작업 제목 *<input id="w-title" value="${esc(W.title)}" placeholder="예) 정문 차단바 교체 · 루프 재시공"></label>
      <label class="f" for="w-site">현장 (단지·건물)<input id="w-site" list="w-sites" value="${esc(W.site_name)}" placeholder="예) OO아파트"><datalist id="w-sites">${D.sites.map((s) => `<option value="${esc(s.name)}">`).join('')}</datalist></label>
      <label class="f" for="w-contact">담당자<input id="w-contact" value="${esc(W.contact)}" placeholder="예) 김OO 소장님"></label>
      <label class="f" for="w-phone">연락처<input id="w-phone" value="${esc(W.phone)}" inputmode="tel"></label>
      <label class="f" for="w-addr">주소<input id="w-addr" value="${esc(W.address)}"></label>
      <label class="f" for="w-date">작업일<input id="w-date" type="date" value="${esc(W.work_date || '')}"></label>
      <div class="wk-row2"><label class="f" for="w-st">시작<input id="w-st" type="time" value="${esc(W.start_time || '')}"></label><label class="f" for="w-et">끝<input id="w-et" type="time" value="${esc(W.end_time || '')}"></label></div>
      <label class="f" for="w-status">상태<select id="w-status">${Object.keys(ST).map((k) => `<option value="${k}"${k === W.status ? ' selected' : ''}>${ST[k][0]}</option>`).join('')}</select></label>
      <label class="f" for="w-inv">계산서 발행일<input id="w-inv" type="date" value="${esc(W.invoice_date || '')}"></label>
    </div>
    <div class="wk-money">
      <div class="wk-sec-h" style="margin-top:0"><b>작업 내역 · 금액</b><span class="hint">직접 적으면 공급가가 자동으로 더해집니다</span></div>
      <div class="wk-items-h" aria-hidden="true"><span>내용</span><span>수량</span><span>단가 (원)</span><span>금액 (원)</span><span></span></div>
      <div id="w-items"></div>
      <div class="add-row" style="margin:6px 0 10px;align-items:center"><button type="button" class="mini" id="w-additem">+ 줄 추가</button>
        <label class="hint" for="w-quote" style="display:flex;gap:6px;align-items:center;margin-left:auto">견적서에서 불러오기 (선택)<select id="w-quote" style="width:auto;max-width:280px">${qOpt}</select></label></div>
      <div class="wk-row3"><label class="f" for="w-sup">공급가 (원)<input id="w-sup" inputmode="numeric" value="${num(W.supply) ? won(W.supply) : ''}"></label>
        <label class="f" for="w-vat">부가세 (원) <button type="button" class="mini" id="w-vat10">10% 넣기</button><input id="w-vat" inputmode="numeric" value="${num(W.vat) ? won(W.vat) : ''}"></label>
        <div class="f"><span>합계</span><b id="w-tot" class="wk-big"></b></div></div>
      <div class="wk-sec-h"><b>비용 항목</b><span class="hint">이 작업에 든 돈 → 이익 계산</span></div><div id="w-costs"></div>
      <div class="add-row" style="margin:6px 0 0">${COST_NAMES.map((n) => `<button type="button" class="mini" data-addcost="${n}">+ ${n}</button>`).join('')}</div>
      <div class="wk-sec-h"><b>입금 기록</b><span class="hint">나눠 받으면 여러 줄로</span></div><div id="w-pays"></div>
      <div class="add-row" style="margin:6px 0 0"><button type="button" class="mini" id="w-addpay">+ 입금 추가</button><button type="button" class="mini" id="w-payall">+ 남은 금액 전부 입금</button></div>
      <div class="wk-calc" id="w-calc"></div>
    </div>
    <label class="f" for="w-memo">메모<textarea id="w-memo" rows="2">${esc(W.memo || '')}</textarea></label>
    <div class="btns" style="margin-top:12px"><button class="btn btn-primary" id="w-save">저장</button><button class="btn btn-line" data-close>닫기</button>${isNew ? '' : '<button class="btn btn-danger" id="w-del" style="margin-left:auto">삭제</button>'}</div>
    <p class="hint" id="w-msg" role="status"></p>`);
  $('modal-box').classList.add('wide');
  const money = (el) => { el.addEventListener('input', () => { const p = el.selectionStart, before = el.value.length; const n = num(el.value); el.value = el.value.trim() === '' ? '' : won(n); const d = el.value.length - before; try { el.setSelectionRange(p + d, p + d); } catch (e) {} calc(); }); };
  function lineAmt(x) { return x.amount !== undefined && x.amount !== '' && x.manual ? num(x.amount) : Math.round(num(x.qty || 0) * num(x.price)); }
  function drawItems() {
    $('w-items').innerHTML = items.map((x, i) => `<div class="wk-item"><input aria-label="작업 내용" data-in="${i}" value="${esc(x.name || '')}" placeholder="예) 양면 LED 차단바 교체"><input aria-label="수량" data-iq="${i}" inputmode="decimal" value="${esc(x.qty == null ? '' : x.qty)}"><input aria-label="단가" data-ip="${i}" inputmode="numeric" placeholder="0" value="${num(x.price) ? won(x.price) : ''}"><input aria-label="금액" data-ia="${i}" inputmode="numeric" placeholder="0" value="${lineAmt(x) ? won(lineAmt(x)) : ''}"><button type="button" class="row-del" data-ix="${i}" aria-label="줄 빼기">×</button></div>`).join('');
    const sumItems = () => { const t = items.reduce((a, x) => a + lineAmt(x), 0); if (items.some((x) => (x.name || '').trim() || lineAmt(x))) { $('w-sup').value = t ? won(t) : ''; if ($('w-vat10').dataset.auto !== 'off') $('w-vat').value = t ? won(Math.round(t * 0.1)) : ''; } calc(); };
    const refreshAmt = (i) => { const el = $('w-items').querySelector(`[data-ia="${i}"]`); if (el && !items[i].manual) el.value = lineAmt(items[i]) ? won(lineAmt(items[i])) : ''; };
    $('w-items').querySelectorAll('[data-in]').forEach((el) => { el.oninput = () => { items[+el.dataset.in].name = el.value; if (!$('w-title').value.trim() && +el.dataset.in === 0) $('w-title').placeholder = el.value || '예) 정문 차단바 교체 · 루프 재시공'; }; });
    $('w-items').querySelectorAll('[data-iq]').forEach((el) => { el.oninput = () => { const x = items[+el.dataset.iq]; x.qty = el.value; x.manual = false; refreshAmt(+el.dataset.iq); sumItems(); }; });
    $('w-items').querySelectorAll('[data-ip]').forEach((el) => { money(el); el.addEventListener('input', () => { const x = items[+el.dataset.ip]; x.price = num(el.value); x.manual = false; refreshAmt(+el.dataset.ip); sumItems(); }); });
    $('w-items').querySelectorAll('[data-ia]').forEach((el) => { money(el); el.addEventListener('input', () => { const x = items[+el.dataset.ia]; x.amount = num(el.value); x.manual = true; sumItems(); }); });
    $('w-items').querySelectorAll('[data-ix]').forEach((b) => { b.onclick = () => { items.splice(+b.dataset.ix, 1); if (!items.length) items.push({ name: '', qty: 1, price: '' }); drawItems(); sumItems(); }; });
  }
  function drawRows() {
    $('w-costs').innerHTML = costs.map((c, i) => `<div class="wk-line"><input aria-label="비용 이름" data-cn="${i}" value="${esc(c.name || '')}" list="w-costnames"><input aria-label="비용 금액" data-ca="${i}" inputmode="numeric" placeholder="금액" value="${num(c.amount) ? won(c.amount) : ''}"><button type="button" class="row-del" data-cx="${i}" aria-label="비용 빼기">×</button></div>`).join('') + `<datalist id="w-costnames">${COST_NAMES.map((n) => `<option value="${n}">`).join('')}</datalist>` || '';
    $('w-pays').innerHTML = pays.length ? pays.map((p, i) => `<div class="wk-line wk-line3"><input type="date" aria-label="입금일" data-pd="${i}" value="${esc(p.date || '')}"><input aria-label="입금액" data-pa="${i}" inputmode="numeric" placeholder="금액" value="${num(p.amount) ? won(p.amount) : ''}"><input aria-label="입금 메모" data-pm="${i}" placeholder="메모 (예: 계좌이체)" value="${esc(p.memo || '')}"><button type="button" class="row-del" data-px="${i}" aria-label="입금 빼기">×</button></div>`).join('') : '<p class="hint" style="margin:0">아직 입금 기록이 없습니다.</p>';
    $('w-costs').querySelectorAll('[data-cn]').forEach((el) => { el.oninput = () => { costs[+el.dataset.cn].name = el.value; }; });
    $('w-costs').querySelectorAll('[data-ca]').forEach((el) => { money(el); el.addEventListener('input', () => { costs[+el.dataset.ca].amount = num(el.value); calc(); }); });
    $('w-costs').querySelectorAll('[data-cx]').forEach((b) => { b.onclick = () => { costs.splice(+b.dataset.cx, 1); drawRows(); calc(); }; });
    $('w-pays').querySelectorAll('[data-pd]').forEach((el) => { el.oninput = () => { pays[+el.dataset.pd].date = el.value; }; });
    $('w-pays').querySelectorAll('[data-pa]').forEach((el) => { money(el); el.addEventListener('input', () => { pays[+el.dataset.pa].amount = num(el.value); calc(); }); });
    $('w-pays').querySelectorAll('[data-pm]').forEach((el) => { el.oninput = () => { pays[+el.dataset.pm].memo = el.value; }; });
    $('w-pays').querySelectorAll('[data-px]').forEach((b) => { b.onclick = () => { pays.splice(+b.dataset.px, 1); drawRows(); calc(); }; });
  }
  function calc() {
    const sup = num($('w-sup').value), vat = num($('w-vat').value), tot = sup + vat;
    const cost = costs.reduce((a, c) => a + num(c.amount), 0), paid = pays.reduce((a, p) => a + num(p.amount), 0);
    $('w-tot').textContent = won(tot) + '원';
    $('w-calc').innerHTML = `<span>이익 (공급가 − 비용) <b${sup - cost < 0 ? ' class="wk-due"' : ''}>${won(sup - cost)}원</b></span><span>받은 돈 <b>${won(paid)}원</b></span><span>미수금 <b class="${tot - paid > 0 ? 'wk-due' : ''}">${won(Math.max(0, tot - paid))}원</b></span>`;
    return { sup, vat, tot, paid };
  }
  money($('w-sup')); money($('w-vat'));
  $('w-vat').addEventListener('input', () => { $('w-vat10').dataset.auto = 'off'; });
  if (num(W.vat) && Math.round(num(W.supply) * 0.1) !== num(W.vat)) $('w-vat10').dataset.auto = 'off';
  $('w-vat10').onclick = () => { $('w-vat10').dataset.auto = ''; $('w-vat').value = won(Math.round(num($('w-sup').value) * 0.1)); calc(); };
  $('w-quote').onchange = function () {
    const q = byId(D.quotes, this.value); if (!q) return;
    const qi = (q.items || []).filter((r) => r.name || num(r.price)).map((r) => ({ name: [r.name, r.spec].filter(Boolean).join(' '), qty: r.qty == null ? 1 : r.qty, price: num(r.price) }));
    if (qi.length) { items = qi; drawItems(); }
    $('w-sup').value = won(q.supply); $('w-vat').value = won(q.vat != null ? q.vat : Math.round(num(q.supply) * 0.1));
    if (!$('w-title').value.trim() && q.title) $('w-title').value = q.title;
    if (!$('w-site').value.trim() && q.customer_name) $('w-site').value = q.customer_name;
    calc(); $('w-msg').textContent = '견적서 금액을 넣었습니다. 현장 상황에 맞게 고치셔도 됩니다.';
  };
  root.ownerDocument.querySelectorAll('[data-addcost]').forEach((b) => { b.onclick = () => { costs.push({ name: b.dataset.addcost, amount: '' }); drawRows(); const l = $('w-costs').querySelectorAll('[data-ca]'); if (l.length) l[l.length - 1].focus(); }; });
  $('w-addpay').onclick = () => { pays.push({ date: today(), amount: '', memo: '' }); drawRows(); const l = $('w-pays').querySelectorAll('[data-pa]'); if (l.length) l[l.length - 1].focus(); };
  $('w-payall').onclick = () => { const c = calc(); const left = Math.max(0, c.tot - c.paid); if (!left) { $('w-msg').textContent = '남은 금액이 없습니다.'; return; } pays.push({ date: today(), amount: left, memo: '' }); drawRows(); calc(); };
  $('w-additem').onclick = () => { items.push({ name: '', qty: 1, price: '' }); drawItems(); const l = $('w-items').querySelectorAll('[data-in]'); if (l.length) l[l.length - 1].focus(); };
  drawItems(); drawRows(); calc();

  $('w-save').onclick = async function () {
    const named = items.filter((x) => (x.name || '').trim());
    const title = $('w-title').value.trim() || (named.length ? named[0].name.trim() + (named.length > 1 ? ` 외 ${named.length - 1}건` : '') : '');
    if (!title) { $('w-msg').textContent = '작업 제목이나 작업 내역을 적어 주세요.'; $('w-title').focus(); return; }
    const c = calc(); let status = $('w-status').value;
    if (c.tot > 0 && c.paid >= c.tot && status !== 'canceled' && status !== 'paid') status = 'paid';   // 다 받으면 수금 완료로
    const siteName = $('w-site').value.trim(), site = D.sites.find((s) => s.name === siteName);
    const rec = {
      title, site_name: siteName || null, site_id: site ? site.id : null, contact: $('w-contact').value.trim() || null, phone: $('w-phone').value.trim() || null, address: $('w-addr').value.trim() || null,
      work_date: $('w-date').value || null, start_time: $('w-st').value || null, end_time: $('w-et').value || null, status,
      quote_id: $('w-quote').value || null, supply: c.sup, vat: c.vat, invoice_date: $('w-inv').value || null, memo: $('w-memo').value.trim() || null,
      items: items.filter((x) => (x.name || '').trim() || lineAmt(x)).map((x) => ({ name: (x.name || '').trim(), qty: num(x.qty) || 0, price: num(x.price), amount: lineAmt(x), manual: !!x.manual })),
      costs: costs.filter((x) => num(x.amount)).map((x) => ({ name: (x.name || '').trim() || '비용', amount: num(x.amount) })),
      payments: pays.filter((p) => num(p.amount)).map((p) => ({ date: p.date || today(), amount: num(p.amount), memo: (p.memo || '').trim() })),
      updated_at: new Date().toISOString(),
    };
    if (W.request_id) rec.request_id = W.request_id;
    this.disabled = true; $('w-msg').textContent = '저장하고 있습니다...';
    const r = isNew ? await sb.from('works').insert(rec).select().single() : await sb.from('works').update(rec).eq('id', W.id).select().single();
    if (r.error || !r.data) { this.disabled = false; $('w-msg').textContent = '저장하지 못했습니다. ' + ((r.error && r.error.message) || '다시 로그인한 뒤 해 주세요.'); return; }
    if (isNew) D.works.push(r.data); else D.works[D.works.findIndex((x) => x.id === W.id)] = r.data;
    D.works.sort((a, b) => ((a.work_date || '9999') < (b.work_date || '9999') ? -1 : 1));
    closeModal(); if (r.data.work_date) { V.ym = r.data.work_date.slice(0, 7); } V.note = '저장했습니다. 네이버 캘린더에 넣는 중...'; draw();
    syncCal(byId(D.works, r.data.id));
  };
  if (!isNew) $('w-del').onclick = () => {
    modal(`<h3>이 작업을 삭제할까요?</h3><p>${esc(W.site_name || '')} ${esc(W.title)}<br>금액·비용·입금 기록이 모두 지워지며 되돌릴 수 없습니다. 작업만 안 하게 됐다면 상태를 <b>취소</b>로 바꾸는 것을 권합니다.</p><div class="btns"><button class="btn btn-danger" id="w-del2">삭제</button><button class="btn btn-line" id="w-back">돌아가기</button></div>`);
    $('w-back').onclick = () => edit(W);
    $('w-del2').onclick = async () => { const r = await sb.from('works').delete().eq('id', W.id); if (r.error) return oops('삭제하지 못했습니다.', r.error); D.works = D.works.filter((x) => x.id !== W.id); closeModal(); V.note = ''; draw(); if (W.cal_href) calApi({ action: 'delete', href: W.cal_href }).then(() => note('작업을 지우고 네이버 캘린더에서도 뺐습니다.')).catch(() => note('작업을 지웠습니다. 네이버 캘린더 일정은 직접 지워 주세요.')); };
  };
}

/* 수금 현황에서 바로 입금 기록 */
function quickPay(w) {
  const left = dueOf(w);
  modal(`<h3>입금 기록</h3><p class="hint" style="margin:0">${esc(w.site_name || '')} · ${esc(w.title)}<br>합계 ${won(total(w))}원 · 받은 돈 ${won(paidOf(w))}원 · <b>미수금 ${won(left)}원</b></p>
    <div class="wk-row3" style="margin-top:12px"><label class="f" for="qp-date">입금일<input id="qp-date" type="date" value="${today()}"></label><label class="f" for="qp-amt">입금액 (원)<input id="qp-amt" inputmode="numeric" value="${won(left)}"></label><label class="f" for="qp-memo">메모<input id="qp-memo" placeholder="예) 계좌이체"></label></div>
    <div class="btns" style="margin-top:12px"><button class="btn btn-primary" id="qp-save">기록</button><button class="btn btn-line" data-close>닫기</button></div><p class="hint" id="qp-msg" role="status"></p>`);
  $('qp-amt').addEventListener('input', function () { this.value = this.value.trim() ? won(num(this.value)) : ''; });
  $('qp-save').onclick = async function () {
    const amt = num($('qp-amt').value); if (!amt) { $('qp-msg').textContent = '입금액을 적어 주세요.'; return; }
    const payments = (w.payments || []).concat([{ date: $('qp-date').value || today(), amount: amt, memo: $('qp-memo').value.trim() }]);
    const paid = payments.reduce((a, p) => a + num(p.amount), 0);
    const rec = { payments, updated_at: new Date().toISOString() }; if (paid >= total(w)) rec.status = 'paid';
    this.disabled = true;
    const r = await sb.from('works').update(rec).eq('id', w.id).select().single();
    if (r.error || !r.data) { this.disabled = false; $('qp-msg').textContent = '기록하지 못했습니다. ' + ((r.error && r.error.message) || ''); return; }
    D.works[D.works.findIndex((x) => x.id === w.id)] = r.data; closeModal(); draw();
  };
}

/* 다른 메뉴(견적 요청함 등)에서 "작업으로 등록" 할 때 쓰는 입구 */
window.mahaNewWork = async (preset) => {
  const btn = document.querySelector('#admin-tabs [data-tab="works"]'); if (btn) btn.click();
  if (!D.loaded) await load();
  if (D.loaded) edit(null, preset);
};

const tabBtn = document.querySelector('#admin-tabs [data-tab="works"]');
if (tabBtn) tabBtn.addEventListener('click', () => { if (!D.loaded) load(); });
if (location.hash === '#works') setTimeout(() => { if (!D.loaded) load(); }, 800);
