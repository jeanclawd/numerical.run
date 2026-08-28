# numerical.run

One `.nb.md` document, two modes — a **notebook** for building and an **app**
for using — running on a single [RunMat](https://github.com/dystr/runmat)
WebAssembly kernel that speaks the Jupyter protocol. Edit as a notebook, ship
as an app, from the same file and the same live session.

The execution model is Streamlit's, not a reactive notebook's: **every change
reruns the whole document, top to bottom**. One loop, no dependency graph, no
hidden per-cell state — predictable and simple, the way
[`streamlab`](https://github.com/jeanclawd/streamlab) already works.

Widgets are plain MATLAB function calls from
[`streamlab`](https://github.com/jeanclawd/streamlab)'s `sl_*` library — no new
syntax, no `.mlx`, no proprietary format. The serialization is
[**`.nb.md`**](VISION.md#the-nbmd-format): a Markdown-based Jupyter notebook
following [JEP&nbsp;#103](https://github.com/jupyter/enhancement-proposals/pull/103),
so any Jupyter-aware tool can read it and it stays one-hunk-per-cell in git.

A **WYSIWYG editor** (the *＋ Widgets* panel) writes the same `sl_*` calls a
developer would type by hand into the active code cell, then reruns.

See [`VISION.md`](VISION.md) for the design writeup: the single-loop execution
model, the two views over one kernel, the `.nb.md` format and how it maps to
JEP #103, the WYSIWYG layer, what's reused verbatim from `streamlab` vs.
genuinely new, the IP posture, and the inspirations (Streamlit, Jupyter,
Jupytext/MyST-NB/Quarto, marimo, Pluto.jl).

## Running it

Everything runs client-side — one RunMat WASM kernel, no server.

```
host/            the app
  index.html     shell (Notebook | App toggle, ＋ Widgets, Run all, share)
  app.js         two views + WYSIWYG over one document and one kernel
  kernel.js      RunMat WASM session + whole-document rerun, per-cell output
  nbmd.js        .nb.md parse / serialize (JEP #103 subset)
  md.js          tiny Markdown → HTML for prose cells
  render.js      widget renderer            (reused from streamlab)
  lib.m          sl_* widget library        (reused from streamlab)
  figrender.mjs  figure SVG renderer        (reused from streamlab)
  examples/*.nb.md
deploy.sh        assemble host/ + RunMat runtime → the static site
```

`./deploy.sh` builds the static site (pulling the 52 MB RunMat runtime from an
adjacent `streamlab` deploy). Load an example, edit cells, hit **Run all**, and
toggle **App** to see the same document as a Streamlit-style app. **share**
copies a link that carries the whole `.nb.md` inside its `#nb=` fragment.

Reused verbatim from [`streamlab`](https://github.com/jeanclawd/streamlab): the
RunMat WASM runtime, the `sl_*` widget library, the `%%SL%%` marker protocol,
the figure renderer, and the widget→DOM renderer. New here: the `.nb.md` format,
the notebook view, the per-cell-attributed rerun, and the WYSIWYG panel.
