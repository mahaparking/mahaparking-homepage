/**
 * 현장샷 AI 글쓰기 (Vercel 서버 함수)
 * 주소: POST /api/hyunjangshot
 *
 * - 관리자로 로그인한 사람만 쓸 수 있습니다 (Supabase 로그인 토큰 확인).
 * - Claude API 키는 Vercel 환경변수 ANTHROPIC_API_KEY 에만 둡니다. 코드·홈페이지에는 절대 넣지 않습니다.
 * - 사진과 작업 메모를 받아 쇼츠 자막과 블로그 글 재료를 JSON 으로 돌려줍니다.
 */

const { readBody, send, guard } = require('./_auth');
const MODEL = process.env.HYUNJANGSHOT_MODEL || 'claude-sonnet-5-5';
const MAX_PHOTOS = 12;

const STAGE = { before: '작업 전', during: '작업 중', after: '작업 후' };

const SYSTEM = `당신은 주차장비 유지보수·업싸이클링 업체 "마하파킹"의 홍보 담당입니다.
대표님이 현장에서 찍은 사진과 짧은 작업 메모를 받아, 쇼츠 자막과 네이버 블로그 시공사례 글의 재료를 씁니다.

[가장 중요한 규칙]
- 사진과 메모에 있는 사실만 씁니다. 가격, 시간, 치수, 수량, 장비 모델명처럼 메모에 없는 숫자나 사실은 절대 지어내지 않습니다.
- 사진만으로 확실하지 않은 내용(예: 부품을 교체했는지 재사용했는지)은 단정하지 말고 checks 목록에 "확인 필요" 질문으로 남깁니다.
- 고객 이름, 아파트·건물 이름, 차량 번호는 쓰지 않습니다. 지역은 "구·동" 수준까지만 씁니다.
- 과장 표현(최고, 완벽, 국내 유일 등)을 쓰지 않습니다.

[쇼츠]
- headline_small: 지역 + 현장 종류 (예: "서울 독산동 빌라"), 12자 이내
- headline_big: 작업 이름 (예: "주차차단바 교체"), 띄어쓰기 포함 9자 이내
- scenes: 사진 한 장당 자막 하나, 사진 순서 그대로. 자막은 두 줄(줄바꿈 \\n 한 번), 한 줄은 띄어쓰기 포함 11자 이내.
  각 자막에서 가장 중요한 말 하나를 *별표*로 감쌉니다 (예: "배달 오토바이에 걸려\\n차단바가 *파손*됐습니다").
  흐름: 문제 → 확인·점검 → 작업 → 결과. 마지막 장면은 마무리 느낌으로. 말투는 짧고 힘 있게.
  narration: 그 장면에서 남성 성우가 읽을 내레이션 한 문장. 자막과 같은 뜻을 자연스러운 말로, 띄어쓰기 포함 14~30자, 존댓말("~습니다", "~했죠").
  내레이션에는 별표·괄호·기호를 쓰지 않고, 숫자·영문 약어는 읽는 소리대로 한글로 씁니다 (LED → 엘이디, 3m → 삼 미터).

[블로그] 마하파킹 블로그 고정 구성의 재료만 씁니다. (회사 소개·약속·문의 안내는 프로그램이 자동으로 붙이므로 쓰지 않습니다)
- title: 고객 상황을 묻는 의문문 제목 (예: "배달 중 오토바이에 주차차단바가 부러졌다면, 어떻게 해야 할까요?")
- intro: 2~3개 문단. 첫 문단은 "이번에는 [지역] [현장 종류]에서 진행한 [작업] 사례를 소개합니다." 형식, 이어서 핵심 해결 포인트.
- sections: 3~4개. heading 은 번호 없이 의문문. 흐름: 고객 연락·상황 공감 → 현장·사진 확인 → 판단과 작업 → 결과·추가로 해 드린 것.
  paragraphs 는 한두 문장짜리 짧은 문단 여러 개(모바일에서 읽기 쉽게), 길게 서술형으로. 존댓말("~습니다"), 고객은 "고객님".
  photos 에는 그 소제목 아래 들어갈 사진 번호와 짧은 사진 설명을 넣습니다. 모든 사진이 한 번씩은 쓰이게 합니다.
  tip: 고객에게 도움이 되는 팁 한 문장 (예: 견적 문의 때 어떤 사진을 보내면 좋은지). 필요 없으면 빈 문자열.
- closing_hook: "[지역] [작업]이나 [관련 작업]이 필요하시면 마하파킹으로 문의해 주세요." 형식 한 문장.
- keywords_main: 메인 키워드 2~3개 (지역+장비+작업, 예: "독산동 주차차단바 교체"). 본문 전체에 각각 3번 이상 자연스럽게 들어가게 씁니다.
- keywords_ext: 확장 키워드 2~3개
- hashtags: 10개 내외, # 없이 단어만, 띄어쓰기 없이.`;

const TOOL = {
  name: 'deliver',
  description: '쇼츠 자막과 블로그 글 재료를 전달합니다.',
  input_schema: {
    type: 'object',
    required: ['shorts', 'blog', 'checks'],
    properties: {
      shorts: {
        type: 'object',
        required: ['headline_small', 'headline_big', 'scenes'],
        properties: {
          headline_small: { type: 'string' },
          headline_big: { type: 'string' },
          scenes: {
            type: 'array',
            items: { type: 'object', required: ['photo', 'subtitle', 'narration'], properties: { photo: { type: 'integer' }, subtitle: { type: 'string' }, narration: { type: 'string' } } },
          },
        },
      },
      blog: {
        type: 'object',
        required: ['title', 'intro', 'sections', 'closing_hook', 'keywords_main', 'keywords_ext', 'hashtags'],
        properties: {
          title: { type: 'string' },
          intro: { type: 'array', items: { type: 'string' } },
          sections: {
            type: 'array',
            items: {
              type: 'object',
              required: ['heading', 'paragraphs', 'photos'],
              properties: {
                heading: { type: 'string' },
                paragraphs: { type: 'array', items: { type: 'string' } },
                photos: { type: 'array', items: { type: 'object', required: ['photo', 'caption'], properties: { photo: { type: 'integer' }, caption: { type: 'string' } } } },
                tip: { type: 'string' },
              },
            },
          },
          closing_hook: { type: 'string' },
          keywords_main: { type: 'array', items: { type: 'string' } },
          keywords_ext: { type: 'array', items: { type: 'string' } },
          hashtags: { type: 'array', items: { type: 'string' } },
        },
      },
      checks: { type: 'array', items: { type: 'string' }, description: '대표님이 확인해야 할 점 (없으면 빈 배열)' },
    },
  },
};

module.exports = async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return send(res, 500, { error: 'Vercel 환경변수 ANTHROPIC_API_KEY 가 아직 없습니다.' });
  if (!(await guard(req, res))) return;

  let body;
  try { body = await readBody(req); } catch (e) { return send(res, 400, { error: '요청 형식이 잘못됐습니다.' }); }
  const info = body.info || {};
  const photos = (body.photos || []).slice(0, MAX_PHOTOS);
  if (!photos.length) return send(res, 400, { error: '사진이 없습니다.' });

  const content = [];
  photos.forEach((p, i) => {
    content.push({ type: 'text', text: `사진 ${i + 1} (${STAGE[p.stage] || p.stage || ''})` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: String(p.b64 || '').replace(/^data:image\/\w+;base64,/, '') } });
  });
  content.push({
    type: 'text',
    text: [
      '[작업 정보]',
      `지역: ${info.region || '(없음)'}`,
      `현장 종류: ${info.site_type || '(없음)'}`,
      `작업 종류: ${info.work_type || '(없음)'}`,
      `상담 방식: ${info.consult || '(없음)'}`,
      `재방문 고객: ${info.revisit ? '예 (글 첫머리를 "지난번에 작업해 드렸던 고객님께서 다시 연락을 주셨습니다" 흐름으로)' : '아니오'}`,
      `작업 메모: ${info.memo || '(없음)'}`,
      '',
      '위 사진과 메모로 deliver 도구를 호출해 주세요.',
    ].join('\n'),
  });

  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'deliver' },
        messages: [{ role: 'user', content }],
      }),
    });
  } catch (e) {
    return send(res, 502, { error: 'AI 서버에 연결하지 못했습니다.' });
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (data && data.error && data.error.message) || `AI 오류 (${r.status})`;
    return send(res, 502, { error: msg });
  }
  const use = (data.content || []).find((c) => c.type === 'tool_use');
  if (!use) return send(res, 502, { error: 'AI 응답을 읽지 못했습니다. 다시 시도해 주세요.' });
  return send(res, 200, { result: use.input, usage: data.usage || null });
};
