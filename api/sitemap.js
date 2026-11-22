/**
 * 사이트맵 자동 만들기: /sitemap.xml (vercel.json 에서 /api/sitemap 으로 연결)
 * 첫 화면 + 시공사례 목록 + 공개된 시공사례 전부를 넣습니다. 사례를 올리면 자동으로 늘어납니다.
 */
const { SITE, listCases, urlOf } = require('./_cases');

module.exports = async (req, res) => {
  let cases = [];
  try { cases = await listCases(); } catch (e) { /* 사례를 못 불러와도 기본 주소는 내보냄 */ }
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: SITE + '/', lastmod: today },
    { loc: SITE + '/cases', lastmod: (cases[0] && (cases[0].work_date || (cases[0].created_at || '').slice(0, 10))) || today },
  ].concat(cases.map((c) => ({ loc: urlOf(c), lastmod: c.work_date || (c.created_at || '').slice(0, 10) || today })));
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url>\n    <loc>${u.loc.replace(/&/g, '&amp;')}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`).join('\n') + '\n</urlset>\n';
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.statusCode = 200; res.end(xml);
};
