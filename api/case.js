/**
 * 시공사례 페이지 (구글·네이버 검색에 사례마다 따로 나오게)
 *   /cases          → 시공사례 목록   (vercel.json 에서 /api/case 로 연결)
 *   /cases/<주소>   → 사례 1건 페이지 (vercel.json 에서 /api/case?slug=<주소> 로 연결)
 * 내용은 관리자 화면 "시공사례"에서 공개로 올린 글을 그대로 씁니다. 따로 할 일은 없습니다.
 */
const { SITE, listCases, slugOf, urlOf, pathOf, findBySlug, photoUrl } = require('./_cases');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const dot = (d) => String(d || '').slice(0, 10).replace(/-/g, '.');
const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

function page({ title, desc, canonical, image, body, jsonld, status }) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${status === 404 ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(canonical)}">`}
<meta property="og:type" content="article">
<meta property="og:site_name" content="마하파킹">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(image || SITE + '/assets/og-image.jpg?v=3')}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="/assets/icon-square.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Gothic+A1:wght@500;700;800;900&family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
<style>
  .crumb{font-size:14px;color:#AFC0D0;margin-bottom:6px}.crumb a{color:#C5D3E0;text-decoration:none}.crumb a:hover{color:var(--signal)}
  .cd{max-width:860px;margin:0 auto;padding:28px 20px 70px;display:grid;gap:22px}
  .cd-photos{display:grid;gap:12px}
  .cd-photos img{width:100%;border-radius:14px;display:block;background:#D3DDE7}
  .cd-text{padding:24px;display:grid;gap:12px}
  .cd-text p{margin:0;white-space:pre-line;font-size:16.5px}
  .cd-result{border-top:1px dashed var(--line);padding-top:12px;font-weight:700}
  .cd-cta{background:var(--navy);color:#fff;border-radius:18px;padding:24px;display:grid;gap:14px}
  .cd-cta h2{font-size:22px}.cd-cta p{margin:0;color:#C5D3E0}
  .cd-cta .btns{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .cd-cta .btn-line{background:transparent;border-color:rgba(255,255,255,.45);color:#fff;grid-column:1/-1}
  .cd-list{max-width:1120px;margin:0 auto;padding:28px 20px 70px}
  .case-link{text-decoration:none;color:inherit}.case-link:hover h3{color:var(--brand)}
  .more{font-size:14px;font-weight:700;color:var(--brand)}
  @media (max-width:520px){.cd-cta .btns{grid-template-columns:1fr}}
</style>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<header>
  <div class="wrap nav">
    <a class="logo" href="/" aria-label="마하파킹 홈"><img src="/assets/logo-h-white.svg" alt="마하파킹 MAHAPARKING" class="logo-img"></a>
    <ul class="menu" id="menu">
      <li><a href="/">홈</a></li>
      <li><a href="/#upcycle">업싸이클링</a></li>
      <li><a href="/#products">제품 견적</a></li>
      <li><a href="/cases" aria-current="page">시공사례</a></li>
      <li><a href="/#consult">상담 신청</a></li>
    </ul>
    <div class="nav-calls"><a class="nav-call" href="tel:07048661036">☎ 070-4866-1036</a><a class="nav-call nav-call2" href="tel:01082751036">📱 010-8275-1036</a></div>
  </div>
</header>
<main>
${body}
</main>
<footer>
  <div class="wrap">
    <img src="/assets/logo-v-white.svg" alt="마하파킹" class="foot-logo">
    <div>주차장비 유지보수 &amp; 업싸이클링 전문기업</div>
    <div class="biz"><span>대표 조상현</span><span>사업자등록번호 273-11-02830</span></div>
    <div class="biz"><span>경기도 안양시 만안구 만안로 31-3, 9층 911호 (안양동, 안양인터비즈)</span></div>
    <div class="biz"><span>대표번호 070-4866-1036</span><span>휴대폰 010-8275-1036</span><span>이메일 ace@mahaparking.co.kr</span><a href="https://blog.naver.com/mahaparking">네이버 블로그</a></div>
    <div class="biz"><a href="/privacy.html" style="color:#fff;font-weight:700">개인정보처리방침</a></div>
    <div class="foot-end"><span>© 2026 마하파킹</span></div>
  </div>
</footer>
<nav class="mobile-bar" aria-label="빠른 연락">
  <a class="call" href="tel:07048661036">☎ 전화하기</a>
  <a class="photo" href="/#consult">상담 신청</a>
</nav>
</body>
</html>`;
}

const CTA = `<div class="cd-cta">
  <h2>비슷한 증상이 있으신가요?</h2>
  <p>현장 사진 한 장만 보내 주셔도 상담을 시작할 수 있습니다. 서울·경기·인천·충청 출장 가능합니다.</p>
  <div class="btns">
    <a class="btn btn-primary" href="tel:07048661036">☎ 대표번호 070-4866-1036</a>
    <a class="btn btn-primary" href="tel:01082751036">📱 휴대폰 010-8275-1036</a>
    <a class="btn btn-line" href="/#consult">사진으로 상담 신청하기 →</a>
  </div>
</div>`;

function detail(c) {
  const where = [c.area, c.work_type].filter(Boolean).join(' ');
  const title = `${c.title}${where && !c.title.includes(c.area || '#') ? ' | ' + where : ''} - 마하파킹 시공사례`;
  const desc = cut(`${where ? where + ' ' : ''}${c.title}. ${c.description || ''} ${c.result || ''}`, 150);
  const photos = (c.photos || []).map(photoUrl);
  const body = `
<div class="page-top"><div class="wrap">
  <div class="crumb"><a href="/">홈</a> › <a href="/cases">시공사례</a></div>
  <div class="meta">${c.work_type ? `<span>${esc(c.work_type)}</span>` : ''}${c.area ? `<span>${esc(c.area)}</span>` : ''}${c.work_date ? `<span class="date">${dot(c.work_date)}</span>` : ''}</div>
  <h1>${esc(c.title)}</h1>
</div></div>
<article class="cd">
  ${photos.length ? `<div class="cd-photos">${photos.map((u, i) => `<img src="${esc(u)}" alt="${esc(c.title)} 현장 사진 ${i + 1}"${i ? ' loading="lazy"' : ''}>`).join('')}</div>` : ''}
  <div class="card cd-text">
    <p>${esc(c.description)}</p>
    ${c.result ? `<div class="cd-result">${esc(c.result)}</div>` : ''}
  </div>
  ${CTA}
  <div class="center-cta" style="margin-top:0"><a class="btn btn-line" href="/cases">다른 시공사례 보기 →</a></div>
</article>`;
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: cut(c.title, 110), description: desc, image: photos.slice(0, 5),
    datePublished: c.work_date || (c.created_at || '').slice(0, 10) || undefined,
    author: { '@type': 'Organization', name: '마하파킹', url: SITE },
    publisher: { '@type': 'Organization', name: '마하파킹', logo: { '@type': 'ImageObject', url: SITE + '/assets/logo-h-blue.png' } },
    mainEntityOfPage: urlOf(c),
  };
  return page({ title, desc, canonical: urlOf(c), image: photos[0], body, jsonld });
}

function list(cases) {
  const cards = cases.map((c) => {
    const ph = c.photos && c.photos.length ? `<img src="${esc(photoUrl(c.photos[0]))}" alt="${esc(c.title)} 현장 사진" loading="lazy">` : '현장 사진 준비 중';
    return `<a class="case-link" href="${pathOf(c)}"><article class="card case"><div class="case-photo">${ph}</div><div class="case-body"><div class="meta">${c.work_type ? `<span>${esc(c.work_type)}</span>` : ''}${c.area ? `<span>${esc(c.area)}</span>` : ''}${c.work_date ? `<span class="date">${dot(c.work_date)}</span>` : ''}</div><h3>${esc(c.title)}</h3><p>${esc(cut(c.description, 90))}</p><span class="more">자세히 보기 →</span></div></article></a>`;
  }).join('');
  const body = `
<div class="page-top"><div class="wrap"><div class="kicker">CASES</div><h1>시공사례</h1><p>마하파킹이 직접 다녀온 현장을 사진과 함께 짧게 소개합니다.</p></div></div>
<div class="cd-list">
  <div class="case-grid">${cards || '<p class="hint">시공사례를 준비하고 있습니다. <a href="https://blog.naver.com/mahaparking">네이버 블로그</a>에서 먼저 보실 수 있습니다.</p>'}</div>
  <div style="margin-top:32px">${CTA}</div>
</div>`;
  return page({
    title: '시공사례 - 주차차단기 수리·차단바 교체·루프센서 | 마하파킹',
    desc: '마하파킹이 직접 시공한 주차차단기 수리, 차단바 교체, 루프센서 시공, 경광등 수리, 번호인식 업그레이드 현장 사례입니다.',
    canonical: SITE + '/cases', body,
  });
}

module.exports = async (req, res) => {
  const u = new URL(req.url, SITE);
  const slug = u.searchParams.get('slug');
  let cases;
  try { cases = await listCases(); } catch (e) {
    res.statusCode = 503; res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end('<!DOCTYPE html><meta charset="utf-8"><p>잠시 후 다시 열어 주세요.</p><p><a href="/">마하파킹 홈으로</a></p>');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
  if (!slug) { res.statusCode = 200; return res.end(list(cases)); }
  const c = findBySlug(cases, slug);
  if (!c) {
    res.statusCode = 404;
    return res.end(page({ title: '찾을 수 없는 시공사례 | 마하파킹', desc: '', canonical: SITE + '/cases', status: 404,
      body: '<div class="page-top"><div class="wrap"><h1>시공사례를 찾을 수 없습니다</h1><p>내려갔거나 주소가 바뀐 글입니다.</p></div></div><div class="cd"><a class="btn btn-primary" href="/cases">시공사례 목록 보기 →</a></div>' }));
  }
  // 제목을 고쳐 주소가 바뀐 경우, 새 주소로 옮겨 줌 (검색 점수 유지)
  const want = slugOf(c);
  let got = slug; try { got = decodeURIComponent(slug); } catch (e) { /* 그대로 */ }
  if (got !== want) { res.statusCode = 301; res.setHeader('Location', pathOf(c)); return res.end(); }
  res.statusCode = 200; return res.end(detail(c));
};
