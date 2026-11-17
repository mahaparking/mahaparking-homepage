/* 마하파킹 공통 설정 · 도구 */
var MAHA = {
  SB_URL: 'https://bidlnzkaimceyblyvaut.supabase.co',
  SB_KEY: 'sb_publishable_RyfBwW7u_t4fgEnDRIWT7w_L8v4B4Zy',
  PHONE: '010-8275-1036',
  TEL: '070-4866-1036',   // 대표번호
  EMAIL: 'ace@mahaparking.co.kr'
};
var $ = function (id) { return document.getElementById(id); };
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
var won = function (n) { return (Math.round(n) || 0).toLocaleString('ko-KR'); };
var today = function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
var dot = function (d) { return (d || '').slice(0, 10).replace(/-/g, '.'); };
var rid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); };

var ICONS = {
  bar: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="9" width="18" height="5" rx="2"/><path d="M7 9v5M11 9v5M15 9v5"/></svg>',
  gate: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="6" width="7" height="15" rx="1.5"/><path d="M12 9h9"/></svg>',
  loop: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="14" width="18" height="6" rx="1" stroke-dasharray="3 2"/><path d="M12 4v7M9 8l3 3 3-3"/></svg>',
  light: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 14a4 4 0 0 1 8 0v4H8z"/><path d="M6 18h12M12 4v3M4.5 8l2 1.5M19.5 8l-2 1.5"/></svg>',
  cam: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 10l5-3v10l-5-3"/></svg>',
  remote: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="7" y="3" width="10" height="18" rx="3"/><circle cx="12" cy="9" r="2"/><path d="M10 15h4"/></svg>',
  fee: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 7l3-3 3 3-3 3zM4 20l9-9"/></svg>'
};
function iconFor(name) {
  name = name || '';
  if (name.indexOf('차단바') >= 0) return ICONS.bar;
  if (name.indexOf('차단기') >= 0) return ICONS.gate;
  if (name.indexOf('센서') >= 0 || name.indexOf('검지') >= 0 || name.indexOf('루프') >= 0) return ICONS.loop;
  if (name.indexOf('경광') >= 0) return ICONS.light;
  if (name.indexOf('번호') >= 0 || name.indexOf('LPR') >= 0 || name.indexOf('관제') >= 0) return ICONS.cam;
  if (name.indexOf('리모컨') >= 0 || name.indexOf('출입') >= 0) return ICONS.remote;
  return ICONS.fee;
}

/* 사진을 줄여서 jpg 로 */
function shrinkToBlob(file, max) {
  return new Promise(function (res) {
    var r = new FileReader();
    r.onload = function () {
      var img = new Image();
      img.onload = function () {
        var s = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { res(b ? { blob: b, url: URL.createObjectURL(b) } : null); }, 'image/jpeg', 0.8);
      };
      img.onerror = function () { res(null); };
      img.src = r.result;
    };
    r.onerror = function () { res(null); };
    r.readAsDataURL(file);
  });
}
/* 사진 목록: 대표 지정 · 순서 바꾸기 · 빼기 (list 를 직접 바꾸고 redraw 호출) */
function drawThumbs(boxId, list, redraw, urlOf, onEdit) {
  urlOf = urlOf || function (p) { return typeof p === 'string' ? p : p.url; };
  var n = list.length;
  $(boxId).innerHTML = list.map(function (p, i) {
    return '<figure class="th"><img src="' + urlOf(p) + '" alt="사진 ' + (i + 1) + '">' +
      (i === 0 ? '<span class="main">대표</span>' : '<button type="button" class="th-main" data-a="main" data-i="' + i + '">대표로</button>') +
      '<span class="th-no">' + (i + 1) + '</span>' +
      '<button type="button" class="th-x" data-a="del" data-i="' + i + '" aria-label="사진 빼기">×</button>' +
      '<div class="th-mv"><button type="button" data-a="left" data-i="' + i + '" aria-label="앞으로"' + (i === 0 ? ' disabled' : '') + '>◀</button><button type="button" data-a="right" data-i="' + i + '" aria-label="뒤로"' + (i === n - 1 ? ' disabled' : '') + '>▶</button></div></figure>';
  }).join('');
  [].forEach.call($(boxId).querySelectorAll('button[data-a]'), function (b) {
    b.onclick = function () {
      var i = +b.dataset.i, a = b.dataset.a, t;
      if (a === 'del') list.splice(i, 1);
      else if (a === 'main') { t = list.splice(i, 1)[0]; list.unshift(t); }
      else if (a === 'left' && i > 0) { t = list[i - 1]; list[i - 1] = list[i]; list[i] = t; }
      else if (a === 'right' && i < list.length - 1) { t = list[i + 1]; list[i + 1] = list[i]; list[i] = t; }
      redraw();
    };
  });
  // 사진을 두 번 누르면(더블클릭 · 폰은 두 번 톡톡) 편집 창 열기
  if (onEdit) [].forEach.call($(boxId).querySelectorAll('figure.th img'), function (img, i) {
    var last = 0; img.title = '두 번 누르면 사진 편집 (돌리기 · 모자이크)'; img.style.cursor = 'pointer';
    img.addEventListener('click', function () { var t = Date.now(); if (t - last < 400) { last = 0; onEdit(i); } else last = t; });
  });
}

/* 사진 편집: 왼쪽·오른쪽 돌리기, 모자이크(끌어서 네모 칠하기), 되돌리기
 * src: 사진 주소, done({blob,url}) 저장 시, cancel() 취소 시 */
function photoEditor(src, done, cancel) {
  modal('<h3 style="margin:0 0 6px">사진 편집</h3>' +
    '<div class="pe-tools"><button type="button" class="btn btn-line btn-sm" id="pe-l">↺ 왼쪽으로</button><button type="button" class="btn btn-line btn-sm" id="pe-r">↻ 오른쪽으로</button>' +
    '<button type="button" class="btn btn-line btn-sm" id="pe-m" aria-pressed="false">▦ 모자이크</button><button type="button" class="btn btn-line btn-sm" id="pe-u" disabled>되돌리기</button><button type="button" class="btn btn-line btn-sm" id="pe-0" disabled>처음 사진으로</button></div>' +
    '<p class="hint" id="pe-hint" style="margin:6px 0">돌리기 버튼으로 방향을 맞추세요. 번호판·얼굴은 [모자이크]를 누른 뒤 사진 위를 끌어서 네모로 칠하면 가려집니다.</p>' +
    '<div class="pe-stage"><canvas id="pe-c"></canvas></div>' +
    '<div class="btns" style="margin-top:12px"><button class="btn btn-primary" id="pe-ok">편집 저장</button><button class="btn btn-line" id="pe-x">취소</button></div><p class="hint" id="pe-msg" role="status"></p>', { lock: true });
  $('modal-box').classList.add('wide');
  var cv = $('pe-c'), ctx = cv.getContext('2d'), hist = [], orig = null, mosaic = false, drag = null, base = null;
  var copy = function (c) { var k = document.createElement('canvas'); k.width = c.width; k.height = c.height; k.getContext('2d').drawImage(c, 0, 0); return k; };
  var put = function (k) { cv.width = k.width; cv.height = k.height; ctx.drawImage(k, 0, 0); };
  var push = function () { hist.push(copy(cv)); if (hist.length > 15) hist.shift(); $('pe-u').disabled = false; $('pe-0').disabled = false; };
  var img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = function () { cv.width = img.naturalWidth; cv.height = img.naturalHeight; ctx.drawImage(img, 0, 0); orig = copy(cv); };
  img.onerror = function () { $('pe-msg').textContent = '사진을 불러오지 못했습니다.'; };
  img.src = src;
  function rotate(dir) {
    if (!orig) return; push();
    var k = copy(cv); cv.width = k.height; cv.height = k.width;
    ctx.save(); ctx.translate(cv.width / 2, cv.height / 2); ctx.rotate(dir * Math.PI / 2); ctx.drawImage(k, -k.width / 2, -k.height / 2); ctx.restore();
  }
  $('pe-l').onclick = function () { rotate(-1); };
  $('pe-r').onclick = function () { rotate(1); };
  $('pe-m').onclick = function () { mosaic = !mosaic; this.setAttribute('aria-pressed', mosaic); this.classList.toggle('btn-primary', mosaic); this.classList.toggle('btn-line', !mosaic); cv.style.cursor = mosaic ? 'crosshair' : ''; cv.style.touchAction = mosaic ? 'none' : ''; $('pe-hint').textContent = mosaic ? '가릴 곳을 손가락이나 마우스로 끌어서 네모를 그리세요. 여러 번 그릴 수 있습니다.' : '돌리기 버튼으로 방향을 맞추세요. 번호판·얼굴은 [모자이크]를 누른 뒤 사진 위를 끌어서 네모로 칠하면 가려집니다.'; };
  $('pe-u').onclick = function () { var k = hist.pop(); if (k) put(k); this.disabled = !hist.length; };
  $('pe-0').onclick = function () { if (!orig) return; push(); put(orig); };
  var pos = function (e) { var r = cv.getBoundingClientRect(); return { x: Math.max(0, Math.min(cv.width, (e.clientX - r.left) * cv.width / r.width)), y: Math.max(0, Math.min(cv.height, (e.clientY - r.top) * cv.height / r.height)) }; };
  var rect = function (a, b) { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }; };
  cv.addEventListener('pointerdown', function (e) { if (!mosaic || !orig) return; e.preventDefault(); cv.setPointerCapture(e.pointerId); drag = pos(e); base = copy(cv); });
  cv.addEventListener('pointermove', function (e) {
    if (!drag) return; var q = rect(drag, pos(e));
    ctx.drawImage(base, 0, 0); ctx.save(); ctx.lineWidth = Math.max(3, cv.width / 300); ctx.setLineDash([ctx.lineWidth * 3, ctx.lineWidth * 2]); ctx.strokeStyle = '#F2A900'; ctx.strokeRect(q.x, q.y, q.w, q.h); ctx.restore();
  });
  var finish = function (e) {
    if (!drag) return; var q = rect(drag, pos(e)); drag = null; ctx.drawImage(base, 0, 0);
    if (q.w < 6 || q.h < 6) return;
    hist.push(base); if (hist.length > 15) hist.shift(); $('pe-u').disabled = false; $('pe-0').disabled = false;
    var b = Math.max(8, Math.round(Math.max(cv.width, cv.height) / 60));
    var sw = Math.max(1, Math.round(q.w / b)), sh = Math.max(1, Math.round(q.h / b));
    var t = document.createElement('canvas'); t.width = sw; t.height = sh; t.getContext('2d').drawImage(cv, q.x, q.y, q.w, q.h, 0, 0, sw, sh);
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(t, 0, 0, sw, sh, q.x, q.y, q.w, q.h); ctx.restore();
  };
  cv.addEventListener('pointerup', finish); cv.addEventListener('pointercancel', function () { if (drag) { ctx.drawImage(base, 0, 0); drag = null; } });
  $('pe-x').onclick = function () { closeModal(); cancel && cancel(); };
  $('pe-ok').onclick = function () {
    if (!orig) return; var btn = this; btn.disabled = true;
    try {
      cv.toBlob(function (bl) { if (!bl) { btn.disabled = false; $('pe-msg').textContent = '저장하지 못했습니다.'; return; } closeModal(); done({ blob: bl, url: URL.createObjectURL(bl), edited: true }); }, 'image/jpeg', 0.85);
    } catch (err) { btn.disabled = false; $('pe-msg').textContent = '이 사진은 편집 저장을 할 수 없습니다. (' + err.message + ')'; }
  };
}

/* 사진 크게 보기: 좌우 화살표 · 키보드 · 밀어서 넘기기 */
function gallery(urls, start, title) {
  if (!urls || !urls.length) return;
  var i = Math.max(0, Math.min(start || 0, urls.length - 1)), many = urls.length > 1;
  modal('<div class="gal"><div class="gal-stage"><img id="gal-img" alt="' + esc(title || '현장 사진') + '">' +
    (many ? '<button type="button" class="gal-nav prev" id="gal-prev" aria-label="이전 사진">‹</button><button type="button" class="gal-nav next" id="gal-next" aria-label="다음 사진">›</button>' : '') +
    '</div><div class="gal-bar"><span id="gal-count"></span><button class="btn btn-line btn-sm" data-close>닫기</button></div>' +
    (many ? '<div class="gal-strip" id="gal-strip">' + urls.map(function (u, k) { return '<img src="' + u + '" data-k="' + k + '" alt="' + (k + 1) + '번 사진">'; }).join('') + '</div>' : '') + '</div>');
  $('modal-box').classList.add('wide');
  function show(k) {
    i = (k + urls.length) % urls.length;
    $('gal-img').src = urls[i];
    $('gal-count').textContent = (i + 1) + ' / ' + urls.length;
    if (many) [].forEach.call($('gal-strip').querySelectorAll('img'), function (im) { im.classList.toggle('on', +im.dataset.k === i); if (+im.dataset.k === i && im.scrollIntoView) im.scrollIntoView({ block: 'nearest', inline: 'center' }); });
  }
  if (many) {
    $('gal-prev').onclick = function () { show(i - 1); };
    $('gal-next').onclick = function () { show(i + 1); };
    [].forEach.call($('gal-strip').querySelectorAll('img'), function (im) { im.onclick = function () { show(+im.dataset.k); }; });
    var x0 = null, st = $('modal-box').querySelector('.gal-stage');
    st.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    st.addEventListener('touchend', function (e) { if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) show(i + (dx < 0 ? 1 : -1)); x0 = null; });
  }
  gallery.key = function (e) { if (!$('modal').classList.contains('hidden') && many) { if (e.key === 'ArrowLeft') show(i - 1); if (e.key === 'ArrowRight') show(i + 1); } };
  show(i);
}
document.addEventListener('keydown', function (e) { if (gallery.key) gallery.key(e); });

/* 팝업 */
/* opt.lock: 입력 창처럼 바깥을 누르거나 Esc 를 눌러도 닫히지 않게 ([닫기] 버튼으로만 닫힘) */
function modal(html, opt) { $('modal-box').classList.remove('wide'); $('modal-box').innerHTML = html; $('modal').dataset.lock = opt && opt.lock ? '1' : ''; $('modal').classList.remove('hidden'); var c = $('modal-box').querySelector('[data-close]'); if (c && !(opt && opt.lock)) c.focus(); }
function closeModal() { $('modal').classList.add('hidden'); $('modal').dataset.lock = ''; }
// 바깥(어두운 곳)을 눌렀다 뗐을 때만 닫기 — 입력 칸에서 글자를 끌어 선택하다 바깥에서 손을 떼도 닫히지 않게
var modalDownOnBack = false;
document.addEventListener('mousedown', function (e) { modalDownOnBack = e.target.id === 'modal'; });
document.addEventListener('click', function (e) {
  if (e.target.closest && e.target.closest('[data-close]')) return closeModal();
  if (e.target.id === 'modal' && modalDownOnBack && !$('modal').dataset.lock) closeModal();
});
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('modal') && !$('modal').classList.contains('hidden') && !$('modal').dataset.lock) closeModal(); });
