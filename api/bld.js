/* 건축물대장 표제부 (국토교통부 건축HUB 건축물대장정보 서비스) — 관리자 "🏘 빌라·소규모 공동주택 명단"
 *  POST { sigunguCd: '41173', bjdongCd: '10300', pageNo: 1 }
 *  → 그 법정동의 표제부 중 공동주택(아파트 · 연립 · 다세대 · 도시형생활주택 등)만 골라 돌려줍니다.
 *  인증키: Vercel 환경변수 DATA_GO_KR_KEY (아파트 명단과 같은 키 — data.go.kr 에서 이 서비스 "활용신청"만 하면 됨)
 */
const { readBody, send, guard } = require('./_auth');

const EP = 'https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo';
const KEY = () => { const k = String(process.env.DATA_GO_KR_KEY || '').trim(); try { return /%[0-9A-F]{2}/i.test(k) ? decodeURIComponent(k) : k; } catch (e) { return k; } };
const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
const num = (v) => { const n = parseInt(str(v).replace(/[^\d-]/g, ''), 10); return isFinite(n) ? n : 0; };
const HOUSE = /아파트|연립|다세대|공동주택|도시형|기숙사/;

module.exports = async (req, res) => {
  if (!(await guard(req, res))) return;
  if (!process.env.DATA_GO_KR_KEY) return send(res, 500, { error: 'Vercel 환경변수 DATA_GO_KR_KEY(공공데이터포털 인증키)가 아직 없습니다.', setup: true });
  let b; try { b = await readBody(req); } catch (e) { return send(res, 400, { error: '요청을 읽지 못했습니다.' }); }
  const sigunguCd = str(b.sigunguCd), bjdongCd = str(b.bjdongCd), pageNo = Math.max(1, parseInt(b.pageNo, 10) || 1);
  if (!/^\d{5}$/.test(sigunguCd) || !/^\d{5}$/.test(bjdongCd)) return send(res, 400, { error: '시군구·법정동 코드가 올바르지 않습니다.' });
  const q = new URLSearchParams({ serviceKey: KEY(), _type: 'json', sigunguCd, bjdongCd, numOfRows: '100', pageNo: String(pageNo) });
  let r, t;
  try { r = await fetch(`${EP}?${q}`, { headers: { Accept: 'application/json' } }); t = await r.text(); }
  catch (e) { return send(res, 502, { error: '공공데이터 서버에 연결하지 못했습니다. 잠시 뒤 다시 해 주세요.' }); }
  let j = null; try { j = JSON.parse(t); } catch (e) { /* XML 오류 응답 */ }
  const flat = t.replace(/\s+/g, ' ').slice(0, 300);
  const gw = j && j.OpenAPI_ServiceResponse && j.OpenAPI_ServiceResponse.cmmMsgHeader;
  const code = gw ? str(gw.returnReasonCode) : j && j.response && j.response.header ? str(j.response.header.resultCode) : '';
  const msg = gw ? str(gw.errMsg) : j && j.response && j.response.header ? str(j.response.header.resultMsg) : flat;
  if (/LIMITED/i.test(msg) || code === '22') return send(res, 429, { error: '오늘 쓸 수 있는 건축물대장 호출 횟수를 다 썼습니다. 자정이 지나면 다시 채워지니 내일 "이어서 받기"를 눌러 주세요.', quota: true });
  if (/SERVICE_KEY|SERVICE KEY|ACCESS_DENIED|등록되지 않은/i.test(msg) || /^(20|30|31|32|33)$/.test(code)) {
    return send(res, 403, { error: '공공데이터포털에서 「국토교통부_건축HUB_건축물대장정보 서비스」 활용신청이 아직 안 되어 있습니다. data.go.kr 에서 활용신청 후 1~2시간 뒤에 다시 해 주세요.', setup: true });
  }
  if (!j || !j.response) return send(res, 502, { error: `건축물대장 응답을 읽지 못했습니다 (${r.status}).`, trace: flat });
  if (code && !/^0+$/.test(code)) return send(res, 502, { error: `건축물대장 오류: ${msg || code}` });
  const body = j.response.body || {};
  let it = body.items && body.items.item !== undefined ? body.items.item : body.items;
  it = !it ? [] : Array.isArray(it) ? it : [it];
  const list = it.filter((x) => HOUSE.test(`${str(x.mainPurpsCdNm)} ${str(x.etcPurps)}`)).map((x) => ({
    pk: str(x.mgmBldrgstPk), name: str(x.bldNm), dong: str(x.dongNm), plat: str(x.platPlc), doro: str(x.newPlatPlc),
    bun: str(x.bun), ji: str(x.ji), main: str(x.mainPurpsCdNm), etc: str(x.etcPurps), kind: str(x.regstrKindCdNm),
    hh: num(x.hhldCnt), ho: num(x.hoCnt), fm: num(x.fmlyCnt), flr: num(x.grndFlrCnt), bflr: num(x.ugrndFlrCnt),
    pin: num(x.indrMechUtcnt), pia: num(x.indrAutoUtcnt), pom: num(x.oudrMechUtcnt), poa: num(x.oudrAutoUtcnt),
    elv: num(x.rideUseElvtCnt), use: str(x.useAprDay), area: Math.round(parseFloat(str(x.totArea)) || 0),
  }));
  send(res, 200, { list, total: num(body.totalCount), scanned: it.length, pageNo });
};
