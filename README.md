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

## Notes

- The two logo PNGs are large (~2778×466). If page weight matters, downscaling
  them to display size is a safe optimization.
