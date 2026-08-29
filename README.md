<p align="center">
  <img src="docs/logo.png" alt="numerical.run" width="96">
</p>

<h1 align="center">numerical.run</h1>

One `.nb.md` document, two modes — a **notebook** for building and an **app**
for using — running on a single [RunMat](https://github.com/dystr/runmat)
WebAssembly kernel that speaks the Jupyter protocol. Edit as a notebook, ship as
an app, from the same file and the same live session. Fully client-side.

Two execution models, one per mode:

- **Notebook** — stateful, Jupyter-style. Each code cell has its own *Run* (and
  Ctrl/⌘+Enter), executes against the persistent workspace without resetting, and
  updates only its own output. Variables carry across cells.
- **App** — Streamlit-style. Every interaction resets the session and reruns the
  whole document top-to-bottom, so the page always reflects a clean run.

Widgets are plain MATLAB function calls — the `nr_*` library (`nr_slider`,
`nr_selectbox`, `nr_metric`, …) — no new syntax, no `.mlx`, no proprietary
format. The serialization is [**`.nb.md`**](VISION.md): a Markdown-based Jupyter
notebook following [JEP&nbsp;#103](https://github.com/jupyter/enhancement-proposals/pull/103),
so any Jupyter-aware tool can read it and it stays one-hunk-per-cell in git.

See [`VISION.md`](VISION.md) for the architecture: the kernel, the two modes, the
`.nb.md` format and how it maps to JEP #103, and the inspirations (Streamlit,
Jupyter, Jupytext/MyST-NB/Quarto, marimo, Pluto.jl).

## Screenshots

**Notebook** — editable code + markdown cells, per-cell output, widgets inline:

![Notebook — cells with inline widgets, a live figure and metrics](docs/notebook.png)

**App** — the same `.nb.md` rendered as an app: code hidden, widgets and prose in place:

![App — the same document rendered as an app](docs/app.png)

## Single-page app

One page; state lives entirely in the URL — no separate routes.

- **Editor** chosen by URL param (no button): `?editor=notebook` (default) is the
  notebook-as-editor (editable cells, Monaco per code cell, outputs inline);
  `?editor=classic` is one Monaco over the whole `.nb.md` with an App preview.
- **Notebook | App** toggle (gradient on the selected mode) switches authoring vs.
  the rendered app. A bare URL opens in the editor; a shared document opens as the app.
- **Insert anywhere**: an always-visible `+` on every gap expands to
  **Code / Text / Widget▸** and inserts at that spot — mobile-friendly.
- **Document** comes from the URL, else a built-in default:

```
#code=<base64>   ?code=<base64>   ?gist=<id | raw-url>   (default)
```

**share** copies a `#code=` link that carries the whole document (with a little
gradient flourish).

## Layout

```
host/
  index.html     the SPA shell (logo, Notebook|App toggle, Run, share)
  app.js         both editors + the notebook cells + insert-anywhere over one kernel
  kernel.js      RunMat WASM session; runCell (stateful) + runAll (full rerun)
  nbmd.js        .nb.md parse / serialize (JEP #103 subset)
  md.js          tiny Markdown → HTML for prose cells
  render.js      widget/element renderer (elements → DOM)
  lib.m          the nr_* widget library (pure .m on RunMat)
  figrender.mjs  figure SVG renderer
  favicon.svg    the [▶] logo mark
  examples/*.nb.md
deploy.sh        assemble host/ + RunMat runtime + Monaco → the static site
netlify.toml     Netlify build config  ·  netlify-build.sh
```

The runtime is one RunMat WASM kernel; the `nr_*` widgets print a `%%NR%%` marker
line the host parses into elements, and widget state is baked back into the source
between runs (`nr_state_`).

## Deploy

- **Self-hosted** — `./deploy.sh` builds the static site (RunMat runtime + Monaco
  vendored locally).
- **Netlify** — `netlify.toml` runs `netlify-build.sh`, which publishes the small
  app files and points the heavy assets (RunMat wasm, Monaco) at jsDelivr, so the
  build stays tiny. All state is in the URL, so a single-page redirect serves
  every path.
