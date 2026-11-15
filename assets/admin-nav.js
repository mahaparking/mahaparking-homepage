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
  /* 묶음이 접혀 있어도 새 견적 요청 등 알림이 보이도록 묶음 이름 옆에 빨간 점 */
  function dots() {
    groups.forEach(function (g) {
      var on = [].some.call(g.querySelectorAll('.adm-grp-items .badge'), function (b) { return b.textContent.trim() && !b.classList.contains('hidden'); });
      g.querySelector('.adm-grp-h').classList.toggle('has-new', on);
    });
  }
  new MutationObserver(function () { sync(); dots(); }).observe(nav, { subtree: true, attributes: true, childList: true, characterData: true, attributeFilter: ['aria-selected', 'class'] });
  sync(); dots();
})();
