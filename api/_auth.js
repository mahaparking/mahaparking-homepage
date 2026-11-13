/* 서버 함수 공통: 관리자 확인, 요청 읽기, 응답 보내기 (밑줄로 시작하는 파일은 주소로 열리지 않습니다) */
const SB_URL = process.env.SUPABASE_URL || 'https://bidlnzkaimceyblyvaut.supabase.co';
const SB_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_RyfBwW7u_t4fgEnDRIWT7w_L8v4B4Zy';

async function isAdmin(token) {
  if (!token) return false;
  const headers = { apikey: SB_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const u = await fetch(`${SB_URL}/auth/v1/user`, { headers });
  if (!u.ok) return false;
  const r = await fetch(`${SB_URL}/rest/v1/rpc/is_admin`, { method: 'POST', headers, body: '{}' });
  if (!r.ok) return false;
  return (await r.json()) === true;
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => { s += c; });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

/** 관리자가 아니면 응답을 보내고 false */
async function guard(req, res) {
  if (req.method !== 'POST') { send(res, 405, { error: 'POST 만 됩니다.' }); return false; }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try {
    if (await isAdmin(token)) return true;
    send(res, 401, { error: '관리자 로그인이 필요합니다.' });
  } catch (e) {
    send(res, 502, { error: '로그인 확인에 실패했습니다.' });
  }
  return false;
}

module.exports = { isAdmin, readBody, send, guard };
