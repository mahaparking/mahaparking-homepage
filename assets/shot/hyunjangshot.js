/* 현장샷 — 관리자 화면의 "현장샷" 탭
 * 사진(작업 전·중·후) → 포인트 지정 → 작업 정보 → AI 글쓰기 → 쇼츠 영상 + 블로그 글
 * 영상은 이 휴대폰(브라우저) 안에서 만들어집니다. 서버 비용 없음.
 */
import { renderShorts, drawPreview } from './shorts-engine.js';

const sb = supabase.createClient(MAHA.SB_URL, MAHA.SB_KEY);

const STAGES = [
  { key: 'before', name: '작업 전', hint: '고장 · 파손 모습' },
  { key: 'during', name: '작업 중', hint: '점검 · 교체 과정' },
  { key: 'after', name: '작업 후', hint: '완료 모습' },
];
const SITE_TYPES = ['아파트', '빌라', '상가', '오피스텔', '공영주차장', '물류센터', '공장', '학교', '기타'];
const WORK_TYPES = ['차단바 교체', '차단기 설치', '차단기 수리', '경광등 수리', '루프센서 시공', '차량검지기 교체', '번호인식 업그레이드', '기타'];
const MAX_PER_STAGE = 4;
const VOICES = [['Charon', '남성 1'], ['Fenrir', '남성 2'], ['Orus', '남성 3'], ['Puck', '남성 4'], ['Algenib', '남성 5'], ['Iapetus', '남성 6']];
const END_NARRATION = '주차설비 사고, 고장 수리는 마하파킹. 공일공, 팔이칠오, 일공삼육으로 연락 주세요.';

/* 블로그 고정 문단 (기존 마하파킹 블로그 글 그대로) */
const FIXED = {
  company: '마하파킹은 어떤 업체일까요?\n\n마하파킹은 주차장비를 유지보수하고, 오래된 주차장비를 합리적인 비용으로 새 장비처럼 쓸 수 있게 개선하는 업싸이클링 전문기업입니다.\n\n쉽게 말해 멀쩡한 건 살리고, 고장 난 부분만 정확히 찾아서 고치는 곳입니다.',
  promise: '마하파킹이 드리는 약속\n\n서울 및 경기남부, 인천 등 수도권 전 지역 신속한 방문 / 합리적 비용 / 확실한 결과\n\n신속 수리 & 합리적 개선 제안\n\n단순 교체가 아닌 근본 원인 분석과 예방 중심 유지관리\n\n모든 장비는 검증된 정품 부품만 사용\n\n고객의 안전과 신뢰,\n그것이 마하파킹의 기준입니다.\n\n[사진: 마하파킹 배너]',
  closing: '현장 전체와 고장 부위 사진을 보내주시면\n교체 가능 여부와 비용을 안내해 드리겠습니다.\n\n마하파킹은 서울, 경기, 인천 지역에서\n주차차단기 수리·교체, 주차장 경광등 수리,\n차량검지기 교체, 루프센서 시공을 진행하고 있습니다.\n\n[문의 및 상담 안내]\n\n마하파킹 – 주차장비 유지보수 & 업싸이클링 전문기업\n\n0.1.0. - . 8.2.7.5. - .1.0.3.6.',
};

/* ---------- 상태 ---------- */
const S = {
  photos: { before: [], during: [], after: [] }, // { id, file, blob, url, focus, zoom, mark }
  info: { region: '', site_type: '', work_type: '', memo: '', revisit: false, consult: '현장 방문' },
  result: null, // AI 결과
  scenes: [], // [{ photo, subtitle }]
  headline: { small: '', big: '' },
  style: { font: 'Black Han Sans', subtitleSize: 'big', subtitlePos: 'center', subtitleColor: 'white', headlineSize: 'big', headlineBg: 'blue' },
  music: 'bright',
  voice: 'Charon', // 'none' 이면 음성 없음
  endNarration: END_NARRATION,
  ending: 'blue',
  previewIdx: 0,
  busy: false,
};
let uid = 0;

const root = document.getElementById('shot-root');
const allPhotos = () => STAGES.flatMap((s) => S.photos[s.key].map((p) => ({ ...p, stage: s.key })));
const opt = (list, cur) => list.map(([v, t]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${t}</option>`).join('');

/* ---------- 1. 사진 ---------- */
function drawPhotos() {
  root.querySelector('#shot-stages').innerHTML = STAGES.map((st, si) => {
    const list = S.photos[st.key];
    return `<div class="shot-stage">
      <div class="shot-stage-h"><span class="shot-no">${si + 1}</span><b>${st.name}</b><span class="hint">${st.hint}</span><span class="hint" style="margin-left:auto">${list.length} / ${MAX_PER_STAGE}장</span></div>
      <div class="shot-thumbs">
        ${list.map((p, i) => `<figure class="shot-th">
          <button type="button" class="shot-th-img" data-pt="${st.key}:${i}" aria-label="${st.name} ${i + 1}번 사진 포인트 지정"><img src="${p.url}" alt=""></button>
          ${p.focus ? '<span class="shot-badge">포인트</span>' : ''}
          <button type="button" class="shot-x" data-del="${st.key}:${i}" aria-label="사진 빼기">×</button>
          <div class="shot-mv"><button type="button" data-mv="${st.key}:${i}:-1" aria-label="앞으로"${i === 0 ? ' disabled' : ''}>◀</button><button type="button" data-mv="${st.key}:${i}:1" aria-label="뒤로"${i === list.length - 1 ? ' disabled' : ''}>▶</button></div>
        </figure>`).join('')}
        ${list.length < MAX_PER_STAGE ? `<label class="shot-add">＋<span>사진 추가</span><input type="file" accept="image/*" multiple data-add="${st.key}" hidden></label>` : ''}
      </div>
    </div>`;
  }).join('');
  const n = allPhotos().length;
  root.querySelector('#shot-count').textContent = n ? `사진 ${n}장 · 포인트 지정 ${allPhotos().filter((p) => p.focus).length}장 — 사진을 누르면 부각할 곳을 지정할 수 있습니다.` : '각 칸에 1~4장씩 넣어 주세요. 사진 순서대로 영상과 글이 만들어집니다.';

  root.querySelectorAll('[data-add]').forEach((inp) => {
    inp.onchange = async () => {
      const key = inp.dataset.add;
      const files = [...inp.files].slice(0, MAX_PER_STAGE - S.photos[key].length);
      for (const f of files) {
        const r = await shrinkToBlob(f, 1600); // 영상용으로 적당한 크기
        if (r) S.photos[key].push({ id: ++uid, blob: r.blob, url: r.url, focus: null, zoom: 'mid', mark: 'circle' });
      }
      drawPhotos();
    };
  });
  root.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = () => { const [k, i] = b.dataset.del.split(':'); S.photos[k].splice(+i, 1); drawPhotos(); };
  });
  root.querySelectorAll('[data-mv]').forEach((b) => {
    b.onclick = () => {
      const [k, i, d] = b.dataset.mv.split(':'); const a = S.photos[k]; const j = +i + +d;
      [a[i], a[j]] = [a[j], a[i]]; drawPhotos();
    };
  });
  root.querySelectorAll('[data-pt]').forEach((b) => {
    b.onclick = () => { const [k, i] = b.dataset.pt.split(':'); pointEditor(S.photos[k][+i]); };
  });
}

/* 포인트 지정 팝업: 사진을 탭하면 그곳으로 확대 + 강조 표시 */
function pointEditor(p) {
  const draft = { focus: p.focus ? { ...p.focus } : null, zoom: p.zoom, mark: p.mark };
  modal(`<h3 style="margin-bottom:6px">포인트 지정</h3>
    <p class="hint" style="margin:0 0 10px">부각하고 싶은 곳을 사진에서 눌러 주세요. 영상에서 그곳으로 서서히 확대됩니다.</p>
    <div class="shot-pt">
      <div class="shot-pt-img" id="pt-stage"><img src="${p.url}" alt="포인트를 지정할 사진" id="pt-img"><span class="shot-pt-dot hidden" id="pt-dot"></span></div>
      <div class="shot-pt-side"><canvas id="pt-pv" width="216" height="384" aria-label="쇼츠 미리보기"></canvas><span class="hint">쇼츠 미리보기</span></div>
    </div>
    <div class="shot-seg" role="group" aria-label="강조 표시"><b>강조 표시</b>${[['none', '없음'], ['circle', '동그라미'], ['arrow', '화살표']].map(([v, t]) => `<button type="button" data-mk="${v}">${t}</button>`).join('')}</div>
    <div class="shot-seg" role="group" aria-label="확대 정도"><b>확대 정도</b>${[['low', '약하게'], ['mid', '보통'], ['high', '강하게']].map(([v, t]) => `<button type="button" data-zm="${v}">${t}</button>`).join('')}</div>
    <div class="btns" style="margin-top:14px"><button class="btn btn-primary" id="pt-ok">저장</button><button class="btn btn-line" id="pt-clear">포인트 지우기</button><button class="btn btn-line" data-close>취소</button></div>`);
  document.getElementById('modal-box').classList.add('wide');
  document.getElementById('modal-box').scrollTop = 0;
  const pv = document.getElementById('pt-pv');
  const scene = { image: p.blob, _img: null, focus: null, zoom: 'mid', mark: 'circle', subtitle: '' };
  const refresh = () => {
    const dot = document.getElementById('pt-dot');
    dot.classList.toggle('hidden', !draft.focus);
    if (draft.focus) { dot.style.left = `${draft.focus.x * 100}%`; dot.style.top = `${draft.focus.y * 100}%`; }
    document.querySelectorAll('[data-mk]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mk === draft.mark));
    document.querySelectorAll('[data-zm]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.zm === draft.zoom));
    Object.assign(scene, { focus: draft.focus, zoom: draft.zoom, mark: draft.mark });
    drawPreview(pv, scene, { headline: S.headline.big ? S.headline : null, style: S.style }, 1);
  };
  document.getElementById('pt-img').onclick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    draft.focus = { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
    refresh();
  };
  document.querySelectorAll('[data-mk]').forEach((b) => { b.onclick = () => { draft.mark = b.dataset.mk; refresh(); }; });
  document.querySelectorAll('[data-zm]').forEach((b) => { b.onclick = () => { draft.zoom = b.dataset.zm; refresh(); }; });
  document.getElementById('pt-ok').onclick = () => { Object.assign(p, draft); closeModal(); drawPhotos(); drawScenes(); };
  document.getElementById('pt-clear').onclick = () => { draft.focus = null; refresh(); };
  refresh();
}

/* ---------- 2. 작업 정보 ---------- */
function drawInfo() {
  const chips = (name, list, cur) => list.map((t) => `<label><input type="radio" name="${name}" value="${t}"${t === cur ? ' checked' : ''}> ${t}</label>`).join('');
  root.querySelector('#shot-info').innerHTML = `
    <label class="f" for="si-region">지역 <span class="hint">(구·동까지만, 예: 서울 금천구 독산동)</span><input id="si-region" value="${esc(S.info.region)}" placeholder="서울 금천구 독산동"></label>
    <div class="f"><span>현장 종류</span><div class="chips">${chips('si-site', SITE_TYPES, S.info.site_type)}</div></div>
    <div class="f"><span>작업 종류</span><div class="chips">${chips('si-work', WORK_TYPES, S.info.work_type)}</div></div>
    <div class="f"><span>상담 방식</span><div class="chips">${chips('si-consult', ['사진 상담 후 방문', '현장 방문'], S.info.consult)}</div></div>
    <label class="f" for="si-memo">작업 메모 <span class="hint">(고장 증상 · 원인 · 한 일 · 고객과 협의한 내용. 휴대폰 키보드의 마이크로 말해도 됩니다)</span>
      <textarea id="si-memo" style="min-height:120px" placeholder="예) 배달 오토바이에 걸려 차단바 파손. 홀더 쪽 심하게 찢어짐. 기존 차단바 제거 후 새 차단바 장착, LED 색상 변하게 설정.">${esc(S.info.memo)}</textarea></label>
    <label style="display:inline-flex;gap:8px;align-items:center;font-weight:700;font-size:14px"><input type="checkbox" id="si-revisit" style="width:20px;height:20px"${S.info.revisit ? ' checked' : ''}> 재방문 고객 (예전에 작업해 드린 곳)</label>`;
  const q = (s) => root.querySelector(s);
  q('#si-region').oninput = (e) => { S.info.region = e.target.value; };
  q('#si-memo').oninput = (e) => { S.info.memo = e.target.value; };
  q('#si-revisit').onchange = (e) => { S.info.revisit = e.target.checked; };
  root.querySelectorAll('input[name=si-site]').forEach((r) => { r.onchange = () => { S.info.site_type = r.value; }; });
  root.querySelectorAll('input[name=si-work]').forEach((r) => { r.onchange = () => { S.info.work_type = r.value; }; });
  root.querySelectorAll('input[name=si-consult]').forEach((r) => { r.onchange = () => { S.info.consult = r.value; }; });
}

/* ---------- 3. AI 글쓰기 ---------- */
function toB64(blob, max = 900) {
  return new Promise((res) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.78).split(',')[1]);
    };
    img.src = url;
  });
}

async function runAI() {
  const msg = root.querySelector('#shot-ai-msg');
  const photos = allPhotos();
  const err = !photos.length ? '사진을 한 장 이상 넣어 주세요.' : !S.info.work_type ? '작업 종류를 골라 주세요.' : !S.info.memo.trim() ? '작업 메모를 적어 주세요.' : '';
  if (err) { msg.textContent = err; msg.className = 'notice'; return; }
  const btn = root.querySelector('#shot-ai');
  btn.disabled = true; S.busy = true;
  msg.className = 'hint';
  msg.textContent = 'AI가 사진을 보고 쇼츠 자막과 블로그 글을 쓰고 있습니다. 30초~1분 정도 걸립니다...';
  try {
    const { data } = await sb.auth.getSession();
    const token = data.session && data.session.access_token;
    const body = { info: S.info, photos: await Promise.all(photos.map(async (p) => ({ stage: p.stage, b64: await toB64(p.blob) }))) };
    const r = await fetch('/api/hyunjangshot', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `오류 ${r.status}`);
    S.result = j.result;
    const sh = j.result.shorts || {};
    S.headline = { small: sh.headline_small || '', big: sh.headline_big || '' };
    S.scenes = photos.map((p, i) => {
      const found = (sh.scenes || []).find((x) => x.photo === i + 1) || (sh.scenes || [])[i] || {};
      return { photo: i, subtitle: (found.subtitle || '').replace(/\\n/g, '\n'), narration: found.narration || (found.subtitle || '').replace(/\*|\\n|\n/g, ' ').replace(/\s+/g, ' ').trim() };
    });
    S.previewIdx = 0;
    msg.textContent = '';
    root.querySelector('#shot-result').classList.remove('hidden');
    drawResult();
    root.querySelector('#shot-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    msg.className = 'notice';
    msg.textContent = `글을 만들지 못했습니다: ${e.message}`;
  } finally {
    btn.disabled = false; S.busy = false;
  }
}

/* ---------- 4. 결과: 쇼츠 ---------- */
function drawResult() {
  const res = S.result;
  const checks = (res.checks || []).filter(Boolean);
  root.querySelector('#shot-checks').innerHTML = checks.length
    ? `<div class="notice"><b>확인해 주세요</b><ul style="margin:6px 0 0;padding-left:18px">${checks.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>` : '';
  root.querySelector('#sh-small').value = S.headline.small;
  root.querySelector('#sh-big').value = S.headline.big;
  drawScenes();
  drawStyle();
  root.querySelector('#shot-blog').value = buildBlog();
  root.querySelector('#shot-kw').textContent = [
    res.blog.keywords_main && res.blog.keywords_main.length ? `메인 키워드: ${res.blog.keywords_main.join(', ')}` : '',
    res.blog.keywords_ext && res.blog.keywords_ext.length ? `확장 키워드: ${res.blog.keywords_ext.join(', ')}` : '',
  ].filter(Boolean).join('  ·  ');
}

function drawScenes() {
  const box = root.querySelector('#shot-scenes');
  if (!box || !S.scenes.length) return;
  const photos = allPhotos();
  box.innerHTML = S.scenes.map((sc, i) => {
    const p = photos[sc.photo];
    return `<div class="shot-scene${i === S.previewIdx ? ' on' : ''}">
      <button type="button" class="shot-scene-img" data-pv="${i}" aria-label="${i + 1}번 장면 미리보기"><img src="${p ? p.url : ''}" alt=""></button>
      <div style="flex:1;display:grid;gap:6px;min-width:0">
        <label class="f"><span class="hint">${i + 1}번 장면 자막 · 줄바꿈으로 두 줄, *단어* 는 노란 강조</span><textarea data-sub="${i}" rows="2">${esc(sc.subtitle)}</textarea></label>
        <label class="f shot-nar"><span class="hint">내레이션 (성우가 읽는 문장)</span><textarea data-nar="${i}" rows="2" style="min-height:56px">${esc(sc.narration || '')}</textarea></label>
      </div>
    </div>`;
  }).join('');
  box.querySelectorAll('[data-sub]').forEach((t) => { t.oninput = () => { S.scenes[+t.dataset.sub].subtitle = t.value; if (+t.dataset.sub === S.previewIdx) preview(); }; t.onfocus = () => { if (S.previewIdx !== +t.dataset.sub) { S.previewIdx = +t.dataset.sub; markOn(); preview(); } }; });
  box.querySelectorAll('[data-nar]').forEach((t) => { t.oninput = () => { S.scenes[+t.dataset.nar].narration = t.value; }; });
  root.querySelectorAll('.shot-nar').forEach((el) => el.classList.toggle('hidden', S.voice === 'none'));
  box.querySelectorAll('[data-pv]').forEach((b) => { b.onclick = () => { S.previewIdx = +b.dataset.pv; markOn(); preview(); }; });
  preview();
}
function markOn() { root.querySelectorAll('.shot-scene').forEach((el, i) => el.classList.toggle('on', i === S.previewIdx)); }

function sceneList() {
  const photos = allPhotos();
  return S.scenes.map((sc) => {
    const p = photos[sc.photo];
    return { image: p.blob, stage: p.stage, subtitle: sc.subtitle, focus: p.focus, zoom: p.zoom, mark: p.focus ? p.mark : 'none' };
  });
}

let pvScenes = new Map();
function preview() {
  const canvas = root.querySelector('#shot-pv');
  if (!canvas || !S.scenes.length) return;
  const list = sceneList();
  const sc = list[S.previewIdx];
  const key = S.scenes[S.previewIdx].photo;
  const cached = pvScenes.get(key);
  if (cached && cached.image === sc.image) sc._img = cached._img;
  drawPreview(canvas, sc, { headline: S.headline, style: S.style }, 1).then(() => pvScenes.set(key, sc));
}

function drawStyle() {
  const q = (s) => root.querySelector(s);
  q('#st-font').innerHTML = opt([['Black Han Sans', '블랙한산스 (굵게)'], ['Do Hyeon', '도현'], ['Jua', '주아'], ['Noto Sans KR', '본고딕']], S.style.font);
  q('#st-size').innerHTML = opt([['mid', '보통'], ['big', '크게'], ['huge', '아주 크게']], S.style.subtitleSize);
  q('#st-pos').innerHTML = opt([['top', '위'], ['center', '가운데'], ['bottom', '아래']], S.style.subtitlePos);
  q('#st-color').innerHTML = opt([['white', '흰색 + 검정 테두리'], ['yellow', '노랑 + 검정 테두리'], ['band', '파란 띠']], S.style.subtitleColor);
  q('#st-hsize').innerHTML = opt([['mid', '보통'], ['big', '크게'], ['huge', '아주 크게']], S.style.headlineSize);
  q('#st-hbg').innerHTML = opt([['blue', '파란 띠'], ['white', '흰 띠'], ['none', '띠 없음']], S.style.headlineBg);
  q('#st-music').innerHTML = opt([['bright', '경쾌하게'], ['calm', '차분하게'], ['none', '음악 없음']], S.music);
  q('#st-end').innerHTML = opt([['blue', '파란 배경'], ['white', '흰 배경'], ['none', '엔딩 없음']], S.ending);
  q('#st-voice').innerHTML = opt([['none', '음성 없음 (자막만)']].concat(VOICES), S.voice);
  q('#st-endnar').value = S.endNarration;
  q('#st-endnar').oninput = (e) => { S.endNarration = e.target.value; };
  q('#st-voice').onchange = (e) => { S.voice = e.target.value; root.querySelectorAll('.shot-nar').forEach((el) => el.classList.toggle('hidden', S.voice === 'none')); };
  q('#st-listen').onclick = listenVoice;
  const bind = (id, fn) => { q(id).onchange = (e) => { fn(e.target.value); preview(); }; };
  bind('#st-font', (v) => { S.style.font = v; });
  bind('#st-size', (v) => { S.style.subtitleSize = v; });
  bind('#st-pos', (v) => { S.style.subtitlePos = v; });
  bind('#st-color', (v) => { S.style.subtitleColor = v; });
  bind('#st-hsize', (v) => { S.style.headlineSize = v; });
  bind('#st-hbg', (v) => { S.style.headlineBg = v; });
  bind('#st-music', (v) => { S.music = v; });
  bind('#st-end', (v) => { S.ending = v; });
  q('#sh-small').oninput = (e) => { S.headline.small = e.target.value; preview(); };
  q('#sh-big').oninput = (e) => { S.headline.big = e.target.value; preview(); };
}

/* ---------- 내레이션 음성 (구글 Chirp 3 HD, /api/hyunjangshot-tts) ---------- */
const ttsCache = new Map(); // "목소리|문장" → mp3 Blob
const b64ToBlob = (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: 'audio/mpeg' }); };

async function tts(lines, voice) {
  const need = [...new Set(lines.filter((s) => s && !ttsCache.has(`${voice}|${s}`)))];
  if (need.length) {
    const { data } = await sb.auth.getSession();
    const token = data.session && data.session.access_token;
    const r = await fetch('/api/hyunjangshot-tts', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ lines: need, voice }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `음성 오류 ${r.status}`);
    need.forEach((s, i) => { if (j.clips[i]) ttsCache.set(`${voice}|${s}`, b64ToBlob(j.clips[i])); });
  }
  return lines.map((s) => (s ? ttsCache.get(`${voice}|${s}`) || null : null));
}

async function listenVoice() {
  const btn = root.querySelector('#st-listen');
  const au = root.querySelector('#st-audio');
  if (S.voice === 'none') { modal('<h3>목소리를 먼저 골라 주세요</h3><p>"내레이션 목소리"에서 남성 1~6 중 하나를 고르면 들어볼 수 있습니다.</p><button class="btn btn-primary" data-close>확인</button>'); return; }
  const line = (S.scenes[S.previewIdx] && S.scenes[S.previewIdx].narration) || '안녕하세요, 주차장비 유지보수 전문 마하파킹입니다.';
  btn.disabled = true; btn.textContent = '불러오는 중...';
  try {
    const [blob] = await tts([line], S.voice);
    au.src = URL.createObjectURL(blob);
    await au.play();
  } catch (e) {
    modal(`<h3>목소리를 불러오지 못했습니다</h3><p>${esc(e.message)}</p><button class="btn btn-primary" data-close>확인</button>`);
  } finally {
    btn.disabled = false; btn.textContent = '▶ 목소리 들어보기';
  }
}

async function makeVideo() {
  if (S.busy) return;
  // 아이폰: 버튼을 누른 이 순간에 소리 장치를 켜야 영상에 음악이 들어갑니다
  const AC = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AC();
  audioContext.resume();
  const btn = root.querySelector('#shot-make');
  const bar = root.querySelector('#shot-progress');
  const out = root.querySelector('#shot-video');
  S.busy = true; btn.disabled = true;
  bar.classList.remove('hidden'); bar.value = 0;
  out.innerHTML = '<p class="hint">영상을 만드는 중입니다. 영상 길이만큼 시간이 걸립니다. <b>화면을 끄거나 다른 앱으로 넘어가지 마세요.</b></p>';
  try {
    const scenes = sceneList();
    let endVoice = null;
    if (S.voice !== 'none') {
      out.innerHTML = '<p class="hint">내레이션 음성을 만드는 중입니다...</p>';
      const lines = S.scenes.map((sc) => (sc.narration || '').trim());
      const withEnd = S.ending !== 'none' && S.endNarration.trim();
      const clips = await tts(withEnd ? lines.concat([S.endNarration.trim()]) : lines, S.voice);
      scenes.forEach((sc, i) => { sc.voice = clips[i]; });
      if (withEnd) endVoice = clips[lines.length];
      out.innerHTML = '<p class="hint">영상을 만드는 중입니다. 영상 길이만큼 시간이 걸립니다. <b>화면을 끄거나 다른 앱으로 넘어가지 마세요.</b></p>';
    }
    const { blob, mimeType } = await renderShorts({
      headline: S.headline,
      scenes,
      endVoice,
      endCard: S.ending === 'none' ? null : `/assets/shot/endcard-${S.ending}.jpg`,
      endDuration: 3,
      music: S.music === 'none' ? null : `/assets/shot/bgm-${S.music}.mp3`,
      musicVolume: 0.5,
      style: S.style,
      audioContext,
      onProgress: (k) => { bar.value = k; },
    });
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const name = `현장샷_${today().replace(/-/g, '')}_${(S.info.region.split(' ').pop() || '현장')}_${(S.info.work_type || '').replace(/\s/g, '')}.${ext}`;
    const url = URL.createObjectURL(blob);
    const file = new File([blob], name, { type: blob.type });
    const canShare = navigator.canShare && navigator.canShare({ files: [file] });
    out.innerHTML = `<video src="${url}" controls playsinline class="shot-video-el"></video>
      <div class="btns" style="margin-top:10px">
        <a class="btn btn-primary" href="${url}" download="${esc(name)}">휴대폰에 저장</a>
        ${canShare ? '<button type="button" class="btn btn-cta" id="shot-share">유튜브·인스타·틱톡으로 보내기</button>' : ''}
      </div>
      <p class="hint">${canShare ? '"보내기"를 누르면 휴대폰 공유 창이 열립니다. 유튜브·인스타그램·틱톡 앱을 고르면 바로 올릴 수 있습니다.' : '저장한 뒤 유튜브·인스타그램·틱톡 앱에서 올려 주세요.'}${ext === 'webm' ? ' (이 브라우저는 webm 형식으로 저장됩니다. 아이폰 사파리나 최신 크롬에서는 mp4로 저장됩니다.)' : ''}</p>`;
    const sh = document.getElementById('shot-share');
    if (sh) sh.onclick = () => navigator.share({ files: [file], title: `${S.headline.small} ${S.headline.big}` }).catch(() => {});
  } catch (e) {
    out.innerHTML = `<p class="notice">영상을 만들지 못했습니다: ${esc(e.message)}</p>`;
  } finally {
    S.busy = false; btn.disabled = false; bar.classList.add('hidden');
  }
}

/* ---------- 5. 결과: 블로그 ---------- */
function buildBlog() {
  const b = S.result.blog;
  const photos = allPhotos();
  const ph = (n, cap) => `[사진 ${n}: ${cap}]`;
  const lastAfter = photos.length; // 대표 사진: 마지막(완료) 사진
  const out = [];
  out.push(b.title, '');
  (b.intro || []).forEach((p) => out.push(p, ''));
  out.push(ph(lastAfter, '작업을 마친 현장 전체 모습 (대표 사진)'), '');
  out.push(FIXED.company, '', FIXED.promise, '');
  out.push('목 차', '');
  (b.sections || []).forEach((s, i) => out.push(`${i + 1}. ${s.heading}`));
  out.push('');
  (b.sections || []).forEach((s, i) => {
    out.push(`${i + 1}. ${s.heading}`, '');
    (s.paragraphs || []).forEach((p) => out.push(p, ''));
    if (s.tip) out.push(`※ ${s.tip}`, '');
    (s.photos || []).forEach((x) => out.push(ph(x.photo, x.caption)));
    out.push('');
  });
  out.push(b.closing_hook, '', FIXED.closing, '');
  if (b.hashtags && b.hashtags.length) out.push(b.hashtags.map((h) => `#${String(h).replace(/^#/, '').replace(/\s/g, '')}`).join(' '));
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function copyBlog() {
  const t = root.querySelector('#shot-blog');
  try { await navigator.clipboard.writeText(t.value); } catch (e) { t.select(); document.execCommand('copy'); }
  const m = root.querySelector('#shot-blog-msg');
  m.textContent = '복사했습니다. 네이버 블로그 앱에 붙여넣고, [사진 n] 자리에 사진을 넣어 주세요.';
}

function savePhotos() {
  allPhotos().forEach((p, i) => {
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = p.url; a.download = `사진${String(i + 1).padStart(2, '0')}.jpg`;
      document.body.appendChild(a); a.click(); a.remove();
    }, i * 400);
  });
}

/* ---------- 화면 틀 ---------- */
function mount() {
  root.innerHTML = `
  <p class="hint">현장 사진을 고르고 메모만 적으면, AI가 쇼츠 자막과 블로그 글을 쓰고 이 휴대폰에서 바로 쇼츠 영상을 만듭니다.</p>
  <div class="shot-step"><h3><span class="shot-step-no">1</span> 사진 넣기</h3><p class="hint" id="shot-count"></p><div id="shot-stages" class="shot-stages"></div></div>
  <div class="shot-step"><h3><span class="shot-step-no">2</span> 작업 정보</h3><div id="shot-info" style="display:grid;gap:14px;max-width:760px"></div></div>
  <div class="btns" style="margin-top:18px"><button class="btn btn-cta" type="button" id="shot-ai">AI로 쇼츠 · 블로그 글 만들기</button></div>
  <p class="hint" id="shot-ai-msg" role="status" style="margin-top:10px"></p>

  <div id="shot-result" class="hidden">
    <div id="shot-checks" style="margin-top:20px"></div>
    <div class="shot-step"><h3><span class="shot-step-no">3</span> 쇼츠</h3>
      <div class="shot-res-grid">
        <div class="shot-pv-wrap"><canvas id="shot-pv" width="360" height="640" aria-label="선택한 장면 미리보기"></canvas><span class="hint">장면을 누르면 미리보기가 바뀝니다</span></div>
        <div style="display:grid;gap:12px;align-content:start;min-width:0">
          <div class="row2"><label class="f" for="sh-small">헤드라인 작은 글씨<input id="sh-small"></label><label class="f" for="sh-big">헤드라인 큰 글씨<input id="sh-big"></label></div>
          <div class="shot-styles">
            <label class="f" for="st-font">글꼴<select id="st-font"></select></label>
            <label class="f" for="st-size">자막 크기<select id="st-size"></select></label>
            <label class="f" for="st-pos">자막 위치<select id="st-pos"></select></label>
            <label class="f" for="st-color">자막 색<select id="st-color"></select></label>
            <label class="f" for="st-hsize">헤드라인 크기<select id="st-hsize"></select></label>
            <label class="f" for="st-hbg">헤드라인 배경<select id="st-hbg"></select></label>
            <label class="f" for="st-music">배경음악<select id="st-music"></select></label>
            <label class="f" for="st-end">엔딩 화면<select id="st-end"></select></label>
          </div>
          <div class="shot-voice">
            <label class="f" for="st-voice">내레이션 목소리<select id="st-voice"></select></label>
            <button class="btn btn-line btn-sm" type="button" id="st-listen">▶ 목소리 들어보기</button>
            <audio id="st-audio" class="hidden"></audio>
          </div>
          <label class="f shot-nar" for="st-endnar">엔딩 내레이션<input id="st-endnar"></label>
        </div>
      </div>
      <div id="shot-scenes" class="shot-scenes"></div>
      <div class="btns" style="margin-top:16px"><button class="btn btn-primary" type="button" id="shot-make">영상 만들기</button></div>
      <progress id="shot-progress" class="hidden shot-progress" max="1" value="0"></progress>
      <div id="shot-video" style="margin-top:12px"></div>
    </div>
    <div class="shot-step"><h3><span class="shot-step-no">4</span> 블로그 글</h3>
      <p class="hint">마하파킹 블로그 고정 구성(의문문 제목 → 요약 → 회사 소개 · 약속 → 목차 → 시공 이야기 → 문의 안내)으로 썼습니다. 여기서 바로 고칠 수 있습니다.</p>
      <p class="hint" id="shot-kw"></p>
      <textarea id="shot-blog" class="shot-blog" aria-label="블로그 글"></textarea>
      <div class="btns" style="margin-top:10px"><button class="btn btn-primary" type="button" id="shot-copy">글 전체 복사</button><button class="btn btn-line" type="button" id="shot-photos">사진 순서대로 저장</button></div>
      <p class="hint" id="shot-blog-msg" role="status"></p>
    </div>
    <div class="btns" style="margin-top:24px"><button class="btn btn-line" type="button" id="shot-new">새 현장 시작</button></div>
  </div>`;
  drawPhotos();
  drawInfo();
  root.querySelector('#shot-ai').onclick = runAI;
  root.querySelector('#shot-make').onclick = makeVideo;
  root.querySelector('#shot-copy').onclick = copyBlog;
  root.querySelector('#shot-photos').onclick = savePhotos;
  root.querySelector('#shot-new').onclick = () => {
    modal('<h3>새 현장을 시작할까요?</h3><p>지금 사진과 글은 저장되지 않고 지워집니다. 영상과 글을 먼저 저장·복사해 두세요.</p><div class="btns"><button class="btn btn-danger" id="do-new">새로 시작</button><button class="btn btn-line" data-close>취소</button></div>');
    document.getElementById('do-new').onclick = () => {
      S.photos = { before: [], during: [], after: [] };
      S.info = { region: '', site_type: '', work_type: '', memo: '', revisit: false, consult: '현장 방문' };
      S.result = null; S.scenes = []; S.headline = { small: '', big: '' }; pvScenes = new Map();
      closeModal(); mount(); window.scrollTo(0, 0);
    };
  };
}

window.addEventListener('beforeunload', (e) => {
  if (allPhotos().length) { e.preventDefault(); e.returnValue = ''; }
});

if (root) mount();
