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

## Notes

- The two logo PNGs are large (~2778×466). If page weight matters, downscaling
  them to display size is a safe optimization.
