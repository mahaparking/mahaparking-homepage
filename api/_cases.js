/**
 * 공개 시공사례 불러오기 (시공사례 페이지 · 사이트맵에서 함께 씀)
 * 관리자 화면에서 "공개"로 체크한 사례(published = true)만 가져옵니다.
 */
const SB_URL = process.env.SUPABASE_URL || 'https://bidlnzkaimceyblyvaut.supabase.co';
const SB_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_RyfBwW7u_t4fgEnDRIWT7w_L8v4B4Zy';
const SITE = 'https://www.mahaparking.co.kr';

async function listCases() {
  const q = 'select=id,title,area,work_type,work_date,description,result,photos,created_at' +
    '&published=eq.true&order=work_date.desc.nullslast,created_at.desc';
  const r = await fetch(`${SB_URL}/rest/v1/cases?${q}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  if (!r.ok) throw new Error(`cases ${r.status}`);
  return r.json();
}

/* 주소 만들기: 제목(한글 그대로) + 고유번호 앞 8자리. 예) /cases/정문-차단바-교체-1a2b3c4d */
function slugOf(c) {
  const words = String(c.title || '시공사례')
    .replace(/[^0-9A-Za-z가-힣\s-]/g, ' ')
    .trim().split(/[\s-]+/).filter(Boolean).slice(0, 8).join('-');
  return `${words || '시공사례'}-${String(c.id).slice(0, 8)}`;
}
function urlOf(c) { return `${SITE}/cases/${encodeURIComponent(slugOf(c))}`; }
function pathOf(c) { return `/cases/${encodeURIComponent(slugOf(c))}`; }
function findBySlug(list, slug) {
  let s = String(slug || ''); try { s = decodeURIComponent(s); } catch (e) { /* 그대로 */ }
  s = s.trim();
  const m = s.match(/([0-9a-f]{8})(?:-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/i);
  if (!m) return null;
  const key = m[1].toLowerCase();
  return list.find((c) => String(c.id).toLowerCase().startsWith(key)) || null;
}
function photoUrl(p) { return `${SB_URL}/storage/v1/object/public/case-photos/${String(p).split('/').map(encodeURIComponent).join('/')}`; }

module.exports = { SITE, listCases, slugOf, urlOf, pathOf, findBySlug, photoUrl };
