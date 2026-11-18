/**
 * 건물 하나씩 찾기 (아파트·빌라·상가·오피스텔·학교·공영주차장 등 모든 장소)
 * 주소: POST /api/place  { q: '안양 OO빌딩', page: 1 }
 *   → { list: [{ id, name, category, address, jibun, phone, x, y, url }], total, end }
 *
 * 카카오 로컬(키워드로 장소 검색) API를 씁니다.
 * Vercel 환경변수: KAKAO_REST_KEY (developers.kakao.com → 내 애플리케이션 → 앱 키 → REST API 키)
 *   ※ 앱 설정 → 제품 설정에서 "카카오맵"을 켜 두어야 합니다.
 * 관리자로 로그인한 사람만 쓸 수 있습니다.
 */
const { readBody, send, guard } = require('./_auth');

module.exports = async (req, res) => {
  if (!(await guard(req, res))) return;
  const key = String(process.env.KAKAO_REST_KEY || '').trim();
  if (!key) return send(res, 500, { error: 'Vercel 환경변수 KAKAO_REST_KEY(카카오 REST API 키)가 아직 없습니다.', setup: true });
  let b;
  try { b = await readBody(req); } catch (e) { return send(res, 400, { error: '요청 형식이 잘못됐습니다.' }); }
  const q = String(b.q || '').trim().slice(0, 80);
  if (q.length < 2) return send(res, 400, { error: '찾을 이름을 두 글자 이상 적어 주세요.' });
  const page = Math.min(45, Math.max(1, parseInt(b.page, 10) || 1));
  try {
    const u = `https://dapi.kakao.com/v2/local/search/keyword.json?${new URLSearchParams({ query: q, page: String(page), size: '15' })}`;
    const r = await fetch(u, { headers: { Authorization: `KakaoAK ${key}` } });
    const t = await r.text();
    let j = {}; try { j = JSON.parse(t); } catch (e) { /* */ }
    if (r.status === 401 || r.status === 403) {
      const m = String(j.message || j.msg || t).slice(0, 200);
      return send(res, 502, { error: /disabled|OPEN_MAP_AND_LOCAL|카카오맵/i.test(m) ? '카카오 앱 설정에서 "카카오맵" 사용이 꺼져 있습니다. developers.kakao.com → 내 애플리케이션 → 제품 설정 → 카카오맵을 켜 주세요.' : `카카오 REST API 키가 맞지 않습니다. (${m})` });
    }
    if (!r.ok) return send(res, 502, { error: `카카오 장소 검색 오류 (${r.status})` });
    const list = (j.documents || []).map((d) => ({
      id: d.id, name: d.place_name, category: d.category_name || '', phone: d.phone || '',
      address: d.road_address_name || d.address_name || '', jibun: d.address_name || '', x: d.x, y: d.y, url: d.place_url || '',
    }));
    const meta = j.meta || {};
    return send(res, 200, { list, total: meta.pageable_count || list.length, end: !!meta.is_end, page });
  } catch (e) {
    return send(res, 502, { error: '카카오 장소 검색에 연결하지 못했습니다.' });
  }
};
