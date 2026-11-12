/* 마하파킹 공개 홈페이지 */
(function () {
  'use strict';
  var sb = supabase.createClient(MAHA.SB_URL, MAHA.SB_KEY, { auth: { persistSession: false } });

  var SERVICES = [
    ['bar', '차단바 교체', '부러지거나 휜 차단바를 맞춤 길이로 공급·교체합니다. 홀더를 바꾸지 않아도 되는 제품을 먼저 찾아 드립니다.'],
    ['gate', '차단기 수리 · 신규 설치', '바가 안 올라가거나 안 내려올 때 컨트롤러·모터를 점검해 수리합니다. 노후·부식된 차단기는 교체 설치합니다.'],
    ['loop', '루프센서 · 차량검지기', '차량이 없는데 열리거나 차를 치는 증상은 대부분 루프 불량입니다. 절연을 측정하고 재시공합니다.'],
    ['light', '경광등 수리', '지하주차장 경광등이 안 켜지거나 계속 켜져 있을 때, 습기·누수 원인까지 찾아 재발을 막습니다.'],
    ['cam', '번호인식(LPR) 업싸이클링', '기존 차단기는 살리고 번호인식만 추가하거나, 구형 LPR을 신형으로 바꿉니다.'],
    ['remote', '리모컨 · 출입 · 네트워크', '리모컨 수신 불량, RF 카드·리더기, 관제 PC 복구와 경비실 네트워크 신설까지 맡습니다.']
  ];
  var SYMPTOMS = ['업싸이클링 상담', '차단바 파손', '바가 안 올라감', '안 내려감 · 차량 타격', '저절로 열림', '경광등 이상', '번호인식 불량', '리모컨 · 카드 불량'];
  var FAIL = '접수 중 문제가 생겼습니다. 잠시 후 다시 시도하시거나 ' + MAHA.PHONE + '으로 전화 주세요.';

  /* ---------- 화면 전환 ---------- */
  var VIEWS = ['home', 'products', 'cases'];
  function show(view, anchor) {
    if (VIEWS.indexOf(view) < 0) view = 'home';
    VIEWS.forEach(function (v) { $('view-' + v).classList.toggle('hidden', v !== view); });
    [].forEach.call(document.querySelectorAll('#menu button'), function (b) {
      if (b.dataset.go === view && !b.dataset.anchor) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (view === 'home') loadCases(function () { renderHomeCases(); });
    if (view === 'products') loadProducts(renderProducts);
    if (view === 'cases') loadCases(renderCases);
    if (anchor) setTimeout(function () { var el = $(anchor); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 30);
    else window.scrollTo(0, 0);
  }
  function route() { show((location.hash || '#home').slice(1)); }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-go]'); if (!b) return;
    e.preventDefault();
    var v = b.dataset.go, a = b.dataset.anchor;
    if (b.dataset.pick) setTimeout(function () {
      [].forEach.call(document.querySelectorAll('#c-symptom input'), function (i) { if (i.value === b.dataset.pick) i.checked = true; });
      var memo = $('c-memo'); if (memo && !memo.value) memo.placeholder = '현장 장비 상황(제조사, 설치 연도, 불편한 점 등)을 적어 주시면 점검 일정을 잡아 드립니다.';
    }, 60);
    if (('#' + v) !== location.hash) {
      if (a) { history.replaceState(null, '', '#' + v); show(v, a); } else location.hash = v;
    } else show(v, a);
  });
  window.addEventListener('hashchange', route);

  /* ---------- 홈 ---------- */
  $('svc-grid').innerHTML = SERVICES.map(function (s) { return '<article class="card svc"><div class="ico">' + ICONS[s[0]] + '</div><h3>' + s[1] + '</h3><p>' + s[2] + '</p></article>'; }).join('');
  $('c-symptom').innerHTML = SYMPTOMS.map(function (s, i) { return '<label for="sy' + i + '"><input type="checkbox" id="sy' + i + '" value="' + s + '">' + s + '</label>'; }).join('');

  /* ---------- 시공사례 ---------- */
  var CASES = null, cFilter = 'all';
  function photoUrl(path) { return sb.storage.from('case-photos').getPublicUrl(path).data.publicUrl; }
  function loadCases(cb) {
    if (CASES) return cb();
    sb.from('cases').select('id,title,area,work_type,work_date,description,result,photos').eq('published', true)
      .order('work_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
      .then(function (r) { CASES = r.error ? [] : r.data; cb(); });
  }
  function caseCard(c, thumbs) {
    var ph = c.photos && c.photos.length
      ? '<img src="' + photoUrl(c.photos[0]) + '" alt="' + esc(c.title) + ' 현장 사진" loading="lazy">' + (c.photos.length > 1 ? '<span class="count">사진 ' + c.photos.length + '장</span>' : '')
      : '현장 사진 준비 중';
    var th = thumbs && c.photos && c.photos.length > 1 ? '<div class="case-thumbs">' + c.photos.map(function (p, i) { return '<img src="' + photoUrl(p) + '" alt="사진 ' + (i + 1) + '" data-view="' + c.id + '" data-i="' + i + '" loading="lazy">'; }).join('') + '</div>' : '';
    return '<article class="card case"><div class="case-photo"' + (c.photos && c.photos.length ? ' data-view="' + c.id + '" data-i="0" style="cursor:zoom-in"' : '') + '>' + ph + '</div><div class="case-body"><div class="meta">' + (c.work_type ? '<span>' + esc(c.work_type) + '</span>' : '') + (c.area ? '<span>' + esc(c.area) + '</span>' : '') + (c.work_date ? '<span class="date">' + dot(c.work_date) + '</span>' : '') + '</div><h3>' + esc(c.title) + '</h3><p>' + esc(c.description) + '</p>' + (c.result ? '<div class="result">' + esc(c.result) + '</div>' : '') + '</div>' + th + '</article>';
  }
  function renderHomeCases() {
    $('home-cases').innerHTML = CASES.length ? CASES.slice(0, 3).map(function (c) { return caseCard(c, false); }).join('') : '<p class="hint">시공사례를 준비하고 있습니다. 네이버 블로그에서 먼저 보실 수 있습니다.</p>';
  }
  function renderCases() {
    var types = []; CASES.forEach(function (c) { if (c.work_type && types.indexOf(c.work_type) < 0) types.push(c.work_type); });
    $('case-filter').innerHTML = '<button aria-pressed="' + (cFilter === 'all') + '" data-f="all">전체 (' + CASES.length + ')</button>' + types.map(function (t) { return '<button aria-pressed="' + (cFilter === t) + '" data-f="' + esc(t) + '">' + esc(t) + '</button>'; }).join('');
    [].forEach.call($('case-filter').querySelectorAll('button'), function (b) { b.onclick = function () { cFilter = b.dataset.f; renderCases(); }; });
    var list = CASES.filter(function (c) { return cFilter === 'all' || c.work_type === cFilter; });
    $('all-cases').innerHTML = list.length ? list.map(function (c) { return caseCard(c, true); }).join('') : '<p class="hint">등록된 시공사례가 없습니다.</p>';
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-view]'); if (!t || !CASES) return;
    var c = CASES.filter(function (x) { return x.id === t.dataset.view; })[0]; if (!c || !c.photos || !c.photos.length) return;
    gallery(c.photos.map(photoUrl), +t.dataset.i, c.title);
  });

  /* 업싸이클링 사진 크게 보기 */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-up]'); if (!b) return;
    var urls = []; for (var k = 1; k <= 12; k++) urls.push('/assets/upcycle/' + String(k).padStart(2, '0') + '.jpg');
    gallery(urls, (+b.dataset.up) - 1, '마하파킹 업싸이클링 시공 현장');
  });

  /* ---------- 상담 신청 ---------- */
  var cPhotos = [];
  $('c-photo').addEventListener('change', function () {
    var fs = [].slice.call(this.files).slice(0, 6 - cPhotos.length); this.value = '';
    Promise.all(fs.map(function (f) { return shrinkToBlob(f, 1600); })).then(function (r) { cPhotos = cPhotos.concat(r.filter(Boolean)); drawC(); });
  });
  function drawC() { drawThumbs('c-thumbs', cPhotos, drawC); }
  $('consult-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = this, done = $('c-done'), btn = form.querySelector('button[type=submit]');
    var v = function (id) { return $(id).value.trim(); };
    if (!v('c-phone') && !v('c-email')) { done.className = 'notice'; done.textContent = '연락처나 이메일 중 하나는 적어 주세요. 답변을 드릴 곳이 필요합니다.'; return; }
    var sy = [].map.call(document.querySelectorAll('#c-symptom input:checked'), function (i) { return i.value; });
    btn.disabled = true; btn.textContent = '접수하고 있습니다...';
    var month = today().slice(0, 7);
    Promise.all(cPhotos.map(function (p, i) {
      var path = month + '/' + rid() + '-' + i + '.jpg';
      return sb.storage.from('request-photos').upload(path, p.blob, { contentType: 'image/jpeg' }).then(function (r) { return r.error ? null : path; });
    })).then(function (paths) {
      return sb.from('requests').insert({
        kind: '상담 신청', name: v('c-name'), phone: v('c-phone'), email: v('c-email'), area: v('c-area'),
        memo: (sy.length ? '[' + sy.join(', ') + '] ' : '') + v('c-memo'), photos: paths.filter(Boolean)
      });
    }).then(function (r) {
      btn.disabled = false; btn.textContent = '상담 신청하기';
      if (r.error) { done.className = 'notice'; done.textContent = FAIL; return; }
      form.reset(); cPhotos = []; drawC();
      done.className = 'notice ok';
      done.innerHTML = '<strong>상담 신청이 접수되었습니다.</strong><span>확인 후 연락드리겠습니다. 급하시면 ' + MAHA.PHONE + '으로 전화 주세요.</span>';
    }).catch(function () { btn.disabled = false; btn.textContent = '상담 신청하기'; done.className = 'notice'; done.textContent = FAIL; });
  });

  /* ---------- 제품 견적 요청 ---------- */
  var CATS = null, PRODS = null, PERR = false, cart = [], pFilter = 'all';
  function loadProducts(cb) {
    if (PRODS) return cb();
    $('prod-grid').innerHTML = '<p class="hint">제품 목록을 불러오고 있습니다...</p>';
    Promise.all([
      sb.from('categories').select('id,name,sort').order('sort'),
      sb.from('products').select('id,category_id,name,description,unit,ask_length,sort').eq('show_on_site', true).order('sort')
    ]).then(function (r) {
      CATS = r[0].error ? [] : r[0].data; PRODS = r[1].error ? null : r[1].data;
      PERR = !!(r[0].error || r[1].error); if (PERR) PRODS = null;
      cb();
    });
  }
  function catOf(id) { return CATS.filter(function (c) { return c.id === id; })[0] || { name: '' }; }
  function prod(id) { return PRODS.filter(function (p) { return p.id === id; })[0]; }
  function renderProducts() {
    if (PERR || !PRODS) { $('prod-grid').innerHTML = '<p class="hint">제품 목록을 불러오지 못했습니다. ' + MAHA.PHONE + '으로 문의해 주세요.</p>'; drawCart(); return; }
    var cats = CATS.filter(function (c) { return PRODS.some(function (p) { return p.category_id === c.id; }); });
    $('prod-filter').innerHTML = '<button aria-pressed="' + (pFilter === 'all') + '" data-f="all">전체</button>' + cats.map(function (c) { return '<button aria-pressed="' + (pFilter === c.id) + '" data-f="' + c.id + '">' + esc(c.name) + '</button>'; }).join('');
    [].forEach.call($('prod-filter').querySelectorAll('button'), function (b) { b.onclick = function () { pFilter = b.dataset.f; renderProducts(); }; });
    var list = [];
    cats.forEach(function (c) { PRODS.forEach(function (p) { if (p.category_id === c.id && (pFilter === 'all' || pFilter === c.id)) list.push(p); }); });
    $('prod-grid').innerHTML = list.length ? list.map(function (p) {
      var cn = catOf(p.category_id).name;
      return '<article class="card prod"><div class="prod-top"><div class="ico">' + iconFor(cn + p.name) + '</div><div><div class="cat">' + esc(cn) + '</div><h3>' + esc(p.name) + '</h3></div></div><p>' + esc(p.description) + '</p><div class="price-hide">가격: 상담 후 견적서로 안내</div>' +
        '<div class="prod-ask"><label for="qty-' + p.id + '">수량 (' + esc(p.unit) + ')<input id="qty-' + p.id + '" type="number" min="1" value="1"></label>' +
        (p.ask_length ? '<label for="len-' + p.id + '">길이 (m)<input id="len-' + p.id + '" inputmode="decimal" placeholder="예) 3.5"></label>' : '<span></span>') +
        '</div><button class="btn btn-primary btn-sm" type="button" data-cart="' + p.id + '">견적 요청함에 담기</button></article>';
    }).join('') : '<p class="hint">준비된 제품이 없습니다. 상담 신청을 이용해 주세요.</p>';
    [].forEach.call($('prod-grid').querySelectorAll('[data-cart]'), function (b) {
      b.onclick = function () {
        var id = b.dataset.cart, q = Math.max(1, parseInt($('qty-' + id).value, 10) || 1), l = $('len-' + id) ? $('len-' + id).value.trim() : '';
        cart.push({ product_id: id, qty: q, length: l }); $('req-done').classList.add('hidden'); drawCart();
        b.textContent = '담았습니다 ✓'; setTimeout(function () { b.textContent = '견적 요청함에 담기'; }, 1200);
      };
    });
    drawCart();
  }
  function drawCart() {
    $('cart-count').textContent = cart.length ? '(' + cart.length + ')' : '';
    $('cart-list').innerHTML = cart.length ? cart.map(function (c, i) { var p = prod(c.product_id); return '<li><span><b>' + esc(p ? p.name : '') + '</b><br>' + c.qty + (p ? esc(p.unit) : '') + (c.length ? ' · 길이 ' + esc(c.length) + 'm' : '') + '</span><button type="button" data-rm="' + i + '">빼기</button></li>'; }).join('') : '<li class="empty">왼쪽에서 필요한 제품을 담아 주세요. 여러 개를 담아 한 번에 요청할 수 있습니다.</li>';
    [].forEach.call($('cart-list').querySelectorAll('[data-rm]'), function (b) { b.onclick = function () { cart.splice(+b.dataset.rm, 1); drawCart(); }; });
    $('req-form').classList.toggle('hidden', !cart.length);
  }
  $('req-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = this, btn = form.querySelector('button[type=submit]');
    var v = function (id) { return $(id).value.trim(); };
    if (!v('r-email') && !v('r-phone')) { $('r-err').textContent = '견적서를 보내 드릴 이메일이나 연락처를 적어 주세요.'; return; }
    $('r-err').textContent = ''; btn.disabled = true; btn.textContent = '보내고 있습니다...';
    var items = cart.map(function (c) { var p = prod(c.product_id); return { product_id: c.product_id, name: p ? p.name : '', unit: p ? p.unit : '', qty: c.qty, length: c.length }; });
    sb.from('requests').insert({ kind: '제품 견적', name: v('r-name'), phone: v('r-phone'), email: v('r-email'), area: v('r-area'), memo: v('r-memo'), items: items })
      .then(function (r) {
        btn.disabled = false; btn.textContent = '견적 요청 보내기';
        if (r.error) { $('r-err').textContent = FAIL; return; }
        cart = []; form.reset(); drawCart();
        var d = $('req-done'); d.classList.remove('hidden');
        d.innerHTML = '<strong>견적 요청이 접수되었습니다.</strong><span>현장 확인 후 견적서를 이메일로 보내 드립니다. 결제는 견적을 확인하신 뒤 진행됩니다.</span>';
      });
  });

  route();
})();
