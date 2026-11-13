/**
 * 현장샷 쇼츠 엔진 — 휴대폰 브라우저 안에서 사진으로 세로 쇼츠(1080×1920)를 만든다.
 * 서버 없이 canvas + MediaRecorder 로 녹화하므로 서버 비용이 들지 않는다.
 *
 * 사용법:
 *   import { renderShorts } from './shorts-engine.js';
 *   const { blob, mimeType } = await renderShorts({ ...옵션 });
 *
 * 옵션(project):
 *   headline: { small: '서울 독산동 빌라', big: '주차차단바 교체' }
 *   scenes: [{
 *     image: File | Blob | URL 문자열,
 *     stage: 'before' | 'during' | 'after',
 *     subtitle: '배달 오토바이에 걸려\n차단바가 *파손*됐습니다',   // *단어* = 노란 강조
 *     focus: { x: 0.45, y: 0.5 } | null,  // 사진 안 포인트(0~1). 없으면 가운데
 *     zoom: 'low' | 'mid' | 'high',        // 포인트로 확대되는 정도
 *     mark: 'none' | 'circle' | 'arrow',   // 포인트 강조 표시
 *     duration: 초(선택, 없으면 자막 길이로 자동)
 *   }]
 *   endCard: 이미지 URL/Blob (1080×1920 엔딩 카드), endDuration: 3
 *   music: 오디오 URL/Blob (선택), musicVolume: 0.5
 *   style: { font: 'Black Han Sans', subtitleSize: 'big', subtitlePos: 'center',
 *            subtitleColor: 'white'|'yellow'|'band', headlineSize: 'big',
 *            headlineBg: 'blue'|'white'|'none', brand: '#0662AB' }
 *   onProgress: (0~1) => {}
 */

const W = 1080;
const H = 1920;
const FPS = 30;
const YELLOW = '#FFD84D';
// 쇼츠/릴스/틱톡 버튼이 가리는 영역: 아래 360px, 오른쪽 120px(아래 절반)
const SAFE_BOTTOM = H - 360;

const SIZE = {
  subtitle: { mid: 92, big: 112, huge: 132 },
  headline: { mid: 104, big: 128, huge: 150 },
};
const SUB_TOP = { top: 520, center: 1100, bottom: 1300 };
const ZOOM = { low: 1.25, mid: 1.6, high: 2.1 };

/* ---------- 불러오기 ---------- */

function toUrl(src) {
  if (typeof src === 'string') return { url: src, revoke: false };
  return { url: URL.createObjectURL(src), revoke: true };
}

function loadImage(src) {
  const { url, revoke } = toUrl(src);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { if (revoke) URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다'));
    img.src = url;
  });
}

async function loadAudio(ctx, src) {
  const { url, revoke } = toUrl(src);
  const buf = await (await fetch(url)).arrayBuffer();
  if (revoke) URL.revokeObjectURL(url);
  return ctx.decodeAudioData(buf);
}

/** 자막 길이로 장면 길이 자동 계산 (한 글자당 약 0.11초, 최소 2.6초) */
export function autoDuration(subtitle) {
  const chars = (subtitle || '').replace(/[*\s]/g, '').length;
  return Math.max(2.6, Math.min(5, 1.1 + chars * 0.11));
}

/* ---------- 그리기 ---------- */

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** 사진을 세로 화면에 그린다. 가로 사진은 천천히 훑고, 포인트가 있으면 그쪽으로 확대 */
function drawPhoto(g, img, scene, t) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const landscape = iw / ih > 1.15;
  const target = W / H;

  if (landscape && !scene.focus) {
    // 천천히 훑기: 높이를 맞추고 왼쪽→오른쪽
    const cw = ih * target;
    const x = (iw - cw) * (0.05 + 0.9 * ease(t));
    g.drawImage(img, x, 0, cw, ih, 0, 0, W, H);
    return;
  }
  const f = scene.focus || { x: 0.5, y: 0.5 };
  const z = 1 + (ZOOM[scene.zoom || 'mid'] - 1) * ease(Math.min(1, t * 1.15));
  const baseW = Math.min(iw, ih * target);
  const cw = baseW / z;
  const ch = cw / target;
  // 확대 중심을 처음엔 사진 가운데 → 포인트로 이동
  const cx0 = iw / 2, cy0 = ih / 2;
  const cx1 = f.x * iw, cy1 = f.y * ih;
  const k = ease(Math.min(1, t * 1.15));
  let cx = cx0 + (cx1 - cx0) * k;
  let cy = cy0 + (cy1 - cy0) * k;
  cx = Math.min(Math.max(cx, cw / 2), iw - cw / 2);
  cy = Math.min(Math.max(cy, ch / 2), ih - ch / 2);
  g.drawImage(img, cx - cw / 2, cy - ch / 2, cw, ch, 0, 0, W, H);
  scene._view = { sx: cx - cw / 2, sy: cy - ch / 2, scale: W / cw };
}

/** 포인트 강조 표시(동그라미/화살표) — 장면 35% 지점부터 나타남 */
function drawMark(g, img, scene, t) {
  if (!scene.focus || !scene.mark || scene.mark === 'none' || !scene._view) return;
  const a = Math.min(1, Math.max(0, (t - 0.35) / 0.15));
  if (a <= 0) return;
  const v = scene._view;
  const px = (scene.focus.x * img.naturalWidth - v.sx) * v.scale;
  const py = (scene.focus.y * img.naturalHeight - v.sy) * v.scale;
  g.save();
  g.globalAlpha = a;
  g.strokeStyle = YELLOW;
  g.fillStyle = YELLOW;
  g.lineCap = 'round';
  g.shadowColor = 'rgba(0,0,0,0.6)';
  g.shadowBlur = 12;
  if (scene.mark === 'circle') {
    g.lineWidth = 16;
    g.beginPath();
    g.arc(px, py, 150 * (0.85 + 0.15 * a), 0, Math.PI * 2);
    g.stroke();
  } else {
    // 오른쪽 위에서 포인트를 향하는 화살표
    const tx = px + 40, ty = py - 40;
    const fx = px + 300, fy = py - 300;
    g.lineWidth = 26;
    g.beginPath(); g.moveTo(fx, fy); g.lineTo(tx + 30, ty - 30); g.stroke();
    g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + 10, ty - 95); g.lineTo(tx + 95, ty - 10); g.closePath(); g.fill();
  }
  g.restore();
}

function parseLine(line) {
  return line.split('*').map((s, i) => ({ text: s, hl: i % 2 === 1 })).filter((p) => p.text);
}

function fitFont(g, family, size, lines, maxW) {
  let s = size;
  while (s > 60) {
    g.font = `${s}px "${family}"`;
    const widest = Math.max(...lines.map((l) => g.measureText(l.replace(/\*/g, '')).width));
    if (widest <= maxW) break;
    s -= 4;
  }
  return s;
}

function drawSubtitle(g, text, style, alpha) {
  if (!text) return;
  const lines = text.split('\n');
  const size = fitFont(g, style.font, SIZE.subtitle[style.subtitleSize || 'big'], lines, W - 100);
  const lh = Math.round(size * 1.28);
  let y = SUB_TOP[style.subtitlePos || 'center'];
  // 아래 위치여도 쇼츠 버튼 영역(SAFE_BOTTOM)은 넘지 않게
  y = Math.min(y, SAFE_BOTTOM - lh * lines.length);
  g.save();
  g.globalAlpha = alpha;
  g.font = `${size}px "${style.font}"`;
  g.textBaseline = 'top';
  g.lineJoin = 'round';
  const band = style.subtitleColor === 'band';
  for (const line of lines) {
    const plain = line.replace(/\*/g, '');
    const w = g.measureText(plain).width;
    let x = (W - w) / 2;
    if (band) {
      g.fillStyle = style.brand;
      roundRect(g, x - 28, y - 14, w + 56, lh + 4, 18);
      g.fill();
    }
    for (const seg of parseLine(line)) {
      const base = style.subtitleColor === 'yellow' ? YELLOW : '#FFFFFF';
      const hl = style.subtitleColor === 'yellow' ? '#FFFFFF' : YELLOW;
      if (!band) {
        g.lineWidth = Math.round(size * 0.24);
        g.strokeStyle = '#000000';
        g.strokeText(seg.text, x, y);
      }
      g.fillStyle = seg.hl ? hl : base;
      g.fillText(seg.text, x, y);
      x += g.measureText(seg.text).width;
    }
    y += lh;
  }
  g.restore();
}

function drawHeadline(g, headline, style) {
  if (!headline) return;
  const big = SIZE.headline[style.headlineSize || 'big'];
  const bg = style.headlineBg || 'blue';
  const top = 120;
  const smallSize = 50;
  const bandH = smallSize + big + 70;
  g.save();
  if (bg === 'blue') {
    g.fillStyle = style.brand;
    g.fillRect(0, top, W, bandH);
    g.fillStyle = YELLOW;
    g.fillRect(0, top + bandH, W, 14);
  } else if (bg === 'white') {
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.fillRect(0, top, W, bandH);
  }
  g.textAlign = 'center';
  g.textBaseline = 'top';
  const onBand = bg !== 'none';
  const outline = (txt, x, y, lw) => {
    if (onBand) return;
    g.lineWidth = lw; g.strokeStyle = '#000'; g.lineJoin = 'round'; g.strokeText(txt, x, y);
  };
  g.font = `bold ${smallSize}px "Noto Sans KR", "${style.font}", sans-serif`;
  g.fillStyle = bg === 'white' ? '#33424F' : bg === 'blue' ? '#CFE3F5' : '#FFFFFF';
  outline(headline.small || '', W / 2, top + 20, 10);
  g.fillText(headline.small || '', W / 2, top + 20);
  const bs = fitFont(g, style.font, big, [headline.big || ''], W - 80);
  g.font = `${bs}px "${style.font}"`;
  g.fillStyle = bg === 'white' ? style.brand : '#FFFFFF';
  outline(headline.big || '', W / 2, top + 30 + smallSize, 22);
  g.fillText(headline.big || '', W / 2, top + 30 + smallSize);
  g.restore();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* ---------- 녹화 ---------- */

function pickMime() {
  const list = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2', // 아이폰 사파리, 최신 크롬
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return list.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

/**
 * 장면들을 실제 시간으로 그리면서 녹화한다 (30초 영상 = 약 30초 소요).
 * 반환: { blob, mimeType, duration }
 */
export async function renderShorts(project) {
  const style = {
    font: 'Black Han Sans', brand: '#0662AB', subtitleSize: 'big', subtitlePos: 'center',
    subtitleColor: 'white', headlineSize: 'big', headlineBg: 'blue', ...(project.style || {}),
  };
  const onProgress = project.onProgress || (() => {});
  await document.fonts.load(`100px "${style.font}"`);

  const scenes = project.scenes.map((s) => ({ ...s, duration: s.duration || autoDuration(s.subtitle) }));
  const images = await Promise.all(scenes.map((s) => loadImage(s.image)));
  const endImg = project.endCard ? await loadImage(project.endCard) : null;
  const endDur = endImg ? project.endDuration || 3 : 0;

  // 타임라인
  let acc = 0;
  const timeline = scenes.map((s, i) => { const item = { s, img: images[i], start: acc }; acc += s.duration; return item; });
  const total = acc + endDur;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');

  // 오디오: 배경음악을 녹화 스트림에 섞는다
  // 아이폰은 버튼을 누른 순간에 만든 AudioContext 만 소리를 냅니다 → 화면에서 만들어 넘겨받습니다
  const AC = window.AudioContext || window.webkitAudioContext;
  const actx = project.audioContext || new AC();
  const dest = actx.createMediaStreamDestination();
  let musicNode = null;
  if (project.music) {
    const buf = await loadAudio(actx, project.music);
    musicNode = actx.createBufferSource();
    musicNode.buffer = buf;
    musicNode.loop = true;
    const gain = actx.createGain();
    const vol = project.musicVolume ?? 0.5;
    gain.gain.setValueAtTime(vol, actx.currentTime);
    gain.gain.setValueAtTime(vol, actx.currentTime + Math.max(0, total - 1.5));
    gain.gain.linearRampToValueAtTime(0.0001, actx.currentTime + total);
    musicNode.connect(gain).connect(dest);
  } else {
    // 무음 트랙(일부 플랫폼은 오디오 트랙이 없으면 업로드를 거부)
    const osc = actx.createConstantSource ? actx.createConstantSource() : actx.createOscillator();
    const z = actx.createGain(); z.gain.value = 0;
    osc.connect(z).connect(dest); osc.start();
  }

  const stream = canvas.captureStream(FPS);
  dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  const mimeType = pickMime();
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));

  const drawAt = (time) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    if (time >= total - endDur && endImg) {
      const k = Math.min(1, (time - (total - endDur)) / 0.3);
      g.fillStyle = style.brand; g.fillRect(0, 0, W, H);
      g.globalAlpha = k; g.drawImage(endImg, 0, 0, W, H); g.globalAlpha = 1;
      return;
    }
    const cur = timeline.find((it) => time >= it.start && time < it.start + it.s.duration) || timeline[timeline.length - 1];
    const t = Math.min(1, (time - cur.start) / cur.s.duration);
    drawPhoto(g, cur.img, cur.s, t);
    drawMark(g, cur.img, cur.s, t);
    drawHeadline(g, project.headline, style);
    const fadeIn = Math.min(1, (time - cur.start) / 0.2);
    drawSubtitle(g, cur.s.subtitle, style, fadeIn);
  };

  drawAt(0);
  await actx.resume();
  rec.start(500);
  if (musicNode) musicNode.start();
  const t0 = performance.now();

  await new Promise((resolve) => {
    const tick = () => {
      const time = (performance.now() - t0) / 1000;
      if (time >= total) { resolve(); return; }
      drawAt(time);
      onProgress(time / total);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  drawAt(total - 0.001);
  await new Promise((r) => setTimeout(r, 300));
  rec.stop();
  await stopped;
  if (musicNode) musicNode.stop();
  actx.close();
  onProgress(1);
  return { blob: new Blob(chunks, { type: mimeType || 'video/webm' }), mimeType, duration: total };
}

/** 한 장면 미리보기(포인트 지정 화면 등에서 사용): 지정한 진행률 t(0~1)의 화면을 canvas에 그림 */
export async function drawPreview(canvas, scene, project, t = 1) {
  const style = { font: 'Black Han Sans', brand: '#0662AB', ...(project.style || {}) };
  await document.fonts.load(`100px "${style.font}"`);
  const img = scene._img || (scene._img = await loadImage(scene.image));
  const g = canvas.getContext('2d');
  g.save();
  g.scale(canvas.width / W, canvas.height / H);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  drawPhoto(g, img, scene, t);
  drawMark(g, img, scene, t);
  drawHeadline(g, project.headline, style);
  drawSubtitle(g, scene.subtitle, style, 1);
  g.restore();
}
