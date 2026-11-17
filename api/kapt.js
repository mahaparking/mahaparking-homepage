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
// Encoding 키(%2B 등)를 넣어도 되도록 한 번 풀어서 씁니다.
const KEY = () => { const k = String(process.env.DATA_GO_KR_KEY || '').trim(); try { return /%[0-9A-F]{2}/i.test(k) ? decodeURIComponent(k) : k; } catch (e) { return k; } };
// 기관이 판 번호를 올리면 이름이 바뀌어서, 새 것부터 차례로 시도합니다.
const LIST_EP = ['AptListService4/getSidoAptList4', 'AptListService3/getSidoAptList3', 'AptListService2/getSidoAptList'];
const INFO_EP = ['AptBasisInfoServiceV5/getAphusBassInfoV5', 'AptBasisInfoServiceV4/getAphusBassInfoV4', 'AptBasisInfoServiceV3/getAphusBassInfoV3', 'AptBasisInfoService1/getAphusBassInfo'];

async function call(eps, params, trace) {
  let last = '', emptyBody = null, notReg = false;
  const tr = (m) => { if (trace) trace.push(m); };
  for (const ep of eps) {
    const q = new URLSearchParams({ serviceKey: KEY(), _type: 'json', ...params });
    let r;
    try { r = await fetch(`${BASE}/${ep}?${q}`, { headers: { Accept: 'application/json' } }); } catch (e) { last = '공공데이터 서버에 연결하지 못했습니다.'; continue; }
    const t = await r.text();
    tr(`${ep.split('/')[0]} → HTTP ${r.status} ${t.replace(/\s+/g, ' ').slice(0, 160)}`);
    if (r.status === 404) { last = `${ep} 없음`; continue; }
    let j = null;
    try { j = JSON.parse(t); } catch (e) { /* XML 오류 응답 */ }
    if (!j) {
      if (/SERVICE_KEY|SERVICE KEY|등록되지 않은|LIMITED_NUMBER|LIMITED NUMBER/i.test(t)) {
        if (/LIMITED/i.test(t)) throw new Error('오늘 쓸 수 있는 공공데이터 호출 횟수를 다 썼습니다. 내일 "이어서 불러오기"를 눌러 주세요.');
        notReg = true; last = `${ep} 인증키 미등록`; continue;
      }
      if (/NO_OPENAPI_SERVICE|NO OPENAPI|NODATA/i.test(t)) { last = `${ep} 응답 없음`; continue; }
      last = `알 수 없는 응답 (${r.status})`; continue;
    }
    // 공공데이터포털 게이트웨이 오류 (JSON 모양): 인증키 미등록 · 폐기된 서비스 · 호출 한도
    const gw = j.OpenAPI_ServiceResponse && j.OpenAPI_ServiceResponse.cmmMsgHeader;
    if (gw) {
      const code = String(gw.returnReasonCode || ''), msg = String(gw.errMsg || '');
      if (code === '12' || /NO_OPENAPI/i.test(msg)) { last = `${ep} 폐기됨`; continue; }
      if (code === '22' || /LIMITED/i.test(msg)) throw new Error('오늘 쓸 수 있는 공공데이터 호출 횟수를 다 썼습니다. 내일 "이어서 불러오기"를 눌러 주세요.');
      if (/^(20|30|31|32|33)$/.test(code) || /SERVICE_KEY|ACCESS_DENIED/i.test(msg)) { notReg = true; last = `${ep} 인증키 미등록`; continue; }   // 다른 판 번호로 신청됐을 수 있어 다음 것도 시도
      last = `${ep}: ${msg || code}`; continue;
    }
    const head = (j.response && j.response.header) || j.header || {};
    if (head.resultCode && !/^0+$/.test(String(head.resultCode))) {
      if (String(head.resultCode) === '22') throw new Error('오늘 쓸 수 있는 공공데이터 호출 횟수를 다 썼습니다. 내일 "이어서 불러오기"를 눌러 주세요.');
      if (/30|31|32|33/.test(String(head.resultCode))) { notReg = true; last = `${ep} 인증키 미등록`; continue; }
      last = head.resultMsg || `오류 ${head.resultCode}`; continue;
    }
    const body = (j.response && j.response.body) || j.body || {};
    if (!items(body).length && ep !== eps[eps.length - 1]) { last = `${ep} 결과 없음`; emptyBody = emptyBody || body; continue; }   // 옛 판 번호가 빈 결과를 줄 때는 다음 것도 시도
    return body;
  }
  if (emptyBody) return emptyBody;
  if (notReg) throw new Error(`공공데이터포털에 이 인증키가 아직 등록되지 않았습니다 (${eps === LIST_EP ? '단지 목록제공 서비스' : '기본 정보제공 서비스'}). data.go.kr → 마이페이지 → 활용신청 현황에서 "승인"인지 확인해 주세요. 승인 직후에는 공공데이터포털 쪽 반영에 몇 시간(길게는 하루) 걸릴 수 있습니다. 아래 [🔎 연결 점검]으로 다시 확인해 보세요.`);
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
      const trace = [];
      let body = await call(LIST_EP, { sidoCode: sido, pageNo: String(page), numOfRows: '1000' }, trace);
      // 강원(51)·전북(52)은 특별자치도가 되며 코드가 바뀌었습니다. 예전 코드로도 한 번 더 찾아봅니다.
      const OLD = { 51: '42', 52: '45' };
      if (!items(body).length && OLD[sido]) body = await call(LIST_EP, { sidoCode: OLD[sido], pageNo: String(page), numOfRows: '1000' }, trace);
      const list = items(body).map((x) => ({
        code: str(x.kaptCode), name: str(x.kaptName),
        sido: str(x.as1), sigungu: str(x.as2), dong: str(x.as3 || x.as4),
      })).filter((x) => x.code);
      return send(res, 200, Object.assign({ list, total: parseInt(body.totalCount, 10) || list.length, page }, list.length ? {} : { trace }));
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

    if (b.action === 'check') {
      const out = {};
      for (const [name, eps, params] of [['list', LIST_EP, { sidoCode: '11', pageNo: '1', numOfRows: '1' }], ['info', INFO_EP, { kaptCode: 'A10027875' }]]) {
        const trace = [];
        try { const body = await call(eps, params, trace); out[name] = { ok: true, n: items(body).length, trace }; } catch (e) { out[name] = { ok: false, error: e.message, trace }; }
      }
      return send(res, 200, out);
    }

    return send(res, 400, { error: 'action 은 list · info · check 입니다.' });
  } catch (e) {
    return send(res, 502, { error: e.message || '공공데이터를 불러오지 못했습니다.' });
  }
};
