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

A **WYSIWYG editor** lets you drag widgets onto the app canvas; it writes the
same `sl_*` calls a developer would type by hand, back into the same `.nb.md`.

Design/scoping stage — see [`VISION.md`](VISION.md) for the full writeup: the
single-loop execution model, the two views over one kernel, the `.nb.md`
format and how it maps to JEP #103, the WYSIWYG layer, what's reused verbatim
from `streamlab` vs. genuinely new, the IP posture, and the inspirations
(Streamlit, Jupyter, Jupytext/MyST-NB/Quarto, marimo, Pluto.jl) this draws on
honestly rather than by name-drop.

Private. Nothing here is built yet.
