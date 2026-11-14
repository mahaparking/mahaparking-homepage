/* 영업·홍보 서버 함수 공통 도구 (밑줄로 시작하는 파일은 주소로 열리지 않습니다) */
const SB_URL = process.env.SUPABASE_URL || 'https://bidlnzkaimceyblyvaut.supabase.co';
const SB_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_RyfBwW7u_t4fgEnDRIWT7w_L8v4B4Zy';
const SITE = 'https://mahaparking.co.kr';

/** 로그인한 관리자 권한으로 Supabase 표 읽기·쓰기 (잠금 규칙 그대로 적용) */
async function sbRest(token, path, method, body) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: method || 'GET',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`자료를 읽지 못했습니다 (${r.status}) ${t.slice(0, 120)}`);
  }
  if (method && method !== 'GET') return null;
  return r.json();
}

const digits = (s) => String(s || '').replace(/\D/g, '');

function telText(s) {
  const d = digits(s);
  if (/^070\d{8}$/.test(d)) return d.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3');
  if (/^080\d{7}$/.test(d)) return d.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
  if (/^01\d{9}$/.test(d)) return d.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3');
  return s || '';
}

/** 문자 길이 (한글 2바이트 기준 · 90바이트 넘으면 장문) */
function smsBytes(s) { let n = 0; for (const ch of String(s)) n += ch.charCodeAt(0) > 127 ? 2 : 1; return n; }

/** 한국 시간 시(0~23) */
function kstHour() { return (new Date().getUTCHours() + 9) % 24; }

/**
 * 광고 문자 최종 문구. 관리자 화면 미리보기(assets/sales/sales.js 의 buildMessage)와 같아야 합니다.
 * 맨 앞 "(광고)회사명 대표번호" · 홍보물 보기 주소 · 맨 끝 수신거부 방법
 */
function buildMessage(S, text, promo) {
  const head = `(광고)${S.company || '마하파킹'} ${telText(S.company_tel)}`.trim();
  const link = promo ? `\n\n▶ ${promo.kind === 'video' ? '영상' : '자료'} 보기\n${SITE}/m/?p=${promo.id}` : '';
  const stop = S.optout_tel ? `무료수신거부 ${telText(S.optout_tel)}` : `수신거부 ${SITE}/m/?stop`;
  return `${head}\n${String(text).trim()}${link}\n\n${stop}`;
}

module.exports = { sbRest, digits, telText, kstHour, buildMessage, smsBytes, SB_URL, SITE };
