/**
 * 홍보 문자 보내기 (Vercel 서버 함수, 솔라피 사용)
 * 주소: POST /api/promo-send
 * 본문: { promo_id, manager_ids: [..], text, test: true|false, test_to(테스트 받을 번호, 없으면 설정값) }
 *
 * 법을 지키기 위해 서버에서 한 번 더 확인합니다.
 *  - 수신 동의한 분만, 수신거부한 분은 빼고 보냅니다.
 *  - 맨 앞에 "(광고)회사명 대표번호", 맨 끝에 수신거부 방법을 자동으로 붙입니다.
 *  - 밤 9시 ~ 아침 8시(한국 시간)에는 보내지 않습니다. (나에게 테스트는 가능)
 *
 * Vercel 환경변수: SOLAPI_API_KEY, SOLAPI_API_SECRET  (솔라피 콘솔 → API Key 관리)
 * 발신번호는 관리자 화면 → 영업·홍보 → 설정 에서 정합니다 (솔라피에 미리 등록된 번호).
 */
const crypto = require('crypto');
const { readBody, send, guard } = require('./_auth');
const { sbRest, buildMessage, digits, kstHour, smsBytes, SB_URL } = require('./_sales');

const SOLAPI = 'https://api.solapi.com';

function solapiAuth() {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString('hex');
  const signature = crypto.createHmac('sha256', process.env.SOLAPI_API_SECRET).update(date + salt).digest('hex');
  return `HMAC-SHA256 apiKey=${process.env.SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`;
}

async function solapi(path, body) {
  const r = await fetch(SOLAPI + path, {
    method: 'POST',
    headers: { Authorization: solapiAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.errorMessage || j.message || `솔라피 오류 (${r.status})`);
  return j;
}

module.exports = async (req, res) => {
  if (!(await guard(req, res))) return;
  if (!process.env.SOLAPI_API_KEY || !process.env.SOLAPI_API_SECRET) {
    return send(res, 500, { error: '문자 발송 설정이 아직 없습니다. Vercel 환경변수에 SOLAPI_API_KEY, SOLAPI_API_SECRET 을 넣어 주세요. 그 전에는 "폰 문자앱으로 보내기"를 쓰시면 됩니다.' });
  }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  let body;
  try { body = await readBody(req); } catch (e) { return send(res, 400, { error: '요청 형식이 잘못됐습니다.' }); }
  const test = !!body.test;
  const userText = String(body.text || '').trim();
  if (!userText) return send(res, 400, { error: '보낼 문구를 적어 주세요.' });

  try {
    // 설정
    const rows = await sbRest(token, 'sales_settings?select=key,value');
    const S = {}; rows.forEach((x) => { S[x.key] = x.value || ''; });
    const from = digits(S.sender);
    if (!from) return send(res, 400, { error: '설정에서 발신번호를 먼저 넣어 주세요.' });

    // 홍보물
    let promo = null;
    if (body.promo_id) {
      const p = await sbRest(token, `promos?id=eq.${encodeURIComponent(body.promo_id)}&select=*`);
      promo = p[0] || null;
      if (!promo) return send(res, 400, { error: '홍보물을 찾지 못했습니다.' });
    }

    // 받는 사람
    let targets = [];
    let skipped = 0;
    if (test) {
      const to = digits(body.test_to) || digits(S.test_to);
      if (!/^01\d{8,9}$/.test(to)) return send(res, 400, { error: '설정에서 "테스트 받을 번호"(휴대폰)를 먼저 넣어 주세요.' });
      targets = [{ manager_id: null, name: '테스트(나)', phone: to }];
    } else {
      const ids = (body.manager_ids || []).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
      if (!ids.length) return send(res, 400, { error: '받는 분을 골라 주세요.' });
      if (ids.length > 3000) return send(res, 400, { error: '한 번에 3,000명까지 보낼 수 있습니다.' });
      const h = kstHour();
      if (h >= 21 || h < 8) return send(res, 400, { error: '밤 9시부터 아침 8시까지는 광고 문자를 보낼 수 없습니다. 아침 8시 이후에 보내 주세요.' });
      const list = [];
      for (let i = 0; i < ids.length; i += 150) {
        const part = ids.slice(i, i + 150);
        list.push(...(await sbRest(token, `managers?id=in.(${part.join(',')})&select=id,name,mobile,consent,opt_out`)));
      }
      const seen = new Set();
      list.forEach((m) => {
        const ph = digits(m.mobile);
        if (!m.consent || m.opt_out || !/^01\d{8,9}$/.test(ph) || seen.has(ph)) { skipped += 1; return; }
        seen.add(ph);
        targets.push({ manager_id: m.id, name: m.name, phone: ph });
      });
      skipped += ids.length - list.length;
      if (!targets.length) return send(res, 400, { error: '보낼 수 있는 분이 없습니다. (수신 동의한 분만 보낼 수 있습니다)' });
    }

    const text = buildMessage(S, userText, promo);

    // 이미지가 있으면 MMS (솔라피에 이미지 먼저 올리기)
    let imageId = null;
    if (promo && promo.kind === 'image' && promo.mms_path) {
      const img = await fetch(`${SB_URL}/storage/v1/object/public/promos/${promo.mms_path.split('/').map(encodeURIComponent).join('/')}`);
      if (!img.ok) throw new Error('홍보 이미지를 불러오지 못했습니다.');
      const buf = Buffer.from(await img.arrayBuffer());
      if (buf.length > 200 * 1024) throw new Error('문자용 이미지가 200KB를 넘습니다. 홍보물을 다시 올려 주세요.');
      const up = await solapi('/storage/v1/files', { file: buf.toString('base64'), name: 'promo.jpg', type: 'MMS' });
      imageId = up.fileId;
    }

    const subject = `${S.company || '마하파킹'} 안내`;
    const failed = new Map();
    for (let i = 0; i < targets.length; i += 1000) {
      const msgs = targets.slice(i, i + 1000).map((t) => {
        const m = { to: t.phone, from, text };
        if (imageId) { m.imageId = imageId; m.subject = subject; }
        else if (smsBytes(text) > 90) m.subject = subject;
        return m;
      });
      try {
        const r = await solapi('/messages/v4/send-many/detail', { messages: msgs });
        (r.failedMessageList || []).forEach((f) => failed.set(digits(f.to), f.statusMessage || f.statusCode || '실패'));
      } catch (e) {
        msgs.forEach((m) => failed.set(m.to, e.message));
      }
    }

    const recipients = targets.map((t) => ({ ...t, ok: !failed.has(t.phone), error: failed.get(t.phone) || null }));
    const ok = recipients.filter((x) => x.ok).length;
    const channel = imageId ? 'mms' : smsBytes(text) > 90 ? 'lms' : 'sms';
    await sbRest(token, 'promo_sends', 'POST', {
      promo_id: promo ? promo.id : null, promo_title: promo ? promo.title : null, channel, text,
      recipients, total: recipients.length, ok, fail: recipients.length - ok, is_test: test,
    }).catch(() => {});

    return send(res, 200, { total: recipients.length, ok, fail: recipients.length - ok, skipped, channel, failed: recipients.filter((x) => !x.ok).slice(0, 20) });
  } catch (e) {
    return send(res, 502, { error: e.message || '보내지 못했습니다.' });
  }
};
