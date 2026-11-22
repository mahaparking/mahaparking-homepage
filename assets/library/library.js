/* 📚 자료실 — 관리자 사용 설명서 같은 문서와 파일(PDF·엑셀·사진 등)을 모아 두는 곳
 *  문서: 서버 표 library_docs 에 글(마크다운)로 저장 → 화면에서 바로 읽기 · 고치기
 *  파일: 서버 저장소 library(비공개)에 올리고, 누르면 잠깐 열리는 주소로 열기 · 내려받기
 *  관리자(is_admin)만 보고 고칠 수 있습니다.
 */
const sb = supabase.createClient(MAHA.SB_URL, MAHA.SB_KEY);
const root = document.getElementById('library-root');
const L = { list: [], loaded: false, open: null, editing: false, msg: '', q: '', cat: '' };
const KO = new Intl.Collator('ko');
const CATS = ['사용 설명서', '장비 자료', '견적·계약 서식', '기타'];

/* ---------- 마크다운 → 화면 (제목 · 목록 · 표 · 굵게 · 링크 · 인용 · 구분선) ---------- */
function inline(s) {
  // \* \[ \_ 처럼 역슬래시로 막아 둔 글자는 서식으로 보지 않고 그대로 보이게
  const keep = [];
  s = String(s).replace(/\\([\\`*_\[\]{}()#+\-.!~|>])/g, (m, c) => { keep.push(c); return `\u0000${keep.length - 1}\u0001`; });
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|#[^)\s]*)\)/g, (m, t, u) => `<a href="${u}"${u[0] === '#' ? '' : ' target="_blank" rel="noopener"'}>${t}</a>`)
    .replace(/\u0000(\d+)\u0001/g, (m, i) => esc(keep[+i]));
}
function md(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  let out = '', i = 0;
  const listBlock = (start) => {   // 들여쓰기로 겹친 목록
    const items = []; let j = start;
    while (j < lines.length) {
      const m = lines[j].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
      if (!m) { if (/^\s{2,}\S/.test(lines[j]) && items.length) { items[items.length - 1].text += ' ' + lines[j].trim(); j++; continue; } break; }
      items.push({ ind: m[1].replace(/\t/g, '    ').length, ord: /\d/.test(m[2]), text: m[3] }); j++;
    }
    const build = (arr, k, ind) => {
      let html = `<${arr[k].ord ? 'ol' : 'ul'}>`, n = k;
      while (n < arr.length && arr[n].ind >= ind) {
        if (arr[n].ind > ind) { const r = build(arr, n, arr[n].ind); html = html.replace(/<\/li>$/, '') + r.html + '</li>'; n = r.next; continue; }
        const chk = arr[n].text.match(/^\[( |x)\]\s+(.*)$/i);
        html += `<li>${chk ? `<span class="lb-chk">${chk[1].trim() ? '☑' : '☐'}</span> ${inline(chk[2])}` : inline(arr[n].text)}</li>`; n++;
      }
      return { html: html + `</${arr[k].ord ? 'ol' : 'ul'}>`, next: n };
    };
    let html = '', k = 0;
    while (k < items.length) { const r = build(items, k, items[k].ind); html += r.html; k = r.next; }
    return { html, next: j };
  };
  while (i < lines.length) {
    const t = lines[i];
    if (!t.trim()) { i++; continue; }
    let m;
    if ((m = t.match(/^(#{1,4})\s+(.*)$/))) { const lv = m[1].length; const id = m[2].replace(/[^\w가-힣\s-]/g, '').trim().replace(/\s+/g, '-'); out += `<h${lv + 1} id="${esc(id)}">${inline(m[2])}</h${lv + 1}>`; i++; continue; }
    if (/^(-{3,}|\*{3,})\s*$/.test(t)) { out += '<hr>'; i++; continue; }
    if (/^>\s?/.test(t)) { let q = []; while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, '')); out += `<blockquote>${md(q.join('\n'))}</blockquote>`; continue; }
    if (/^\s*\|/.test(t) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const cells = (s) => s.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(t); i += 2; let body = '';
      while (i < lines.length && /^\s*\|/.test(lines[i])) { body += `<tr>${cells(lines[i]).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`; i++; }
      out += `<div class="tbl-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`; continue;
    }
    if (/^```/.test(t)) { let c = []; i++; while (i < lines.length && !/^```/.test(lines[i])) c.push(lines[i++]); i++; out += `<pre>${esc(c.join('\n'))}</pre>`; continue; }
    if (/^\s*([-*]|\d+\.)\s+/.test(t)) { const r = listBlock(i); out += r.html; i = r.next; continue; }
    let p = [t.trim()]; i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>|\s*\||\s*([-*]|\d+\.)\s|-{3,}|```)/.test(lines[i])) p.push(lines[i++].trim());
    out += `<p>${inline(p.join(' '))}</p>`;
  }
  return out;
}

/* ---------- 서버 ---------- */
async function load() {
  root.innerHTML = '<p class="hint">불러오는 중…</p>';
  const { data, error } = await sb.from('library_docs').select('id,title,category,file_path,file_name,file_size,sort,updated_at').order('sort').order('updated_at', { ascending: false });
  if (error) {
    root.innerHTML = /library_docs|schema cache|does not exist/i.test(error.message)
      ? '<div class="notice"><b>처음 한 번만 설정이 필요합니다.</b><span>Supabase → SQL Editor 에서 <code>supabase/library.sql</code> 내용을 붙여 넣고 Run 을 누른 뒤, 이 화면을 새로고침해 주세요.</span></div>'
      : `<p class="hint">불러오지 못했습니다: ${esc(error.message)}</p>`;
    return;
  }
  L.list = data; L.loaded = true; draw();
}
const fmtSize = (n) => (!n ? '' : n > 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB');
const ymd = (s) => String(s || '').slice(0, 10);

async function openDoc(id) {
  const { data, error } = await sb.from('library_docs').select('*').eq('id', id).single();
  if (error) { L.msg = error.message; draw(); return; }
  L.open = data; L.editing = false; draw();
  root.scrollIntoView({ block: 'start' });
}
async function openFile(x) {
  const { data, error } = await sb.storage.from('library').createSignedUrl(x.file_path, 600, /\.(pdf|png|jpe?g|gif|webp|txt)$/i.test(x.file_name || '') ? undefined : { download: x.file_name || true });
  if (error) { L.msg = '파일을 열지 못했습니다: ' + error.message; draw(); return; }
  window.open(data.signedUrl, '_blank', 'noopener');
}

/* ---------- 쓰기 · 고치기 ---------- */
function editor(doc) {
  const d = doc || { title: '', category: '사용 설명서', body_md: '' };
  modal(`<h3>${doc ? '문서 고치기' : '＋ 새 문서'}</h3>
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px">
      <label>제목<input id="lb-t" value="${esc(d.title)}"></label>
      <label>분류<select id="lb-c">${CATS.map((c) => `<option${c === d.category ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
    </div>
    <label style="display:block;margin-top:8px">내용 <span class="hint">(# 제목 · - 목록 · 1. 번호 · **굵게** · | 표 | 를 쓸 수 있습니다)</span><textarea id="lb-b" rows="18" style="font-family:ui-monospace,Consolas,monospace;font-size:13px">${esc(d.body_md || '')}</textarea></label>
    <div class="btns" style="margin-top:10px"><button class="btn btn-primary" type="button" id="lb-save">저장</button><button class="btn btn-line" type="button" data-close>닫기</button></div>`, { lock: true });
  document.getElementById('modal-box').classList.add('wide');
  document.getElementById('lb-save').onclick = async () => {
    const row = { title: document.getElementById('lb-t').value.trim(), category: document.getElementById('lb-c').value, body_md: document.getElementById('lb-b').value, updated_at: new Date().toISOString() };
    if (!row.title) { alert('제목을 넣어 주세요.'); return; }
    const r = doc ? await sb.from('library_docs').update(row).eq('id', doc.id).select().single() : await sb.from('library_docs').insert(row).select().single();
    if (r.error) { alert('저장하지 못했습니다: ' + r.error.message); return; }
    closeModal(); L.msg = '저장했습니다.'; await load(); openDoc(r.data.id);
  };
}
async function upload(files) {
  const cat = L.cat || '기타';
  for (const f of files) {
    if (f.size > 50 * 1048576) { L.msg = `${f.name}: 50MB 이하만 올릴 수 있습니다.`; continue; }
    L.msg = `${f.name} 올리는 중…`; draw();
    const ext = (f.name.match(/\.[A-Za-z0-9]{1,6}$/) || [''])[0].toLowerCase();
    const path = `${new Date().toISOString().slice(0, 10)}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${ext}`;
    const up = await sb.storage.from('library').upload(path, f, { contentType: f.type || 'application/octet-stream' });
    if (up.error) { L.msg = `${f.name}: 올리지 못했습니다 (${up.error.message})`; continue; }
    const r = await sb.from('library_docs').insert({ title: f.name.replace(/\.[^.]+$/, ''), category: cat, file_path: path, file_name: f.name, file_size: f.size, updated_at: new Date().toISOString() });
    if (r.error) { L.msg = `${f.name}: 목록에 넣지 못했습니다 (${r.error.message})`; continue; }
    L.msg = `${f.name}을(를) 올렸습니다.`;
  }
  await load();
}
async function remove(x) {
  if (!confirm(`"${x.title}"을(를) 자료실에서 지울까요? 되돌릴 수 없습니다.`)) return;
  if (x.file_path) await sb.storage.from('library').remove([x.file_path]);
  const r = await sb.from('library_docs').delete().eq('id', x.id);
  if (r.error) { alert('지우지 못했습니다: ' + r.error.message); return; }
  L.open = null; L.msg = '지웠습니다.'; await load();
}

/* ---------- 화면 ---------- */
function draw() {
  if (L.open) {
    const d = L.open;
    root.innerHTML = `
      <div class="btns" style="margin:0 0 10px"><button class="btn btn-line btn-sm" type="button" id="lb-back">← 자료실 목록</button>
        <button class="btn btn-line btn-sm" type="button" id="lb-edit">✏ 고치기</button>
        <button class="btn btn-line btn-sm" type="button" id="lb-print">🖨 인쇄 · PDF</button>
        <button class="btn btn-line btn-sm" type="button" id="lb-del" style="margin-left:auto;color:var(--stop)">삭제</button></div>
      <p class="hint" style="margin:0 0 6px">${esc(d.category || '')} · 고친 날 ${esc(ymd(d.updated_at))}</p>
      <article class="lb-doc" id="lb-doc"><h1>${esc(d.title)}</h1>${md(d.body_md)}</article>`;
    root.querySelector('#lb-back').onclick = () => { L.open = null; draw(); };
    root.querySelector('#lb-edit').onclick = () => editor(d);
    root.querySelector('#lb-del').onclick = () => remove(d);
    root.querySelector('#lb-print').onclick = () => {
      const w = window.open('', '_blank'); if (!w) { alert('팝업을 허용해 주세요.'); return; }
      w.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>body{font-family:'Noto Sans KR',sans-serif;max-width:820px;margin:24px auto;padding:0 16px;line-height:1.7;color:#111}table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border:1px solid #bbb;padding:6px 8px;font-size:14px;text-align:left;vertical-align:top}th{background:#f0f3f7}blockquote{border-left:4px solid #0662AB;margin:10px 0;padding:6px 14px;background:#f3f7fb}h2{border-bottom:2px solid #0662AB;padding-bottom:4px;margin-top:28px}code{background:#eef1f4;padding:0 4px;border-radius:4px}</style></head><body>${root.querySelector('#lb-doc').innerHTML}</body></html>`);
      w.document.close(); setTimeout(() => w.print(), 400);
    };
    root.querySelectorAll('#lb-doc a[href^="#"]').forEach((a) => { a.onclick = (e) => { e.preventDefault(); const t = root.querySelector(`#lb-doc [id="${CSS.escape(decodeURIComponent(a.getAttribute('href').slice(1)))}"]`); if (t) t.scrollIntoView({ behavior: 'smooth' }); }; });
    return;
  }
  const qq = L.q.replace(/\s/g, '');
  const list = L.list.filter((x) => (!L.cat || x.category === L.cat) && (!qq || (x.title + (x.file_name || '')).replace(/\s/g, '').includes(qq)));
  const cats = [...new Set([...CATS, ...L.list.map((x) => x.category).filter(Boolean)])];
  root.innerHTML = `
    <p class="hint" style="margin-top:0">사용 설명서 · 장비 매뉴얼 · 서식 같은 자료를 모아 두는 곳입니다. 서버에 저장되어 PC · 휴대폰 어디서든 같이 보입니다.</p>
    <div class="kp-filter">
      <select id="lb-cat"><option value="">전체 분류</option>${cats.map((c) => `<option${L.cat === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <input id="lb-q" type="search" placeholder="자료 이름 찾기" value="${esc(L.q)}" style="flex:1;min-width:160px;width:auto">
      <button class="btn btn-primary btn-sm" type="button" id="lb-new">＋ 새 문서</button>
      <label class="btn btn-line btn-sm" style="cursor:pointer">📎 파일 올리기<input type="file" id="lb-file" multiple style="display:none"></label>
    </div>
    <p id="lb-msg" role="status" style="margin:6px 0;font-weight:700;${L.msg ? '' : 'display:none'}">${esc(L.msg)}</p>
    <div class="lb-list">${list.length ? list.map((x) => `
      <button type="button" class="lb-item" data-lb="${esc(x.id)}">
        <span class="lb-ic" aria-hidden="true">${x.file_path ? (/\.pdf$/i.test(x.file_name) ? '📕' : /\.(xlsx?|csv)$/i.test(x.file_name) ? '📗' : /\.(png|jpe?g|gif|webp)$/i.test(x.file_name) ? '🖼' : '📎') : '📘'}</span>
        <span class="lb-t"><b>${esc(x.title)}</b><span class="hint">${esc(x.category || '')}${x.file_path ? ` · ${esc(x.file_name || '')} ${fmtSize(x.file_size)}` : ' · 문서'} · ${esc(ymd(x.updated_at))}</span></span>
        ${x.file_path ? `<span class="lb-x" data-lbdel="${esc(x.id)}" role="button" aria-label="지우기" title="지우기">×</span>` : ''}
      </button>`).join('') : '<p class="hint">자료가 없습니다.</p>'}</div>
    <p class="hint" style="margin-top:12px">파일은 한 개에 50MB까지 올릴 수 있습니다. 올릴 때 위의 분류를 골라 두면 그 분류로 들어갑니다.</p>`;
  const $ = (s) => root.querySelector(s);
  $('#lb-cat').onchange = (e) => { L.cat = e.target.value; L.msg = ''; draw(); };
  $('#lb-q').onchange = (e) => { L.q = e.target.value; draw(); };
  $('#lb-new').onclick = () => editor(null);
  $('#lb-file').onchange = (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) upload(fs); };
  root.querySelectorAll('[data-lb]').forEach((b) => { b.onclick = (e) => {
    const del = e.target.closest('[data-lbdel]'); const x = L.list.find((y) => y.id === b.dataset.lb);
    if (del) { e.stopPropagation(); remove(x); return; }
    if (x.file_path) openFile(x); else openDoc(x.id);
  }; });
}

const tabBtn = document.querySelector('#admin-tabs [data-tab="library"]');
if (tabBtn) tabBtn.addEventListener('click', () => { if (!L.loaded) load(); else draw(); });
