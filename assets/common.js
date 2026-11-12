/* 마하파킹 공통 설정 · 도구 */
var MAHA = {
  SB_URL: 'https://bidlnzkaimceyblyvaut.supabase.co',
  SB_KEY: 'sb_publishable_RyfBwW7u_t4fgEnDRIWT7w_L8v4B4Zy',
  PHONE: '010-8275-1036',
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
function drawThumbs(boxId, list, redraw, urlOf) {
  urlOf = urlOf || function (p) { return p.url; };
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
function modal(html) { $('modal-box').classList.remove('wide'); $('modal-box').innerHTML = html; $('modal').classList.remove('hidden'); var c = $('modal-box').querySelector('[data-close]'); if (c) c.focus(); }
function closeModal() { $('modal').classList.add('hidden'); }
document.addEventListener('click', function (e) { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
