# 마하파킹 홈페이지 (정식 버전)

## 파일 구성
- `index.html` : 고객용 홈페이지 (홈 · 제품 견적 · 시공사례 · 상담 신청)
- `admin/index.html` : 관리자 화면 (주소: mahaparking.co.kr/admin) — 로그인해야 들어갈 수 있음
- `assets/` : 디자인(site.css), 로고, 프로그램(site.js, admin.js, common.js), Supabase 연결 도구(supabase.js)
- `robots.txt`, `vercel.json` : 검색엔진이 관리자 화면을 수집하지 않도록 하는 설정

## 들어 있지 않은 것 (안전)
- 단가, 고객 정보, 비밀번호는 이 파일들에 없습니다. 모두 Supabase에 저장되고, 관리자 로그인 후에만 보입니다.
- `assets/common.js`의 `sb_publishable_...` 키는 공개용 키입니다. 공개해도 안전하도록 Supabase 잠금 규칙이 걸려 있습니다.

## 올리는 순서
1. GitHub에 `mahaparking-homepage` 저장소를 만들고 이 폴더 안의 파일을 전부 올립니다.
2. Vercel에서 그 저장소를 Import → Deploy.
3. Vercel Settings → Domains 에 `mahaparking.co.kr`, `www.mahaparking.co.kr` 추가 → 가비아 DNS에 안내된 값 입력.
4. Supabase → Authentication → URL Configuration 의 Site URL 을 `https://mahaparking.co.kr` 로 변경.

## 현장샷 (관리자 → "현장샷" 탭)
- 현장 사진(작업 전·중·후) + 메모 → AI가 쇼츠 자막·블로그 글 작성 → 휴대폰 안에서 쇼츠 영상 생성
- `api/hyunjangshot.js` : AI 글쓰기 서버 함수. 관리자 로그인한 사람만 사용 가능
- `assets/shot/` : 현장샷 화면(hyunjangshot.js), 영상 엔진(shorts-engine.js), 배경음악 2곡(직접 만든 곡, 저작권 없음), 엔딩 카드
- **Vercel 설정 필요**: Settings → Environment Variables 에 `ANTHROPIC_API_KEY` (Claude API 키) 추가 후 Redeploy
- 선택: `HYUNJANGSHOT_MODEL` (기본 claude-sonnet-5-5)
- 1차 버전은 음성(내레이션) 없음, 만든 결과는 저장되지 않음(영상 저장·글 복사 후 새로 시작)

## 다음 단계 (예정)
- 견적서 이메일 자동 발송 (하이웍스 메일 + 발송 서비스 연결)
- 지금은 견적서를 "PDF 저장 · 인쇄"로 저장한 뒤 "고객에게 메일 쓰기"로 직접 보냅니다.
