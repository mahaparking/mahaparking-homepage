/* 여러 개를 고를 수 있는 콤보박스 (시·도 · 시·군·구 등)
 *  html = mselHtml({ id, all: '전국', options: [[값, 이름], …], selected: [값…], disabled })
 *  화면에 넣은 뒤 mselBind(root, id, (고른 값들) => { … })
 *  목록을 펼쳐 체크하고, 바깥을 누르거나 [적용]을 누르면 반영됩니다. 아무것도 안 고르면 '전체'.
 */
export function mselHtml({ id, all, options, selected, disabled, placeholder }) {
  const sel = new Set(selected || []);
  const names = options.filter(([v]) => sel.has(v)).map(([, n]) => n);
  const label = !options.length ? (placeholder || all) : !names.length ? all : names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} 외 ${names.length - 2}`;
  return `<details class="msel" id="${id}"${disabled || !options.length ? ' data-off="1"' : ''}>
    <summary${names.length ? ' class="on"' : ''}><span>${esc(label)}</span><i aria-hidden="true">▾</i></summary>
    <div class="msel-p">
      <div class="msel-top"><button type="button" data-ms-all>모두 고르기</button><button type="button" data-ms-none>${esc(all)} (모두 해제)</button></div>
      <div class="msel-list">${options.map(([v, n]) => `<label><input type="checkbox" value="${esc(v)}"${sel.has(v) ? ' checked' : ''}> ${esc(n)}</label>`).join('')}</div>
      <div class="msel-foot"><span class="hint" data-ms-cnt></span><button type="button" class="btn btn-primary btn-sm" data-ms-ok>적용</button></div>
    </div>
  </details>`;
}
export function mselBind(root, id, onChange) {
  const el = root.querySelector('#' + id); if (!el) return;
  if (el.dataset.off) { el.addEventListener('toggle', () => { el.open = false; }); return; }
  const boxes = () => [...el.querySelectorAll('.msel-list input')];
  const now = () => boxes().filter((b) => b.checked).map((b) => b.value);
  const start = now().join('\n');
  const cnt = () => { const n = now().length; el.querySelector('[data-ms-cnt]').textContent = n ? `${n}개 고름` : '모두 (전체)'; };
  cnt();
  el.addEventListener('change', cnt);
  el.querySelector('[data-ms-all]').onclick = () => { boxes().forEach((b) => { b.checked = true; }); cnt(); };
  el.querySelector('[data-ms-none]').onclick = () => { boxes().forEach((b) => { b.checked = false; }); cnt(); };
  el.querySelector('[data-ms-ok]').onclick = () => { el.open = false; };
  el.addEventListener('toggle', () => {
    if (el.open) { document.querySelectorAll('details.msel[open]').forEach((d) => { if (d !== el) d.open = false; }); return; }
    const v = now(); if (v.join('\n') !== start) onChange(v);
  });
}
// 바깥을 누르면 닫기 (닫히면서 고른 값이 반영됨)
document.addEventListener('mousedown', (e) => {
  document.querySelectorAll('details.msel[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; });
});

/* 지역 고르기 목록: 17개 시·도를 늘 모두 보이고(받은 곳 수 표시), 시·군·구는 고른 시·도 안에서 */
export const SIDO17 = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
export function regionOpts(rows, picked, KO) {
  const sc = {}, gc = {};
  rows.forEach((x) => { sc[x.sido] = (sc[x.sido] || 0) + 1; if (x.sgg && picked.includes(x.sido)) { const k = x.sido + '|' + x.sgg; gc[k] = (gc[k] || 0) + 1; } });
  const extra = []; // 주소가 잘못 적힌 몇 곳은 '전국'으로만 보임
  const sidos = [...SIDO17, ...extra].map((d) => [d, `${d} (${(sc[d] || 0).toLocaleString()})`]);
  const sggs = Object.keys(gc).sort((a, b) => KO.compare(a, b)).map((k) => { const [d, g] = k.split('|'); return [k, `${picked.length > 1 ? `${d} ${g}` : g} (${gc[k].toLocaleString()})`]; });
  return { sidos, sggs };
}
