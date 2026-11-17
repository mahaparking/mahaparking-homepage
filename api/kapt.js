/**
 * 공동주택(아파트) 단지 목록 · 관리사무소 연락처 불러오기 (Vercel 서버 함수)
 * 주소: POST /api/kapt
 *   { action: 'list', sido: '11', page: 1 }      → 그 시·도의 단지 목록 한 쪽 (최대 1000개)
 *   { action: 'info', codes: ['A1...', ...] }    → 단지별 관리사무소 전화·팩스·주소·세대수 (한 번에 최대 40곳)
 *
 * 국토교통부 공공데이터(공공데이터포털 data.go.kr)를 씁니다.
 *   - 공동주택 단지 목록제공 서비스
 *   - 공동주택 기본 정보제공 서비스
 * Vercel 환경변수: DATA_GO_KR_KEY (공공데이터포털 → 마이페이지 → 일반 인증키, Decoding 키)
 * 관리자로 로그인한 사람만 쓸 수 있습니다.
 */
const { readBody, send, guard } = require('./_auth');

const BASE = 'https://apis.data.go.kr/1613000';
// 기관이 판 번호를 올리면 이름이 바뀌어서, 새 것부터 차례로 시도합니다.
const LIST_EP = ['AptListService3/getSidoAptList3', 'AptListService2/getSidoAptList'];
const INFO_EP = ['AptBasisInfoServiceV4/getAphusBassInfoV4', 'AptBasisInfoServiceV3/getAphusBassInfoV3', 'AptBasisInfoService1/getAphusBassInfo'];

async function call(eps, params) {
  let last = '';
  for (const ep of eps) {
    const q = new URLSearchParams({ serviceKey: process.env.DATA_GO_KR_KEY, _type: 'json', ...params });
    let r;
    try { r = await fetch(`${BASE}/${ep}?${q}`, { headers: { Accept: 'application/json' } }); } catch (e) { last = '공공데이터 서버에 연결하지 못했습니다.'; continue; }
    const t = await r.text();
    if (r.status === 404) { last = `${ep} 없음`; continue; }
    let j = null;
    try { j = JSON.parse(t); } catch (e) { /* XML 오류 응답 */ }
    if (!j) {
      if (/SERVICE_KEY|SERVICE KEY|등록되지 않은|LIMITED_NUMBER|LIMITED NUMBER/i.test(t)) {
        if (/LIMITED/i.test(t)) throw new Error('오늘 쓸 수 있는 공공데이터 호출 횟수를 다 썼습니다. 내일 "이어서 불러오기"를 눌러 주세요.');
        throw new Error('공공데이터 인증키가 맞지 않거나, 이 서비스 활용신청이 아직 승인되지 않았습니다.');
      }
      if (/NO_OPENAPI_SERVICE|NO OPENAPI|NODATA/i.test(t)) { last = `${ep} 응답 없음`; continue; }
      last = `알 수 없는 응답 (${r.status})`; continue;
    }
    const head = (j.response && j.response.header) || j.header || {};
    if (head.resultCode && !/^0+$/.test(String(head.resultCode))) {
      if (String(head.resultCode) === '22') throw new Error('오늘 쓸 수 있는 공공데이터 호출 횟수를 다 썼습니다. 내일 "이어서 불러오기"를 눌러 주세요.');
      if (/30|31|32|33/.test(String(head.resultCode))) throw new Error('공공데이터 인증키가 맞지 않거나, 이 서비스 활용신청이 아직 승인되지 않았습니다.');
      last = head.resultMsg || `오류 ${head.resultCode}`; continue;
    }
    return (j.response && j.response.body) || j.body || {};
  }
  throw new Error(last || '공공데이터를 불러오지 못했습니다.');
}

const items = (body) => {
  let it = body.items;
  if (it && it.item !== undefined) it = it.item;
  if (!it) return [];
  return Array.isArray(it) ? it : [it];
};
const str = (v) => (v === undefined || v === null ? '' : String(v).trim());

module.exports = async (req, res) => {
  if (!(await guard(req, res))) return;
  if (!process.env.DATA_GO_KR_KEY) return send(res, 500, { error: 'Vercel 환경변수 DATA_GO_KR_KEY(공공데이터포털 인증키)가 아직 없습니다.' });
  let b;
  try { b = await readBody(req); } catch (e) { return send(res, 400, { error: '요청 형식이 잘못됐습니다.' }); }

  try {
    if (b.action === 'list') {
      const sido = String(b.sido || '').replace(/\D/g, '');
      if (!/^\d{2}$/.test(sido)) return send(res, 400, { error: '시·도 코드가 잘못됐습니다.' });
      const page = Math.max(1, parseInt(b.page, 10) || 1);
      const body = await call(LIST_EP, { sidoCode: sido, pageNo: String(page), numOfRows: '1000' });
      const list = items(body).map((x) => ({
        code: str(x.kaptCode), name: str(x.kaptName),
        sido: str(x.as1), sigungu: str(x.as2), dong: str(x.as3 || x.as4),
      })).filter((x) => x.code);
      return send(res, 200, { list, total: parseInt(body.totalCount, 10) || list.length, page });
    }

    if (b.action === 'info') {
      const codes = (b.codes || []).map(str).filter((c) => /^[A-Z0-9]{6,12}$/i.test(c)).slice(0, 40);
      const out = [];
      let i = 0;
      const worker = async () => {
        while (i < codes.length) {
          const code = codes[i++];
          try {
            const body = await call(INFO_EP, { kaptCode: code });
            const x = items(body)[0] || body.item || {};
            out.push({
              code, ok: true,
              name: str(x.kaptName), tel: str(x.kaptTel), fax: str(x.kaptFax), url: str(x.kaptUrl),
              addr: str(x.kaptAddr), doro: str(x.doroJuso), zip: str(x.zipcode),
              households: parseInt(x.kaptdaCnt || x.hoCnt, 10) || null, dongs: parseInt(x.kaptDongCnt, 10) || null,
              mgr: str(x.codeMgrNm || x.codeMgr), usedate: str(x.kaptUsedate),
            });
          } catch (e) {
            if (/호출 횟수|인증키/.test(e.message)) throw e;
            out.push({ code, ok: false, error: e.message });
          }
        }
      };
      await Promise.all([1, 2, 3, 4, 5, 6].map(worker));
      return send(res, 200, { info: out });
    }

    return send(res, 400, { error: 'action 은 list 또는 info 입니다.' });
  } catch (e) {
    return send(res, 502, { error: e.message || '공공데이터를 불러오지 못했습니다.' });
  }
};
