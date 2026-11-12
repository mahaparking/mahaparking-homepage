/* 마하파킹 관리자 화면 */
(function () {
  'use strict';
  var sb = supabase.createClient(MAHA.SB_URL, MAHA.SB_KEY);
  var CASE_TYPES = ['차단바 교체', '차단기 수리', '차단기 설치', '루프센서 시공', '센서 시공', '경광등 수리', '번호인식(LPR)', '자동출차 전환', '리모컨 · 출입', '기타'];
  var D = { cats: [], products: [], requests: [], quotes: [], cases: [] };
  var tab = 'requests';

  function fail(msg, err) { if (err) console.error(err); modal('<h3>저장하지 못했습니다</h3><p>' + esc(msg) + '</p><p class="hint">' + esc(err && err.message || '') + '</p><button class="btn btn-primary" data-close>확인</button>'); }
  function showOnly(id) { ['view-login', 'view-loading', 'view-admin'].forEach(function (v) { $(v).classList.toggle('hidden', v !== id); }); }

  /* ---------- 로그인 ---------- */
  function start() {
    sb.auth.getSession().then(function (r) {
      var s = r.data && r.data.session;
      if (!s) { showOnly('view-login'); setTimeout(function () { $('l-pass').focus(); }, 50); return; }
      sb.rpc('is_admin').then(function (a) {
        if (a.error || a.data !== true) { sb.auth.signOut(); showOnly('view-login'); $('l-msg').textContent = '관리자로 등록되지 않은 계정입니다.'; return; }
        $('who').textContent = s.user.email; showOnly('view-loading'); loadAll(function () { showOnly('view-admin'); render(); });
      });
    });
  }
  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = this.querySelector('button'); btn.disabled = true; $('l-msg').textContent = '';
    sb.auth.signInWithPassword({ email: $('l-email').value.trim(), password: $('l-pass').value }).then(function (r) {
      btn.disabled = false;
      if (r.error) { $('l-msg').textContent = '이메일 또는 비밀번호가 맞지 않습니다.'; return; }
      $('l-pass').value = ''; start();
    });
  });
  $('logout').onclick = function () { sb.auth.signOut().then(function () { location.reload(); }); };

  /* ---------- 불러오기 ---------- */
  function loadAll(cb) {
    Promise.all([
      sb.from('categories').select('*').order('sort'),
      sb.from('products').select('*').order('sort'),
      sb.from('requests').select('*').order('created_at', { ascending: false }).limit(300),
      sb.from('quotes').select('*').order('created_at', { ascending: false }).limit(300),
      sb.from('cases').select('*').order('work_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
    ]).then(function (r) {
      var err = r.filter(function (x) { return x.error; })[0];
      if (err) { fail('자료를 불러오지 못했습니다. 새로고침해 주세요.', err.error); }
      D.cats = r[0].data || []; D.products = r[1].data || []; D.requests = r[2].data || []; D.quotes = r[3].data || []; D.cases = r[4].data || [];
      cb && cb();
    });
  }

  /* ---------- 탭 ---------- */
  function render() {
    [].forEach.call(document.querySelectorAll('#admin-tabs button'), function (b) { b.setAttribute('aria-selected', b.dataset.tab === tab); });
    [].forEach.call(document.querySelectorAll('[data-panel]'), function (p) { p.classList.toggle('hidden', p.dataset.panel !== tab); });
    var n = D.requests.filter(function (r) { return r.status === 'new'; }).length;
    $('new-badge').textContent = n || ''; $('new-badge').classList.toggle('hidden', !n);
    if (tab === 'requests') drawRequests();
    if (tab === 'quote') drawQuote();
    if (tab === 'caseup') drawCaseAdmin();
    if (tab === 'prices') drawPrices();
  }
  [].forEach.call(document.querySelectorAll('#admin-tabs button'), function (b) { b.onclick = function () { tab = b.dataset.tab; render(); }; });

  /* ---------- 견적 요청함 ---------- */
  var ST = { new: ['새 요청', 'st-new'], quote: ['견적 작성 중', 'st-quote'], sent: ['견적 발송', 'st-sent'] };
  $('req-reload').onclick = function () { loadAll(render); };
  function drawRequests() {
    $('req-body').innerHTML = D.requests.length ? D.requests.map(function (r) {
      var items = (r.items || []).map(function (it) { return (it.name || '') + ' ' + it.qty + (it.unit || '') + (it.length ? ' (' + it.length + 'm)' : ''); }).join(', ');
      var s = ST[r.status] || ST.new;
      return '<tr><td style="white-space:nowrap">' + dot(r.created_at) + '</td><td>' + esc(r.kind) + '</td><td><b>' + esc(r.name || '(이름 없음)') + '</b><br><span class="hint">' + esc([r.phone, r.email, r.area].filter(Boolean).join(' · ')) + '</span></td>' +
        '<td style="max-width:340px">' + (items ? '<b>' + esc(items) + '</b><br>' : '') + '<span class="hint">' + esc(r.memo) + '</span>' + (r.photos && r.photos.length ? '<div class="req-photos" data-rp="' + r.id + '"><button class="mini" type="button" data-showp="' + r.id + '">사진 ' + r.photos.length + '장 보기</button></div>' : '') + '</td>' +
        '<td><select data-st="' + r.id + '" aria-label="상태" style="width:auto;padding:5px 8px;font-size:13px">' + Object.keys(ST).map(function (k) { return '<option value="' + k + '"' + (k === r.status ? ' selected' : '') + '>' + ST[k][0] + '</option>'; }).join('') + '</select></td>' +
        '<td style="white-space:nowrap"><button class="btn btn-primary btn-sm" data-mk="' + r.id + '">견적서 만들기</button> <button class="row-del" data-rdel="' + r.id + '" aria-label="요청 삭제">×</button></td></tr>';
    }).join('') : '<tr><td colspan="6" class="hint">아직 들어온 요청이 없습니다.</td></tr>';
    [].forEach.call($('req-body').querySelectorAll('[data-mk]'), function (b) { b.onclick = function () { startQuote(b.dataset.mk); }; });
    [].forEach.call($('req-body').querySelectorAll('[data-st]'), function (el) {
      el.onchange = function () {
        var r = D.requests.filter(function (x) { return x.id === el.dataset.st; })[0];
        sb.from('requests').update({ status: el.value }).eq('id', r.id).then(function (x) { if (x.error) return fail('상태를 바꾸지 못했습니다.', x.error); r.status = el.value; render(); });
      };
    });
    [].forEach.call($('req-body').querySelectorAll('[data-showp]'), function (b) {
      b.onclick = function () {
        var r = D.requests.filter(function (x) { return x.id === b.dataset.showp; })[0];
        sb.storage.from('request-photos').createSignedUrls(r.photos, 3600).then(function (x) {
          if (x.error) return fail('사진을 불러오지 못했습니다.', x.error);
          var box = $('req-body').querySelector('[data-rp="' + r.id + '"]');
          box.innerHTML = x.data.map(function (u) { return u.signedUrl ? '<img src="' + u.signedUrl + '" alt="고객 첨부 사진" data-big="' + u.signedUrl + '">' : ''; }).join('');
          [].forEach.call(box.querySelectorAll('[data-big]'), function (im) { im.onclick = function () { modal('<div class="viewer"><img src="' + im.dataset.big + '" alt="고객 첨부 사진"></div><a class="btn btn-line" href="' + im.dataset.big + '" target="_blank" rel="noopener">원본 열기</a><button class="btn btn-line" data-close>닫기</button>'); }; });
        });
      };
    });
    [].forEach.call($('req-body').querySelectorAll('[data-rdel]'), function (b) {
      b.onclick = function () {
        var r = D.requests.filter(function (x) { return x.id === b.dataset.rdel; })[0];
        modal('<h3>이 요청을 삭제할까요?</h3><p>' + esc(r.name || '') + ' · ' + dot(r.created_at) + '<br>삭제하면 되돌릴 수 없습니다.</p><div class="btns"><button class="btn btn-danger" id="do-rdel">삭제</button><button class="btn btn-line" data-close>취소</button></div>');
        $('do-rdel').onclick = function () {
          (r.photos && r.photos.length ? sb.storage.from('request-photos').remove(r.photos) : Promise.resolve()).then(function () {
            return sb.from('requests').delete().eq('id', r.id);
          }).then(function (x) { closeModal(); if (x.error) return fail('삭제하지 못했습니다.', x.error); D.requests = D.requests.filter(function (y) { return y.id !== r.id; }); render(); });
        };
      };
    });
  }

  /* ---------- 견적서 ---------- */
  var Q;
  function blankQuote() { return { id: null, quote_no: null, request_id: null, customer_name: '', customer_email: '', customer_phone: '', quote_date: today(), valid_days: 15, note: '부가세 별도 금액에 부가세 10%를 더한 합계입니다.\n현장 상황에 따라 작업 내용이 바뀌면 다시 안내드립니다.', rows: [{ pid: '', name: '', qty: 1, price: 0, disc: false }], sent_at: null }; }
  function product(id) { return D.products.filter(function (p) { return p.id === id; })[0]; }
  function findFee(word) { return D.products.filter(function (p) { return p.name.indexOf(word) >= 0; })[0]; }
  function rowFrom(p) { return p ? { pid: p.id, name: p.name, qty: 1, price: p.price, disc: false } : { pid: '', name: '', qty: 1, price: 0, disc: false }; }
  function startQuote(reqId) {
    var r = D.requests.filter(function (x) { return x.id === reqId; })[0];
    Q = blankQuote();
    if (r) {
      Q.request_id = r.id; Q.customer_name = r.name; Q.customer_email = r.email; Q.customer_phone = r.phone;
      var rows = (r.items || []).map(function (it) { var p = product(it.product_id); var row = rowFrom(p); if (!p) row.name = it.name || ''; row.qty = it.qty || 1; if (it.length) row.name += ' (' + it.length + 'm)'; return row; });
      if (rows.length) Q.rows = rows;
    }
    tab = 'quote'; render();
  }
  function loadQuote(q) {
    Q = { id: q.id, quote_no: q.quote_no, request_id: q.request_id, customer_name: q.customer_name, customer_email: q.customer_email, customer_phone: q.customer_phone, quote_date: q.quote_date, valid_days: q.valid_days, note: q.note, rows: (q.items || []).map(function (x) { return { pid: x.pid || '', name: x.name, qty: x.qty, price: x.price, disc: !!x.disc }; }), sent_at: q.sent_at };
    if (!Q.rows.length) Q.rows.push(rowFrom(null));
    tab = 'quote'; render(); window.scrollTo(0, 0);
  }
  function optList(sel) {
    var html = '<option value="">항목 선택 · 직접 입력</option>';
    D.cats.forEach(function (c) {
      var ps = D.products.filter(function (p) { return p.category_id === c.id && p.use_in_quote; });
      if (!ps.length) return;
      html += '<optgroup label="' + esc(c.name) + '">' + ps.map(function (p) { return '<option value="' + p.id + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.name) + (p.price ? ' · ' + won(p.price) + '원' : '') + '</option>'; }).join('') + '</optgroup>';
    });
    return html;
  }
  function calc() { var sup = 0; Q.rows.forEach(function (r) { sup += (r.disc ? -1 : 1) * Math.abs((+r.qty || 0) * (+r.price || 0)); }); var vat = Math.round(sup * 0.1); return { sup: sup, vat: vat, tot: sup + vat }; }
  function drawQuote() {
    if (!Q) Q = blankQuote();
    $('q-name').value = Q.customer_name; $('q-email').value = Q.customer_email; $('q-phone').value = Q.customer_phone;
    $('q-date').value = Q.quote_date; $('q-valid').value = String(Q.valid_days); $('q-note').value = Q.note;
    $('q-body').innerHTML = Q.rows.map(function (r, i) {
      return '<tr><td><select data-i="' + i + '" data-k="pid" aria-label="항목 선택">' + optList(r.pid) + '</select><input data-i="' + i + '" data-k="name" value="' + esc(r.name) + '" placeholder="항목 이름" aria-label="항목 이름" style="margin-top:6px">' + (r.disc ? '<span class="status st-new" style="margin-top:6px">할인</span>' : '') + '</td>' +
        '<td><input data-i="' + i + '" data-k="qty" type="number" min="0" step="any" value="' + r.qty + '" aria-label="수량"></td>' +
        '<td class="num"><input data-i="' + i + '" data-k="price" inputmode="numeric" value="' + won(r.price) + '" style="text-align:right" aria-label="단가"></td>' +
        '<td class="num" id="amt-' + i + '">' + (r.disc ? '-' : '') + won(Math.abs(r.qty * r.price)) + '</td>' +
        '<td><button class="row-del" type="button" data-del="' + i + '" aria-label="줄 삭제">×</button></td></tr>';
    }).join('');
    [].forEach.call($('q-body').querySelectorAll('[data-k]'), function (el) {
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', function () {
        var i = +el.dataset.i, k = el.dataset.k, r = Q.rows[i];
        if (k === 'pid') { var p = product(el.value); r.pid = el.value; if (p) { r.name = p.name; r.price = p.price; } drawQuote(); return; }
        if (k === 'price') r.price = parseInt(el.value.replace(/[^0-9]/g, ''), 10) || 0;
        else if (k === 'qty') r.qty = parseFloat(el.value) || 0;
        else r[k] = el.value;
        $('amt-' + i).textContent = (r.disc ? '-' : '') + won(Math.abs(r.qty * r.price));
        drawTotals();
      });
      if (el.dataset.k === 'price') el.addEventListener('blur', function () { el.value = won(Q.rows[+el.dataset.i].price); });
    });
    [].forEach.call($('q-body').querySelectorAll('[data-del]'), function (b) { b.onclick = function () { Q.rows.splice(+b.dataset.del, 1); if (!Q.rows.length) Q.rows.push(rowFrom(null)); drawQuote(); }; });
    $('q-msg').textContent = Q.quote_no ? '불러온 견적서: ' + Q.quote_no + (Q.sent_at ? ' (발송 ' + dot(Q.sent_at) + ')' : '') : '새 견적서입니다. 저장하면 견적번호가 붙습니다.';
    drawTotals(); drawQuoteList();
  }
  function drawTotals() {
    var t = calc();
    $('q-totals').innerHTML = '<div><span>공급가액</span><span>' + won(t.sup) + '원</span></div><div><span>부가세 (10%)</span><span>' + won(t.vat) + '원</span></div><div class="grand"><span>합계</span><span>' + won(t.tot) + '원</span></div>';
    $('q-doc').innerHTML = docHtml(Q.quote_no || '(저장 시 부여)');
  }
  function validDate() { var d = new Date((Q.quote_date || today()) + 'T00:00:00'); d.setDate(d.getDate() + (+Q.valid_days || 15)); return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0'); }
  function docHtml(no) {
    var t = calc();
    return '<h2>견적서</h2><div class="doc-head"><div><b>' + esc(Q.customer_name || '고객명') + '</b> 귀하<br>견적번호 ' + esc(no) + '<br>견적일 ' + dot(Q.quote_date) + '<br>유효기간 ' + validDate() + '까지</div>' +
      '<div><img src="/assets/logo-h-blue.png" alt="마하파킹" style="height:34px;display:block;margin-bottom:4px">주차장비 유지보수 &amp; 업싸이클링<br>' + MAHA.PHONE + '<br>' + MAHA.EMAIL + '<br><span style="font-size:11.5px;color:#5A6873">대표 조상현 · 사업자 273-11-02830<br>경기도 안양시 만안구 만안로 31-3, 9층 911호</span></div></div>' +
      '<table><thead><tr><th>항목</th><th class="num">수량</th><th class="num">단가</th><th class="num">금액</th></tr></thead><tbody>' +
      Q.rows.filter(function (r) { return r.name || r.price; }).map(function (r) { return '<tr><td>' + esc(r.name) + '</td><td class="num">' + r.qty + '</td><td class="num">' + (r.disc ? '-' : '') + won(r.price) + '</td><td class="num">' + (r.disc ? '-' : '') + won(Math.abs(r.qty * r.price)) + '</td></tr>'; }).join('') +
      '</tbody></table><div style="margin-top:8px;text-align:right;font-variant-numeric:tabular-nums">공급가액 ' + won(t.sup) + '원 · 부가세 ' + won(t.vat) + '원</div><div class="sum">합계 금액 ' + won(t.tot) + '원 (부가세 포함)</div>' + (Q.note ? '<div class="foot">' + esc(Q.note) + '</div>' : '');
  }
  var QF = { 'q-name': 'customer_name', 'q-email': 'customer_email', 'q-phone': 'customer_phone', 'q-date': 'quote_date', 'q-valid': 'valid_days', 'q-note': 'note' };
  Object.keys(QF).forEach(function (id) { $(id).addEventListener('input', function () { Q[QF[id]] = id === 'q-valid' ? +this.value : this.value; drawTotals(); }); });
  [].forEach.call(document.querySelectorAll('[data-add]'), function (b) {
    b.onclick = function () {
      var k = b.dataset.add, row;
      if (k === 'travel') row = rowFrom(findFee('출장'));
      else if (k === 'install') row = rowFrom(findFee('설치비'));
      else if (k === 'discount') row = { pid: '', name: '할인', qty: 1, price: 0, disc: true };
      else row = rowFrom(null);
      if (k === 'travel' && !row.name) row.name = '출장비';
      if (k === 'install' && !row.name) row.name = '설치비';
      Q.rows.push(row); drawQuote();
      var rows = $('q-body').querySelectorAll('tr'), last = rows[rows.length - 1];
      if (last) { var f = last.querySelector(k === 'product' ? 'select' : '[data-k="price"]'); if (f) f.focus(); }
    };
  });
  $('q-reset').onclick = function () { Q = blankQuote(); drawQuote(); };
  function nextQuoteNo() {
    var d = (Q.quote_date || today()).replace(/-/g, ''), pre = 'Q-' + d + '-';
    return sb.from('quotes').select('quote_no').like('quote_no', pre + '%').then(function (r) {
      var n = 0; (r.data || []).forEach(function (x) { n = Math.max(n, parseInt(x.quote_no.slice(pre.length), 10) || 0); });
      return pre + String(n + 1).padStart(2, '0');
    });
  }
  function saveQuote() {
    if (!Q.customer_name && !Q.customer_email) { fail('고객 이름이나 이메일을 적어 주세요.'); return Promise.reject(); }
    if (!Q.rows.some(function (r) { return r.price > 0; })) { fail('금액이 들어간 항목이 없습니다. 단가를 적어 주세요.'); return Promise.reject(); }
    var t = calc();
    var rec = { request_id: Q.request_id, customer_name: Q.customer_name, customer_email: Q.customer_email, customer_phone: Q.customer_phone, quote_date: Q.quote_date || today(), valid_days: +Q.valid_days || 15, items: Q.rows.filter(function (r) { return r.name || r.price; }), supply: t.sup, vat: t.vat, total: t.tot, note: Q.note };
    var p = Q.id ? sb.from('quotes').update(rec).eq('id', Q.id).select().single()
      : nextQuoteNo().then(function (no) { rec.quote_no = no; return sb.from('quotes').insert(rec).select().single(); });
    return p.then(function (r) {
      if (r.error) { fail('견적서를 저장하지 못했습니다.', r.error); throw r.error; }
      var q = r.data; Q.id = q.id; Q.quote_no = q.quote_no;
      D.quotes = [q].concat(D.quotes.filter(function (x) { return x.id !== q.id; }));
      var req = D.requests.filter(function (x) { return x.id === Q.request_id; })[0];
      if (req && req.status === 'new') { req.status = 'quote'; sb.from('requests').update({ status: 'quote' }).eq('id', req.id).then(function () {}); }
      drawQuote(); $('q-msg').textContent = Q.quote_no + ' 저장했습니다.';
      return q;
    });
  }
  $('q-save').onclick = function () { saveQuote().catch(function () {}); };
  function printQuote(q) {
    var w = window.open('', '_blank');
    if (!w) { fail('팝업이 막혀 있습니다. 브라우저 주소창 오른쪽에서 이 사이트의 팝업을 허용해 주세요.'); return; }
    var css = '<link rel="stylesheet" href="/assets/site.css"><style>body{background:#fff;padding:20px}.doc{border:0;box-shadow:none;max-width:760px;margin:0 auto;font-size:14px}@page{size:A4;margin:14mm}</style>';
    w.document.write('<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>마하파킹_견적서_' + esc(q.quote_no) + '</title>' + css + '</head><body><div class="doc">' + docHtml(q.quote_no) + '</div><script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script></body></html>');
    w.document.close();
  }
  $('q-print').onclick = function () { saveQuote().then(printQuote).catch(function () {}); };
  function mailQuote(q) {
    var t = calc();
    var body = Q.customer_name + '님, 안녕하세요. 마하파킹입니다.\n\n요청하신 작업의 견적서를 첨부해 보내 드립니다.\n· 견적번호: ' + q.quote_no + '\n· 합계 금액: ' + won(t.tot) + '원 (부가세 포함)\n· 유효기간: ' + validDate() + '까지\n\n궁금하신 점은 이 메일에 답장하시거나 ' + MAHA.PHONE + '으로 연락 주세요.\n\n마하파킹 드림\n' + MAHA.PHONE + ' · ' + MAHA.EMAIL;
    var subject = '[마하파킹] 요청하신 견적서를 보내 드립니다 (' + q.quote_no + ')';
    modal('<h3>고객에게 메일 보내기</h3><ol style="margin:0;padding-left:20px;line-height:1.8"><li><b>PDF 저장 · 인쇄</b>로 견적서를 PDF 파일로 저장합니다.</li><li>아래 <b>메일 앱 열기</b>를 누르거나, 내용을 복사해 하이웍스 메일에 붙여 넣습니다.</li><li>저장한 PDF를 첨부해 보냅니다.</li><li>보낸 뒤 <b>발송 완료로 표시</b>를 누릅니다.</li></ol>' +
      '<div class="mail"><div class="mh"><span>받는 곳</span><span>' + esc(Q.customer_email || '(이메일 없음)') + '</span><span>제목</span><span>' + esc(subject) + '</span></div><div style="white-space:pre-line">' + esc(body) + '</div></div>' +
      '<div class="btns"><a class="btn btn-primary" href="mailto:' + encodeURIComponent(Q.customer_email || '') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body) + '">메일 앱 열기</a><button class="btn btn-line" id="m-copy">내용 복사</button><button class="btn btn-cta" id="m-sent">발송 완료로 표시</button><button class="btn btn-line" data-close>닫기</button></div>');
    $('m-copy').onclick = function () { var b = this; try { navigator.clipboard.writeText(subject + '\n\n' + body).then(function () { b.textContent = '복사했습니다'; }); } catch (e) { b.textContent = '복사 실패'; } };
    $('m-sent').onclick = function () { markSent(q.id); closeModal(); };
  }
  function markSent(id) {
    var now = new Date().toISOString();
    sb.from('quotes').update({ sent_at: now }).eq('id', id).select().single().then(function (r) {
      if (r.error) return fail('발송 표시를 하지 못했습니다.', r.error);
      D.quotes = D.quotes.map(function (x) { return x.id === id ? r.data : x; });
      if (Q && Q.id === id) Q.sent_at = now;
      var req = D.requests.filter(function (x) { return x.id === r.data.request_id; })[0];
      if (req) { req.status = 'sent'; sb.from('requests').update({ status: 'sent' }).eq('id', req.id).then(function () {}); }
      render();
    });
  }
  $('q-mail').onclick = function () { saveQuote().then(mailQuote).catch(function () {}); };

  /* 견적서 PDF 만들기 (브라우저에서) + 메일 자동 발송 */
  function loadScript(src) { return new Promise(function (ok, no) { var el = document.createElement('script'); el.src = src; el.onload = ok; el.onerror = no; document.head.appendChild(el); }); }
  function pdfLibs() {
    if (window.html2canvas && window.jspdf) return Promise.resolve();
    return loadScript('/assets/html2canvas.min.js').then(function () { return loadScript('/assets/jspdf.umd.min.js'); });
  }
  function makePdfBase64(q) {
    return pdfLibs().then(function () {
      var box = document.createElement('div');
      box.className = 'doc';
      box.style.cssText = 'position:fixed;left:-10000px;top:0;width:760px;font-size:14px;border:0;box-shadow:none;background:#fff';
      box.innerHTML = docHtml(q.quote_no);
      document.body.appendChild(box);
      var imgs = [].slice.call(box.querySelectorAll('img'));
      return Promise.all(imgs.map(function (im) { return im.complete ? 1 : new Promise(function (r) { im.onload = im.onerror = r; }); }))
        .then(function () { return window.html2canvas(box, { scale: 2, backgroundColor: '#ffffff', useCORS: true }); })
        .then(function (canvas) {
          document.body.removeChild(box);
          var pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
          var w = 182, h = canvas.height * w / canvas.width, pageH = 269;
          var img = canvas.toDataURL('image/jpeg', 0.92);
          if (h <= pageH) pdf.addImage(img, 'JPEG', 14, 14, w, h);
          else { var y = 0; while (y < h) { if (y > 0) pdf.addPage(); pdf.addImage(img, 'JPEG', 14, 14 - y, w, h); y += pageH; } }
          return pdf.output('datauristring').split(',')[1];
        }, function (e) { if (box.parentNode) document.body.removeChild(box); throw e; });
    });
  }
  $('q-send').onclick = function () {
    var btn = this;
    if (!Q.customer_email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(Q.customer_email)) { fail('받는 이메일 주소를 확인해 주세요.'); return; }
    saveQuote().then(function (q) {
      var t = calc();
      modal('<h3>견적서를 메일로 보낼까요?</h3><div class="mail"><div class="mh"><span>받는 곳</span><span>' + esc(Q.customer_email) + '</span><span>보내는 곳</span><span>마하파킹 &lt;' + MAHA.EMAIL + '&gt;</span><span>제목</span><span>[마하파킹] 요청하신 견적서를 보내 드립니다 (' + esc(q.quote_no) + ')</span><span>첨부</span><span>마하파킹_견적서_' + esc(q.quote_no) + '.pdf</span></div>합계 <b>' + won(t.tot) + '원</b> (부가세 포함)<br><span class="hint">대표님 메일함(' + MAHA.EMAIL + ')에도 사본이 함께 갑니다.</span></div><div class="btns"><button class="btn btn-cta" id="do-send">보내기</button><button class="btn btn-line" data-close>취소</button></div><p class="hint" id="send-msg" role="status"></p>');
      $('do-send').onclick = function () {
        var b = this; b.disabled = true; $('send-msg').textContent = '견적서 PDF를 만들고 있습니다...';
        makePdfBase64(q).then(function (pdf) {
          $('send-msg').textContent = '메일을 보내고 있습니다...';
          return sb.functions.invoke('send-quote', { body: { quote_id: q.id, pdf_base64: pdf } });
        }).then(function (r) {
          if (r.error || !r.data || !r.data.ok) {
            var msg = (r.data && r.data.error) || (r.error && r.error.message) || '알 수 없는 오류';
            if (r.error && r.error.context && r.error.context.json) { return r.error.context.json().then(function (j) { throw new Error(j.error || msg); }, function () { throw new Error(msg); }); }
            throw new Error(msg);
          }
          D.quotes = D.quotes.map(function (x) { return x.id === q.id ? Object.assign({}, x, { sent_at: r.data.sent_at }) : x; });
          if (Q && Q.id === q.id) Q.sent_at = r.data.sent_at;
          var req = D.requests.filter(function (x) { return x.id === q.request_id; })[0]; if (req) req.status = 'sent';
          $('modal-box').innerHTML = '<h3>메일을 보냈습니다</h3><p>' + esc(Q.customer_email) + ' 앞으로 견적서 ' + esc(q.quote_no) + '를 보냈습니다. 하이웍스 메일함에서도 사본을 확인하실 수 있습니다.</p><button class="btn btn-primary" data-close>확인</button>';
          render();
        }).catch(function (e) {
          b.disabled = false;
          $('send-msg').innerHTML = '<b style="color:#D7392B">보내지 못했습니다.</b> ' + esc(e && e.message || e) + '<br>"직접 메일 쓰기"로 보내실 수도 있습니다.';
        });
      };
    }).catch(function () {});
  };
  function drawQuoteList() {
    $('sent-body').innerHTML = D.quotes.length ? D.quotes.map(function (q) {
      return '<tr><td>' + esc(q.quote_no) + '</td><td>' + dot(q.quote_date) + '</td><td>' + esc(q.customer_name) + '</td><td>' + esc(q.customer_email) + '</td><td class="num">' + won(q.total) + '원</td><td>' + (q.sent_at ? '<span class="status st-sent">발송 ' + dot(q.sent_at) + '</span>' : '<span class="status st-quote">저장</span>') + '</td>' +
        '<td style="white-space:nowrap"><button class="mini" data-qopen="' + q.id + '">불러오기</button> ' + (q.sent_at ? '' : '<button class="mini" data-qsent="' + q.id + '">발송 완료</button> ') + '<button class="row-del" data-qdel="' + q.id + '" aria-label="견적서 삭제">×</button></td></tr>';
    }).join('') : '<tr><td colspan="7" class="hint">아직 저장한 견적서가 없습니다.</td></tr>';
    [].forEach.call($('sent-body').querySelectorAll('[data-qopen]'), function (b) { b.onclick = function () { loadQuote(D.quotes.filter(function (x) { return x.id === b.dataset.qopen; })[0]); }; });
    [].forEach.call($('sent-body').querySelectorAll('[data-qsent]'), function (b) { b.onclick = function () { markSent(b.dataset.qsent); }; });
    [].forEach.call($('sent-body').querySelectorAll('[data-qdel]'), function (b) {
      b.onclick = function () {
        var q = D.quotes.filter(function (x) { return x.id === b.dataset.qdel; })[0];
        modal('<h3>견적서 ' + esc(q.quote_no) + '을 삭제할까요?</h3><p>삭제하면 되돌릴 수 없습니다.</p><div class="btns"><button class="btn btn-danger" id="do-qdel">삭제</button><button class="btn btn-line" data-close>취소</button></div>');
        $('do-qdel').onclick = function () { sb.from('quotes').delete().eq('id', q.id).then(function (x) { closeModal(); if (x.error) return fail('삭제하지 못했습니다.', x.error); D.quotes = D.quotes.filter(function (y) { return y.id !== q.id; }); if (Q && Q.id === q.id) Q = blankQuote(); render(); }); };
      };
    });
  }

  /* ---------- 시공사례 ---------- */
  $('k-type').innerHTML = CASE_TYPES.map(function (t) { return '<option>' + t + '</option>'; }).join('');
  $('k-date').value = today();
  var kPhotos = [];
  $('k-photo').addEventListener('change', function () {
    var fs = [].slice.call(this.files).slice(0, 8 - kPhotos.length); this.value = '';
    $('k-msg').textContent = '사진을 정리하고 있습니다...';
    Promise.all(fs.map(function (f) { return shrinkToBlob(f, 1600); })).then(function (r) { kPhotos = kPhotos.concat(r.filter(Boolean)); drawK(); $('k-msg').textContent = ''; });
  });
  function drawK() { drawThumbs('k-thumbs', kPhotos, function (i) { kPhotos.splice(i, 1); drawK(); }); }
  $('case-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = this, btn = form.querySelector('button[type=submit]');
    var v = function (id) { return $(id).value.trim(); };
    if (!v('k-title')) { $('k-msg').textContent = '제목을 적어 주세요.'; $('k-title').focus(); return; }
    btn.disabled = true; $('k-msg').textContent = '사진을 올리고 있습니다...';
    var folder = today().slice(0, 7) + '/' + rid();
    Promise.all(kPhotos.map(function (p, i) {
      var path = folder + '/' + (i + 1) + '.jpg';
      return sb.storage.from('case-photos').upload(path, p.blob, { contentType: 'image/jpeg' }).then(function (r) { if (r.error) throw r.error; return path; });
    })).then(function (paths) {
      return sb.from('cases').insert({ title: v('k-title'), area: v('k-area'), work_type: $('k-type').value, work_date: $('k-date').value || null, description: v('k-desc'), result: v('k-result'), photos: paths }).select().single();
    }).then(function (r) {
      btn.disabled = false;
      if (r.error) throw r.error;
      D.cases.unshift(r.data); form.reset(); $('k-date').value = today(); kPhotos = []; drawK(); drawCaseAdmin();
      $('k-msg').textContent = '홈페이지에 올렸습니다.';
    }).catch(function (err) { btn.disabled = false; $('k-msg').textContent = ''; fail('시공사례를 올리지 못했습니다.', err); });
  });
  function drawCaseAdmin() {
    $('case-body').innerHTML = D.cases.length ? D.cases.map(function (c) {
      return '<tr><td>' + dot(c.work_date) + '</td><td><b>' + esc(c.title) + '</b></td><td>' + esc(c.area) + '</td><td>' + esc(c.work_type) + '</td><td>' + (c.photos ? c.photos.length : 0) + '장</td>' +
        '<td style="text-align:center"><input type="checkbox" data-pub="' + c.id + '"' + (c.published ? ' checked' : '') + ' aria-label="홈페이지 공개" style="width:18px;height:18px"></td>' +
        '<td><button class="btn btn-danger btn-sm" data-delc="' + c.id + '">삭제</button></td></tr>';
    }).join('') : '<tr><td colspan="7" class="hint">아직 올린 시공사례가 없습니다.</td></tr>';
    [].forEach.call($('case-body').querySelectorAll('[data-pub]'), function (el) {
      el.onchange = function () { var c = D.cases.filter(function (x) { return x.id === el.dataset.pub; })[0]; sb.from('cases').update({ published: el.checked }).eq('id', c.id).then(function (r) { if (r.error) { el.checked = !el.checked; return fail('공개 설정을 바꾸지 못했습니다.', r.error); } c.published = el.checked; }); };
    });
    [].forEach.call($('case-body').querySelectorAll('[data-delc]'), function (b) {
      b.onclick = function () {
        var c = D.cases.filter(function (x) { return x.id === b.dataset.delc; })[0];
        modal('<h3>이 시공사례를 삭제할까요?</h3><p>' + esc(c.title) + '<br>사진도 함께 지워지며 되돌릴 수 없습니다. 잠시 내리기만 하려면 "홈페이지 공개"를 끄세요.</p><div class="btns"><button class="btn btn-danger" id="do-del">삭제</button><button class="btn btn-line" data-close>취소</button></div>');
        $('do-del').onclick = function () {
          (c.photos && c.photos.length ? sb.storage.from('case-photos').remove(c.photos) : Promise.resolve()).then(function () { return sb.from('cases').delete().eq('id', c.id); })
            .then(function (r) { closeModal(); if (r.error) return fail('삭제하지 못했습니다.', r.error); D.cases = D.cases.filter(function (x) { return x.id !== c.id; }); drawCaseAdmin(); });
        };
      };
    });
  }

  /* ---------- 견적 항목 관리 ---------- */
  var pf = 'all', pq = '';
  function flash(t) { $('price-msg').textContent = t; clearTimeout(flash.t); flash.t = setTimeout(function () { $('price-msg').textContent = ''; }, 2500); }
  function catName(id) { var c = D.cats.filter(function (x) { return x.id === id; })[0]; return c ? c.name : '미분류'; }
  function upd(table, id, patch, cb) { return sb.from(table).update(patch).eq('id', id).then(function (r) { if (r.error) { fail('저장하지 못했습니다.', r.error); return; } flash('저장했습니다.'); cb && cb(); }); }
  function drawCatsBox() {
    var a = D.cats;
    $('cat-list').innerHTML = a.map(function (c, i) {
      var n = D.products.filter(function (p) { return p.category_id === c.id; }).length;
      return '<div class="cat-item"><button class="mini" data-cmv="' + i + '" data-d="-1" aria-label="앞으로"' + (i === 0 ? ' disabled' : '') + '>◀</button><input data-ci="' + i + '" value="' + esc(c.name) + '" aria-label="구분 이름"><span class="cnt">' + n + '개</span><button class="mini" data-cmv="' + i + '" data-d="1" aria-label="뒤로"' + (i === a.length - 1 ? ' disabled' : '') + '>▶</button><button class="row-del" data-cdel="' + i + '" aria-label="구분 삭제">×</button></div>';
    }).join('');
    [].forEach.call($('cat-list').querySelectorAll('[data-ci]'), function (el) {
      el.onchange = function () { var c = a[+el.dataset.ci], v = el.value.trim(); if (!v) { el.value = c.name; return; } upd('categories', c.id, { name: v }, function () { c.name = v; drawPrices(); }); };
    });
    [].forEach.call($('cat-list').querySelectorAll('[data-cmv]'), function (b) {
      b.onclick = function () {
        var i = +b.dataset.cmv, j = i + (+b.dataset.d), x = a[i], y = a[j];
        var sx = x.sort, sy = y.sort; if (sx === sy) { sx = i; sy = j; }
        Promise.all([sb.from('categories').update({ sort: sy }).eq('id', x.id), sb.from('categories').update({ sort: sx }).eq('id', y.id)]).then(function (r) {
          if (r[0].error || r[1].error) return fail('순서를 바꾸지 못했습니다.', r[0].error || r[1].error);
          x.sort = sy; y.sort = sx; a.sort(function (m, n) { return m.sort - n.sort; }); drawPrices();
        });
      };
    });
    [].forEach.call($('cat-list').querySelectorAll('[data-cdel]'), function (b) {
      b.onclick = function () {
        var c = a[+b.dataset.cdel], n = D.products.filter(function (p) { return p.category_id === c.id; }).length;
        if (n) { modal('<h3>"' + esc(c.name) + '" 구분에 항목이 ' + n + '개 있습니다</h3><p>항목을 다른 구분으로 옮기거나 지운 뒤에 구분을 삭제할 수 있습니다.</p><button class="btn btn-primary" data-close>확인</button>'); return; }
        sb.from('categories').delete().eq('id', c.id).then(function (r) { if (r.error) return fail('구분을 삭제하지 못했습니다.', r.error); D.cats = D.cats.filter(function (x) { return x.id !== c.id; }); drawPrices(); });
      };
    });
  }
  $('cat-add').onclick = function () {
    var v = $('cat-new').value.trim(); if (!v) { $('cat-new').focus(); return; }
    var sort = D.cats.reduce(function (m, c) { return Math.max(m, c.sort); }, 0) + 1;
    sb.from('categories').insert({ name: v, sort: sort }).select().single().then(function (r) { if (r.error) return fail('구분을 추가하지 못했습니다.', r.error); D.cats.push(r.data); $('cat-new').value = ''; flash('"' + v + '" 구분을 추가했습니다.'); drawPrices(); });
  };
  function prodsIn(cid) { return D.products.filter(function (p) { return p.category_id === cid; }).sort(function (a, b) { return a.sort - b.sort; }); }
  function drawPrices() {
    drawCatsBox();
    if (pf !== 'all' && !D.cats.some(function (c) { return c.id === pf; })) pf = 'all';
    $('price-filter').innerHTML = '<option value="all">전체</option>' + D.cats.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('');
    $('price-filter').value = pf;
    var rows = '';
    D.cats.forEach(function (c) {
      if (pf !== 'all' && pf !== c.id) return;
      var list = prodsIn(c.id).filter(function (p) { return !pq || p.name.indexOf(pq) >= 0; });
      if (!list.length) return;
      rows += '<tr class="grp"><td colspan="10">' + esc(c.name) + ' · ' + list.length + '개</td></tr>';
      var all = prodsIn(c.id);
      list.forEach(function (p) {
        var k = all.indexOf(p);
        rows += '<tr class="' + (p.use_in_quote ? '' : 'off') + '"><td style="white-space:nowrap"><button class="mini" data-mv="' + p.id + '" data-d="-1" aria-label="위로"' + (k > 0 ? '' : ' disabled') + '>▲</button> <button class="mini" data-mv="' + p.id + '" data-d="1" aria-label="아래로"' + (k < all.length - 1 ? '' : ' disabled') + '>▼</button></td>' +
          '<td><select data-pid="' + p.id + '" data-pk="category_id" aria-label="구분" style="min-width:130px">' + D.cats.map(function (x) { return '<option value="' + x.id + '"' + (x.id === p.category_id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></td>' +
          '<td><input data-pid="' + p.id + '" data-pk="name" value="' + esc(p.name) + '" aria-label="이름" style="min-width:170px"></td>' +
          '<td><input data-pid="' + p.id + '" data-pk="description" value="' + esc(p.description) + '" aria-label="설명" style="min-width:200px"></td>' +
          '<td><input data-pid="' + p.id + '" data-pk="unit" value="' + esc(p.unit) + '" aria-label="단위" style="width:60px"></td>' +
          '<td class="num"><input data-pid="' + p.id + '" data-pk="price" inputmode="numeric" value="' + won(p.price) + '" aria-label="기본 단가" style="text-align:right;width:115px"></td>' +
          '<td style="text-align:center"><input type="checkbox" data-pid="' + p.id + '" data-pk="use_in_quote"' + (p.use_in_quote ? ' checked' : '') + ' aria-label="견적서에 사용"></td>' +
          '<td style="text-align:center"><input type="checkbox" data-pid="' + p.id + '" data-pk="show_on_site"' + (p.show_on_site ? ' checked' : '') + ' aria-label="홈페이지 표시"></td>' +
          '<td style="text-align:center"><input type="checkbox" data-pid="' + p.id + '" data-pk="ask_length"' + (p.ask_length ? ' checked' : '') + ' aria-label="길이 입력"></td>' +
          '<td><button class="row-del" data-pdel="' + p.id + '" aria-label="삭제">×</button></td></tr>';
      });
    });
    $('price-body').innerHTML = rows || '<tr><td colspan="10" class="hint">해당하는 항목이 없습니다.</td></tr>';
    [].forEach.call($('price-body').querySelectorAll('[data-pk]'), function (el) {
      el.addEventListener('change', function () {
        var p = product(el.dataset.pid), k = el.dataset.pk, val;
        if (k === 'price') { val = parseInt(el.value.replace(/[^0-9]/g, ''), 10) || 0; el.value = won(val); }
        else if (el.type === 'checkbox') val = el.checked;
        else val = el.value.trim();
        var patch = {}; patch[k] = val; patch.updated_at = new Date().toISOString();
        if (k === 'category_id') patch.sort = prodsIn(val).reduce(function (m, x) { return Math.max(m, x.sort); }, 0) + 1;
        upd('products', p.id, patch, function () { Object.keys(patch).forEach(function (x) { p[x] = patch[x]; }); if (k === 'category_id' || k === 'use_in_quote') drawPrices(); });
      });
    });
    [].forEach.call($('price-body').querySelectorAll('[data-mv]'), function (b) {
      b.onclick = function () {
        var p = product(b.dataset.mv), all = prodsIn(p.category_id), i = all.indexOf(p), q = all[i + (+b.dataset.d)];
        if (!q) return;
        var sp = p.sort, sq = q.sort; if (sp === sq) { sp = i; sq = i + (+b.dataset.d); }
        Promise.all([sb.from('products').update({ sort: sq }).eq('id', p.id), sb.from('products').update({ sort: sp }).eq('id', q.id)]).then(function (r) {
          if (r[0].error || r[1].error) return fail('순서를 바꾸지 못했습니다.', r[0].error || r[1].error);
          p.sort = sq; q.sort = sp; drawPrices();
        });
      };
    });
    [].forEach.call($('price-body').querySelectorAll('[data-pdel]'), function (b) {
      b.onclick = function () {
        var p = product(b.dataset.pdel);
        modal('<h3>' + esc(p.name) + '을(를) 삭제할까요?</h3><p>견적서 선택 목록과 홈페이지 제품 목록에서 모두 빠집니다. 잠시 빼 두기만 하려면 "견적서에 사용"을 끄세요.</p><div class="btns"><button class="btn btn-danger" id="do-pdel">삭제</button><button class="btn btn-line" data-close>취소</button></div>');
        $('do-pdel').onclick = function () { sb.from('products').delete().eq('id', p.id).then(function (r) { closeModal(); if (r.error) return fail('삭제하지 못했습니다.', r.error); D.products = D.products.filter(function (x) { return x.id !== p.id; }); drawPrices(); }); };
      };
    });
  }
  $('price-filter').onchange = function () { pf = this.value; drawPrices(); };
  $('price-search').oninput = function () { pq = this.value.trim(); drawPrices(); };
  $('price-add').onclick = function () {
    var cid = pf !== 'all' ? pf : (D.cats[0] && D.cats[0].id);
    if (!cid) { fail('먼저 구분을 하나 추가해 주세요.'); return; }
    var sort = prodsIn(cid).reduce(function (m, x) { return Math.max(m, x.sort); }, 0) + 1;
    sb.from('products').insert({ category_id: cid, name: '새 항목', unit: 'EA', price: 0, sort: sort }).select().single().then(function (r) {
      if (r.error) return fail('항목을 추가하지 못했습니다.', r.error);
      D.products.push(r.data); pq = ''; $('price-search').value = ''; drawPrices();
      var el = $('price-body').querySelector('input[data-pid="' + r.data.id + '"][data-pk="name"]'); if (el) { el.focus(); el.select(); }
      flash('항목을 추가했습니다. 이름과 단가를 적어 주세요.');
    });
  };

  start();
})();
