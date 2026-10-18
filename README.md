# Chapter Checks by READ FRANCE

**Site: https://outils.vread.fr/chapter-checks/** (venture V4-64 of READ FRANCE SAS)

Printable and LMS-importable chapter checks for US AP Literature and grade 11–12 English teachers, on public-domain
classics: student PDF, answer key with the line of the text behind each answer, 2-1-0 rubric, Canvas/Schoology
QTI 1.2 package, CSV and a Google Forms script. *Macbeth* is free (`src/sample/macbeth/`); other titles are sold
through [octave-global-checkout](https://github.com/VREAD-corp/octave-global-checkout) (USD, US buyers only,
products `cc-*`, venture `v4-64`).

- `data/catalog.json` and `src/sample/` are exported by the private content repo (`VREAD-corp/chapter-checks-content`,
  `scripts/export-site.py`). Paid questions are not in this repository.
- `data/study/<slug>.json` (same export): the free reading guide of each title at `/study/<slug>/` (overview per check,
  key passages, 3 pack questions). `data/ap-q3.json`: the 7 AP Literature question-3 lists 2023-2026 read from the College
  Board PDFs on 2026-10-17; the home, `/ap-literature/` and the study pages take their AP counts from it.
- `src/vendor/mesure.js` and `cro.js`: byte-identical copies of `octave-checkout/gas/web/` (aggregate, cookieless
  counting; site `chapter-checks`). `src/vendor/og-checkout.js`: `octave-global-checkout/dist/` (module 1.4.0).
- A/B test `cc-prix` (title pack $5 `p5` / $7 `p7`, per tab) in `src/assets/xp.js`; `?prix=p7` forces a variant.
- Pooled test `rd-hero` (POOLED-READING-01, from 2026-10-19, home only, per tab): `b` shows the top of page 1 of the free
  Macbeth student PDF (`src/assets/img/macbeth-act1-excerpt.webp`) in place of the HTML question card; `?hero=b` forces it.
  Goal `sample` (`src/assets/goals.js`): a click on any link to the free pack or its files.
- `/quote/`: printable quote built in the browser (`src/assets/quote.js`), with a mailto to octave@vread.fr; no backend,
  nothing sent. Payment stays card-only; purchase orders on net-30, checks and transfers are not accepted.

```sh
npm test       # build + static checks (pages, links, JSON-LD without ratings, tracking, order config, no paid files)
OCTAVE_CHECKOUT_WEB=../octave-checkout/gas/web OG_DIST=../octave-global-checkout/dist \
LINT_IA=../vread-revenue-lab/content/lint-ia.mjs npm test   # + vendored copies identical, lint-ia >= 85
npm run serve  # http://localhost:4173/chapter-checks/
npx playwright test   # e2e (local build, or BASE_URL=https://outils.vread.fr/chapter-checks/)
```

Deploy: GitHub Actions → GitHub Pages on every push to `main`.
Code: MIT. Questions, keys and rubrics: © 2026 READ FRANCE SAS. AP® is a trademark registered by the College Board,
which is not affiliated with, and does not endorse, this product.
