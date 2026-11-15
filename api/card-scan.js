/**
 * 명함 인식 (Vercel 서버 함수)
 * 주소: POST /api/card-scan   본문: { b64: "명함 사진 jpg base64" }
 *
 * - 관리자로 로그인한 사람만 쓸 수 있습니다.
 * - 현장샷과 같은 ANTHROPIC_API_KEY 를 사용합니다. (새로 넣을 키 없음)
 * - 명함에 적힌 글자만 옮깁니다. 없는 내용은 빈칸으로 둡니다.
 */
const { readBody, send, guard } = require('./_auth');
const MODEL = process.env.CARD_SCAN_MODEL || process.env.HYUNJANGSHOT_MODEL || 'claude-sonnet-5-5';

const TOOL = {
  name: 'card',
  description: '명함에서 읽은 정보를 전달합니다.',
  input_schema: {
    type: 'object',
    required: ['name', 'title', 'mobile', 'office_tel', 'office_fax', 'email', 'org', 'address'],
    properties: {
      name: { type: 'string', description: '사람 이름' },
      title: { type: 'string', description: '직함 (예: 관리소장, 관리과장, 관리인, 대표)' },
      mobile: { type: 'string', description: '휴대폰 번호 (010 등). 숫자와 - 만' },
      office_tel: { type: 'string', description: '사무실·관리사무소 전화 (휴대폰이 아닌 번호)' },
      office_fax: { type: 'string', description: '팩스 번호' },
      email: { type: 'string' },
      org: { type: 'string', description: '근무하는 아파트·건물·빌라 이름 (예: 호계한마음아파트1단지, OO빌딩). 위탁관리회사 이름이 아니라 현장 이름 우선' },
      mgmt_company: { type: 'string', description: '위탁관리회사 이름 (있으면)' },
      address: { type: 'string' },
    },
  },
};

module.exports = async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return send(res, 500, { error: 'Vercel 환경변수 ANTHROPIC_API_KEY 가 아직 없습니다.' });
  if (!(await guard(req, res))) return;
  let body;
  try { body = await readBody(req); } catch (e) { return send(res, 400, { error: '요청 형식이 잘못됐습니다.' }); }
  const b64 = String(body.b64 || '').replace(/^data:image\/\w+;base64,/, '');
  if (!b64) return send(res, 400, { error: '명함 사진이 없습니다.' });
  if (b64.length > 6000000) return send(res, 400, { error: '사진이 너무 큽니다.' });

  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        system: '한국어 명함 사진에서 글자를 정확히 옮겨 적습니다. 반드시 card 도구를 한 번 호출해서 전달합니다. 명함에 없는 정보는 지어내지 말고 빈 문자열로 둡니다. 전화번호는 숫자와 하이픈만 씁니다.',
        tools: [TOOL],
        tool_choice: { type: 'auto' },  // 일부 모델은 특정 도구 강제를 지원하지 않음
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
          { type: 'text', text: '이 명함을 읽어 card 도구로 전달해 주세요.' },
        ] }],
      }),
    });
  } catch (e) {
    return send(res, 502, { error: 'AI 서버에 연결하지 못했습니다.' });
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return send(res, 502, { error: (data.error && data.error.message) || `AI 오류 (${r.status})` });
  const use = (data.content || []).find((c) => c.type === 'tool_use');
  if (use) return send(res, 200, { card: use.input });
  // 도구를 부르지 않고 글로 답한 경우: 글 속 JSON 꺼내기
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return send(res, 200, { card: JSON.parse(m[0]) }); } catch (e) { /* 아래로 */ } }
  return send(res, 502, { error: '명함을 읽지 못했습니다. 밝은 곳에서 다시 찍어 주세요.' });
};
