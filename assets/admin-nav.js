/* 관리자 메뉴: 묶음(홍보·견적서·홈페이지 관리·영업 정보)을 눌러야 상세 메뉴가 펼쳐짐
 * PC: 왼쪽 메뉴 · 휴대폰: 위쪽 "☰ 메뉴" 버튼으로 열고 닫기
 * 실제 화면 전환은 admin.js 가 #admin-tabs 안의 button[data-tab] 으로 처리합니다. */
(function () {
  'use strict';
  var side = document.getElementById('adm-side');
  var nav = document.getElementById('admin-tabs');
  var btn = document.getElementById('adm-menu-btn');
  var cur = document.getElementById('adm-cur');
  if (!side || !nav) return;
  var groups = [].slice.call(nav.querySelectorAll('.adm-grp'));

  function setOpen(g, on) { g.classList.toggle('open', on); g.querySelector('.adm-grp-h').setAttribute('aria-expanded', on); }
  function toggle(g) {
    var on = !g.classList.contains('open');
    groups.forEach(function (x) { setOpen(x, x === g ? on : false); });  // 한 번에 한 묶음만
  }
  groups.forEach(function (g) {
    var h = g.querySelector('.adm-grp-h');
    h.addEventListener('click', function () { toggle(g); });
    h.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(g); } });
  });

  function menuOpen(on) { side.classList.toggle('show', on); btn.setAttribute('aria-expanded', on); }
  btn.addEventListener('click', function () { menuOpen(!side.classList.contains('show')); });

  /* 지금 보고 있는 메뉴: 이름 표시 + 그 묶음 펼치기 */
  var last = null;
  function sync() {
    var sel = nav.querySelector('button[data-tab][aria-selected="true"]');
    if (!sel || sel === last) return;   // 메뉴가 바뀔 때만 (묶음을 직접 여닫는 것은 그대로 둠)
    last = sel;
    cur.textContent = sel.childNodes[0].textContent.trim();
    var g = sel.closest('.adm-grp');
    if (g && !g.classList.contains('open')) groups.forEach(function (x) { setOpen(x, x === g); });
  }
  [].forEach.call(nav.querySelectorAll('button[data-tab]'), function (b) {
    b.addEventListener('click', function () { menuOpen(false); setTimeout(function () { sync(); window.scrollTo(0, 0); }, 0); });
  });
  /* 묶음 이름 옆에 새 알림 개수 (안의 메뉴 배지 합계 · 숫자가 아닌 'N' 은 1개로) */
  groups.forEach(function (g) {
    var h = g.querySelector('.adm-grp-h'), i = h.querySelector('i');
    var em = document.createElement('em'); em.className = 'grp-badge hidden'; h.insertBefore(em, i);
  });
  function dots() {
    groups.forEach(function (g) {
      var n = 0;
      [].forEach.call(g.querySelectorAll('.adm-grp-items .badge'), function (b) {
        var t = b.textContent.trim();
        if (!t || b.classList.contains('hidden')) return;
        n += /^\d+$/.test(t) ? +t : 1;
      });
      var em = g.querySelector('.grp-badge'), t = n > 99 ? '99+' : String(n);
      if (em.textContent === t) return;   // 바뀔 때만 고쳐야 감시가 다시 돌지 않음
      em.textContent = t; em.classList.toggle('hidden', !n);
      em.setAttribute('aria-label', '새 알림 ' + n + '개');
    });
  }
  var mo = new MutationObserver(function () { sync(); dots(); });
  [].forEach.call(nav.querySelectorAll('.adm-grp-items'), function (box) { mo.observe(box, { subtree: true, attributes: true, childList: true, characterData: true, attributeFilter: ['aria-selected', 'class'] }); });
  sync(); dots();
})();
