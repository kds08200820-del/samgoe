# 삼괴지역 기독교 연합회 (삼기연) — 공식 홈페이지

Static, single-page site implemented from the Claude Design handoff
(`project/삼괴지역 기독교 연합회.dc.html`). No build step, no framework — plain
HTML + CSS. The prototype's React `dc-runtime` and drag-and-drop `<image-slot>`
components were replaced with standard markup; the photos the user had already
dropped into the prototype are extracted into `assets/img/`.

## Run locally

Just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Deploy

Any static host works (GitHub Pages, Netlify, Vercel, S3, …) — upload the
`site/` folder as-is.

## Structure

- `index.html` — the whole page (sticky nav → hero → 소개 → 활동 → 임원 → 일정 →
  소속교회 → 3·1만세 → 갤러리 → 가입·회비 → 오시는 길 → footer).
- `assets/logo.png`, `assets/logo-trans.png` — brand logos (footer / hero).
- `assets/img/` — hero, gallery (`g1`–`g5`), 약도 (`map`), and officer
  portraits (`ofc-1`–`ofc-7`).

## Editing

- **Text** (notices, church roster, officer names) is plain HTML — edit
  directly in `index.html`.
- **Photos** — replace the corresponding file in `assets/img/` (keep the same
  filename), or point the `<img src>` at a new file.
- **Colors / type** live in the `:root` CSS variables at the top of
  `index.html` (`--blue` #0066cc is the brand accent).

## 3·1 만세길 걷기 — 삼일만세운동본부가 운영 (manse/)

- 회차 · 참가 신청 · 행운권 QR · 경품 당첨 · 인증 · 수령 · 결과 보고는 모두 만세운동본부 Supabase(`manse/manse-walk-setup.sql`)와 `manse/` 화면에서.
  삼기연 쪽 예전 주소(`walk.html` · `lucky.html` · `lucky-admin.html` · `walk-admin.html` · `prize-winners.html`)는 같은 이름의 `manse/` 화면으로 넘어가는 안내 페이지만 남김.
- `manse/walk.html` 참가 신청 · `manse/walk-admin.html` 회차 · 신청 기록 · `manse/lucky-admin.html` 행운권 QR(모든 인쇄 모양이 참가자용 + 추첨용 두 칸, 절취선)
  · `manse/lucky.html?c=확인코드` 행운권 등록 · `manse/prize.html` 경품 당첨 확인 · 인증 · `manse/prize-winners.html` 당첨자 명단 · 수령 확인.
- 관리자 메뉴 → 걷기대회 관리: 위 화면으로 가는 단추 · 회차별 결과 보고(`walk-report.js`) · 교회별 참가 인원(신청 기록을 교회별로 묶음).
- 삼기연 첫 화면의 걷기 안내는 만세 Supabase의 `walk_events.hero`(공개 정보)를 읽어 `manse/walk.html`로 연결.

## 회계 관리 (삼기연 · 삼일만세운동본부 따로)

- 처음 한 번: 삼기연 Supabase에서 `ledger-setup.sql`, 만세운동본부 Supabase에서 `manse/ledger-setup.sql` 실행.
  휴대폰에서는 `setup-sql.html` — 단추 하나로 SQL 복사 → SQL Editor 열기.
- `accounting.html` (임원방 → 회계 관리) — 삼기연 장부. 기록: 회계 · 회장 · 최고관리자, 보기 · 인쇄: 임원.
- `manse/officer.html` → 회계 탭 — 만세운동본부 장부. 기록: 회계 · 부회계 · 대표회장 · 관리자, 보기 · 인쇄: 임원.
- `ledger.js` · `ledger.css` — 두 곳이 같이 쓰는 장부 화면 (수입 · 지출 기록, 전기이월, 계정과목별 · 월별 표,
  변경 기록, 회계 보고 A4 인쇄, CSV). 장부는 각 프로젝트 DB에 따로 저장되어 섞이지 않습니다.

## 삼일만세운동본부 Supabase (manse 프로젝트)

- 처음 한 번: Supabase에 새 프로젝트 `manse`를 만들고 SQL Editor에서 아래 파일을 차례로 실행
  (`setup-sql.html`의 '삼일만세운동본부' 복사 단추가 한 번에 복사): `manse/manse-setup.sql` → `manse/manse-photos-setup.sql`
  → `manse/activity-media-setup.sql` → `manse/manse-walk-setup.sql` → `manse/manse-press-setup.sql`
  → `manse/manse-report-setup.sql` → `manse/ledger-setup.sql`.
- Authentication: Email의 Confirm email 끄기, URL Configuration의 Site URL `https://samgoe-cc.or.kr/manse/`,
  Redirect URLs `https://samgoe-cc.or.kr/manse/**`.
- `manse/config.js`에 그 프로젝트의 주소와 공개(anon/publishable) 키.
- 공유 로그인: 같은 브라우저에 삼기연 로그인이 있으면 만세 페이지를 열 때 그 계정으로 자동 로그인
  (`manse/auth.js` → Edge Function `samgoe-login` — `supabase/functions/samgoe-login/index.ts`, verify_jwt 끔).
  처음이면 삼기연 정보로 만세 회원이 자동으로 만들어짐. 만세에서 로그아웃하면 그 브라우저에선 자동 로그인을 멈춤.
- 언론 보도 갤러리: `manse/archive/press.js` + `manse/manse-press-setup.sql`(press 표) + Edge Function `press-meta`
  (`supabase/functions/press-meta/index.ts`, verify_jwt 끔 · 임원만) — 기사 주소만 넣으면 제목 · 언론사 · 날짜 · 대표 사진,
  사진은 manse-photos/press/ 에 보관. 못 가져오면 창의 사진 칸이나 카드 위에 사진을 끌어다 놓기.
- 걷기 결과 보고 공개: 관리자 메뉴 → 걷기대회 관리 → 회차별 결과 보고 → '홈페이지에 게시' — 숫자와 교회 이름만
  `walk_reports`(`manse/manse-report-setup.sql`)에 저장 (당첨자 명단 · 단체 · 시민 이름은 빠짐). 첫 화면에 가장 최근 회차
  '결과 보고' 띠가 나오고 `manse/report.html?w=회차`에서 봄. '게시 내리기'로 숨김. 화면 모양은 `manse/walk-report.js` · `walk-report.css` 공용.
- 삼기연 만세길 자료 · 옛 manse 프로젝트(elaockhopuvadamvwjeg) 자료는 2026년 10월에 모두 옮겼고, 옮기기 화면(import-samgoe · move)은 지웠습니다.
- 최고관리자(kds08200820@gmail.com)로 만세 홈페이지에 가입 → 임원방 → 임원 명단에 임원들의 가입 이메일을 넣으면 각자 임원방이 열림.

## Notes

- The two logo PNGs are large (~2778×466). If page weight matters, downscaling
  them to display size is a safe optimization.
