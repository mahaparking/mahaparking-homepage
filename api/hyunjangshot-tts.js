/**
 * 현장샷 내레이션 음성 만들기 (Vercel 서버 함수)
 * 주소: POST /api/hyunjangshot-tts   { lines: ['문장', ...], voice: 'Charon' }
 * 돌려줌: { clips: ['base64 mp3', ...] }
 *
 * - 구글 클라우드 Text-to-Speech (Chirp 3: HD 한국어 남성 목소리)를 씁니다.
 *   매달 100만 글자까지 무료 → 쇼츠 1편(약 200자) 기준 한 달 수천 편까지 무료 범위.
 * - 키는 Vercel 환경변수 GOOGLE_TTS_API_KEY 에만 둡니다.
 * - 관리자로 로그인한 사람만 쓸 수 있습니다.
 */
const { readBody, send, guard } = require('./_auth');

// 고를 수 있는 남성 목소리 (구글 Chirp 3: HD 한국어 남성 목소리 중 일부)
const VOICES = ['Charon', 'Fenrir', 'Orus', 'Puck', 'Algenib', 'Iapetus'];
const MAX_LINES = 16;
const MAX_CHARS = 120; // 한 문장 최대 글자 수

module.exports = async (req, res) => {
  if (!process.env.GOOGLE_TTS_API_KEY) return send(res, 500, { error: 'Vercel 환경변수 GOOGLE_TTS_API_KEY 가 아직 없습니다.' });
  if (!(await guard(req, res))) return;

  let body;
  try { body = await readBody(req); } catch (e) { return send(res, 400, { error: '요청 형식이 잘못됐습니다.' }); }
  const voice = VOICES.includes(body.voice) ? body.voice : VOICES[0];
  const rate = Math.min(1.3, Math.max(0.8, Number(body.rate) || 1.05));
  const lines = (body.lines || []).slice(0, MAX_LINES).map((s) => String(s || '').replace(/[*#]/g, '').trim().slice(0, MAX_CHARS));
  if (!lines.length) return send(res, 400, { error: '읽을 문장이 없습니다.' });

  const one = async (text) => {
    if (!text) return null;
    const r = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(process.env.GOOGLE_TTS_API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: 'ko-KR', name: `ko-KR-Chirp3-HD-${voice}` },
        audioConfig: { audioEncoding: 'MP3', speakingRate: rate, sampleRateHertz: 44100 },
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || `음성 오류 (${r.status})`);
    return j.audioContent;
  };

  try {
    const clips = await Promise.all(lines.map(one));
    return send(res, 200, { clips, voice });
  } catch (e) {
    return send(res, 502, { error: e.message });
  }
};
