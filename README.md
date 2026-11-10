# emilpartow.github.io

Personal academic website of Emil Partow: plain HTML, CSS and JavaScript.
No build step, no frameworks, no external requests, no cookies.

## Using this site as a template

You are welcome to build your own site on this code. If you do, please give credit: keep a visible link
to <https://emilpartow.github.io> in your footer or README, for example

> Based on the website of [Emil Partow](https://emilpartow.github.io).

Please replace everything that is personal with your own: the texts, the portrait, the CV, the logo mark
(nav and favicons), the link preview image, the structured data in the `<head>`, `legal.html` and the
`google…html` verification file. The institution logos belong to the institutions.

## Preview locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Opening `index.html` directly also works. Only the self-hosted fallback font is blocked over `file://`.

## Structure

| Path | What |
| --- | --- |
| `index.html` | All content: hero, research, publications, news, contact |
| `_cv/` | Private LaTeX sources of the CV (git-ignored); publish only `assets/cv.pdf` |
| `assets/css/style.css` | Design: Futura, with self-hosted Jost (OFL) as fallback; light and dark |
| `assets/js/viz.js` | Canvas visualizations: hero density (soft at the top, sharper as you scroll), generative regression (engression style), kernel score vs log-likelihood, spacecraft planning with and without its own uncertainty, autoresearch (a tree of ideas grown by agents, pruned by an orchestrator) |
| `assets/js/main.js` | Theme toggle, navigation, BibTeX, easter eggs |
| `legal.html` | Imprint and privacy policy (keep it in step when a service or a stored setting is added) |
| `404.html` | Proof by contradiction |

## Editing

- **New paper:** copy a `<li class="pub">` block in `index.html` and put the newest first.
- **News:** add an `<li>` at the top of `.timeline`.
- **Long lists:** `data-limit` on `.pubs` and `.timeline` sets how many entries stay visible; older ones fold behind a “Show n earlier” button once at least three would be hidden.
- **Photo:** `assets/img/portrait.jpg` (4:5); `portrait-square.jpg` is the image in the structured data. The link preview image is `assets/img/og.jpg` (1200×630).
- **CV:** `assets/cv.pdf` is built from the private LaTeX sources in `_cv/` (`cv_web.tex`, no phone number) with `pdflatex`.
- **After changing CSS or JS:** bump the `?v=` suffix on the three `<link>`/`<script>` tags in `index.html` and on the stylesheet in `404.html` and `legal.html`, so browsers fetch the new files instead of cached ones.
- **SEO:** title, description, Open Graph and JSON-LD are in the `<head>` of `index.html`; the preview image is `assets/img/og.jpg` (1200×630). Update `lastmod` in `sitemap.xml` after bigger changes. After going live, add the site in Google Search Console and submit the sitemap.

## Easter eggs

1. Konami code (↑ ↑ ↓ ↓ ← → ← → B A) heats the density behind the hero, which then cools down.
2. Type `qed` anywhere.
3. Click the ∎ at the very bottom, several times.
4. Switch to another tab and look at the tab title (it changes every time).
5. Open the browser console.
6. Visit any page that does not exist.
7. Click anywhere in the hero: the density behind the card is pulled towards the click and swings back.
8. Click the “Hi” in the heading.

## Deploy to GitHub Pages

```sh
gh auth login
git init -b main && git add -A && git commit -m "Initial site"
gh repo create emilpartow.github.io --public --source=. --push
```

Pages serves `main` from the root at <https://emilpartow.github.io> (Settings → Pages if it doesn't start automatically).
