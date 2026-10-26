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

## 행운권 QR (3·1 만세길 걷기)

- 처음 한 번: Supabase SQL Editor에서 `lucky-setup.sql` 실행 (`walk-events-setup.sql` 다음).
- `lucky-admin.html` (임원방) — 회차 고르기 → 번호 범위로 행운권 만들기 → 행사명 · 이미지를
  넣고 인쇄용 PDF 만들기 → 등록 현황 보기 · 고치기 · 대신 등록 · CSV.
- `lucky.html?c=확인코드` — 참가자가 QR을 찍으면 열리는 등록 화면 (이름 · 생년월일 · 소속 · 휴대폰(선택)).
- `lucky-print.js` — PDF · 미리 보기 그리기 (jsPDF + qrcode-generator).

## 회계 관리 (삼기연 · 삼일만세운동본부 따로)

- 처음 한 번: 삼기연 Supabase에서 `ledger-setup.sql`, 만세운동본부 Supabase에서 `manse/ledger-setup.sql` 실행.
  휴대폰에서는 `setup-sql.html` — 단추 하나로 SQL 복사 (삼기연: 걷기 회차 + 행운권 + 회계 한 번에) → SQL Editor 열기.
- `accounting.html` (임원방 → 회계 관리) — 삼기연 장부. 기록: 회계 · 회장 · 최고관리자, 보기 · 인쇄: 임원.
- `manse/officer.html` → 회계 탭 — 만세운동본부 장부. 기록: 회계 · 부회계 · 대표회장 · 관리자, 보기 · 인쇄: 임원.
- `ledger.js` · `ledger.css` — 두 곳이 같이 쓰는 장부 화면 (수입 · 지출 기록, 전기이월, 계정과목별 · 월별 표,
  변경 기록, 회계 보고 A4 인쇄, CSV). 장부는 각 프로젝트 DB에 따로 저장되어 섞이지 않습니다.

## Notes

- The two logo PNGs are large (~2778×466). If page weight matters, downscaling
  them to display size is a safe optimization.
