# numerical.run — a Jupyter-compatible notebook + app runtime

Compiled 2026-08-28, revised for the **jupyter-nextgen** direction. Grounded in
the actual source of [`jeanclawd/streamlab`](https://github.com/jeanclawd/streamlab)
(`streamlab.m` / `host/engine.js`) and the RunMat WASM kernel it runs on, not
just READMEs.

## The one-sentence pitch

One `.nb.md` file, one RunMat WASM kernel that speaks the Jupyter protocol, two
renderers over it — a **notebook** for building and an **app** for using —
with a Streamlit-style whole-document rerun loop and a WYSIWYG editor that
writes widget code for you.

## The execution model: one loop, whole document

This is the decision everything else follows from, and it's deliberately the
*simple* one.

**Every interaction reruns the entire document, top to bottom.** A widget
moves, a cell changes, the app receives an event → the kernel resets its
workspace and executes every cell in order (`resetSession` → execute →
render). This is exactly Streamlit's model, and exactly what `streamlab`
already does today (`host/engine.js`).

We are **not** building a reactive dependency graph. There is no per-cell DAG,
no "rerun only the descendants of what changed," no incremental scheduler. That
approach (marimo/Pluto.jl-style) is a real and interesting design, but it buys
exploration ergonomics at the cost of a dependency tracker, cross-cell state
invalidation rules, and a mental model where *which* cells rerun is not obvious
from reading the file. For a notebook that doubles as a shippable app, the
Streamlit contract wins: **what you see is the result of running the whole
thing, every time.** No hidden state, nothing to explain.

The cost — recomputing everything on each interaction — is the same cost
Streamlit apps already pay and users already accept, and it's bounded by the
kernel being local WASM (no network round-trip per rerun). Expensive steps get
the same answer Streamlit gives: memoize them in user code. That's a library
concern, not a runtime one, and it keeps the core loop a single, legible path.

## One kernel, Jupyter-compatible

Both modes run on **one** kernel: the RunMat runtime compiled to WebAssembly,
exposed over the **Jupyter messaging protocol** (`execute_request` /
`execute_reply`, `stream`, `display_data`, `status`). That protocol boundary is
the whole point:

- The **same kernel** backs the notebook view, the app view, and the WYSIWYG
  editor's live preview. There is no separate "preview engine" — every rendered
  surface is the output of one `execute_request` against one session.
- Because it's the Jupyter protocol, the kernel is not numerical.run-specific.
  It can be driven by JupyterLab, JupyterLite, `nbclient`, or any Jupyter
  front-end — numerical.run is one such front-end, not the only possible one.
- `.nb.md` (below) is a Jupyter notebook in Markdown clothing, so
  "document ⇄ kernel" is just the ordinary Jupyter execute loop, not a bespoke
  bridge.

Widgets ride on top of this without extending it. `sl_slider`, `sl_button`,
etc. are **plain user-space MATLAB functions** (`streamlab.m`) that print a
marker line to stdout (`%%SL%%{...json...}`); the front-end parses that marker
out of the ordinary `stream` message the Jupyter protocol already delivers. No
kernel changes, no protocol extension, no new syntax — `v = sl_slider('freq',
1, 8, 2, 0.5)` is an ordinary function call whose side effect happens to be a
marker the host understands. Widget *state* survives a rerun by being baked
into the generated source as a `jsondecode` literal (`sl_state_()`, regenerated
each run) — the mechanism `streamlab` already uses, and with a
whole-document-rerun model it's a clean fit: state in, run, state out, no
graph to reconcile.

## The `.nb.md` format

`.nb.md` is **the** serialization format — one format, not a family of them.
It's a Markdown-based Jupyter notebook following
[JEP&nbsp;#103, "Official support for Markdown-based notebooks"](https://github.com/jupyter/enhancement-proposals/pull/103)
(Thiéry/Purves/Lisin, opened 2023-03-01, still open as of this writing), which
specifies exactly this: an optional YAML frontmatter header for notebook
metadata; code cells as ` ```{jupyter.code-cell} ` fenced blocks (execution
count and id in the info-string, cell metadata via a YAML block, MyST-style
`:key: value` shorthand, or single-line JSON); outputs as sibling
`{jupyter.output output_type=...}` blocks, one JSON object per line per MIME
type for diff-friendliness; and narrative text as the surrounding Markdown
flow, split into cells with a `+++` thematic break.

numerical.run **adopts JEP #103's syntax as-is** rather than inventing a
divergent one — that's the whole point of building on a real spec. Concretely:

- ` ```matlab {jupyter.code-cell} ` for MATLAB code cells (with the `matlab`
  language hint per the JEP's advisory prefix).
- `+++` for cell breaks between narrative Markdown.
- numerical.run's own **widget / layout data rides in cell metadata**, inside
  the mechanism the JEP already defines (the shorthand block) — not a separate
  bespoke directive:

      ```matlab {jupyter.code-cell}
      :widget: {kind: sl_slider, bind: f, x: 120, y: 40, w: 220}

      f = sl_slider('frequency', 1, 8, 2, 0.5);
      ```

To any JEP-103-aware tool that's a plain Markdown Jupyter notebook; the widget
data is just cell metadata, the same way `tags` or slide config would ride
along. Delete the metadata and the notebook still runs — it degrades
gracefully to plain Streamlit-style top-to-bottom flow.

Why Markdown and not `.ipynb` JSON as the canonical format: `.nb.md` is
human-diffable, one hunk per cell in git, and readable/editable in any text
editor. `.ipynb` stays a supported **interop export** target (the Jupyter
world's lingua franca), not the working format. MATLAB `.m` round-tripping is
*not* a goal of this direction — dropping the reactive-notebook framing also
drops the `%%`-sectioned `.m` + comment-pragma serialization that came with it.
One format, `.nb.md`, is the source of truth.

## Two modes, one file, one session

- **Notebook mode** — cells, code visible, outputs inline, run/run-all
  controls. For building and debugging. This is the authoring surface.
- **App mode** — widgets and outputs rendered in place, code hidden, the
  document run as a Streamlit-style app. For using and sharing.

Both read the same `.nb.md`, run against the same Jupyter kernel session, and
switch instantly — a single edit in notebook mode is immediately live in app
mode. There is no "publish" or "convert" step, because they were never two
files; they're two renderers over one document and one running kernel.

`streamlab`'s existing deployment mechanisms carry over unchanged, because they
never assumed anything but the full-rerun model: the link-is-the-deployment
base64 encoding, the single-file `pack.mjs` bundler, and the Jupyter
`%%streamlab` cell all apply to app mode as-is.

## The WYSIWYG editor

Not a new code editor — a **panel that writes code into the document**, the
same relationship Webflow has to the HTML it generates:

1. A component palette drawn from `streamlab`'s existing `sl_*` surface —
   slider, button, selectbox, text, metric, figure placeholder. Nothing
   invented; every palette item is a function that already exists.
2. Drag one onto the app canvas → numerical.run inserts
   `v = sl_slider('label', ...)` into the target cell (a new cell if dropped on
   empty canvas) **and** writes a `:widget:` metadata entry recording where you
   dropped it, in the JEP-103 cell-metadata block.
3. The canvas re-renders by doing what every other surface does: a
   whole-document rerun against the same Jupyter kernel session. The WYSIWYG
   preview *is* app mode — there's no separate render path to keep in sync.
4. Power users ignore the palette and type `sl_slider(...)` by hand. The
   `:widget:` metadata is optional; a widget with none just renders in
   Streamlit's default top-to-bottom flow, which is what happens today.

Because the editor only ever emits ordinary `sl_*` calls plus optional cell
metadata, its output is a plain, valid `.nb.md` — nothing a hand-editor
couldn't have written, and nothing a non-numerical.run tool can't read.

## What's actually new vs. what's reuse

Against `streamlab` and the RunMat WASM kernel it already runs on:

| Piece | Status |
|---|---|
| RunMat WASM kernel over the Jupyter protocol | reuse — the runtime and protocol boundary already exist |
| Whole-document rerun loop (`resetSession` → execute → render) | reuse from `streamlab`'s `engine.js` as-is |
| `sl_*` widget library + `%%SL%%` marker protocol (`streamlab.m`) | reuse as-is |
| Widget state baked as `jsondecode` literal (`sl_state_()`) | reuse as-is |
| Deployment (link-encode, `pack.mjs`, Jupyter `%%streamlab` cell) | reuse as-is |
| App-mode renderer (widgets-in-place, code hidden) | reuse — this is `streamlab`'s render, restyled |
| `.ipynb` interop export | reuse — standard Jupyter serialization |
| `.nb.md` format (JEP #103 adoption + `:widget:` cell metadata) | **new** |
| Notebook-mode UI (cells over the same kernel, code visible) | **new**, but standard notebook UI — no reactive scheduler |
| WYSIWYG palette / canvas → writes `sl_*` + `:widget:` metadata | **new** |

The honest read: the hard runtime engineering (the WASM kernel, the Jupyter
protocol boundary, the whole-document rerun loop, the widget marker protocol,
the state-baking trick) is **done**, in `streamlab`. What's genuinely new is a
serialization format that adopts an existing spec, a conventional notebook UI
over the existing kernel, and a WYSIWYG layer that emits the existing widget
calls. numerical.run is an integration, format-adoption, and UX project — not a
from-scratch runtime.

Note on scope vs. the earlier draft: this direction **drops** the reactive DAG
engine and the `.rerun.m` + `⟳`-pragma serialization entirely. The full-rerun
loop makes the dependency graph unnecessary, and `.nb.md` replaces the
`.m`-round-trip format. Less to build, one execution model, one file format.

## IP posture

Worth stating plainly. numerical.run touches none of MATLAB's proprietary
formats: `.nb.md` is Markdown, `.ipynb` export is Jupyter's open JSON, and the
widget layer is user-space `sl_*` functions plus comment/metadata — not new
MATLAB syntax and nothing resembling a `.mlx` Live Script reimplementation.
Same trademark posture `streamlab`'s README states, carried forward verbatim:
RunMat™ is Dystr, Inc.'s mark, MATLAB® is MathWorks', numerical.run isn't
affiliated with either.

## Inspirations, named honestly

- **Streamlit** — the entire execution model ("the script is the app,"
  whole-document rerun on every interaction) and `streamlab`'s API surface,
  taken directly. This is the primary influence for this direction.
- **Jupyter** — the kernel protocol both modes speak, the `.ipynb` interop
  target, and the `nbformat`-shaped model (cells, outputs, a JSON model
  underneath) that `.nb.md` serializes.
- **[JEP #103](https://github.com/jupyter/enhancement-proposals/pull/103)** —
  the specific proposal for Markdown-based notebooks that `.nb.md` adopts as-is,
  not a vague direction to gesture at. Its Motivation section already cites
  MATLAB's cell convention as prior art.
- **Jupytext / MyST-NB / Quarto** — the prior art for "Markdown ⇄ notebook,
  round-trips losslessly," which `.nb.md` sits squarely inside.
- **marimo / Pluto.jl** — the reactive-notebook design this direction
  deliberately *doesn't* take. Named here honestly because the earlier draft
  built on it; this revision chooses the simpler full-rerun contract instead.

## Open questions worth resolving before writing code

- With a whole-document rerun and no per-cell graph, is `sl_state_()`
  source-baking still the cleanest state channel, or does the Jupyter kernel's
  own persistent workspace give a simpler place to keep widget state between
  reruns? Worth checking against the current RunMat WASM build.
- Is `.nb.md` → `.ipynb` a one-way export for interop, or does round-trip
  import (`.ipynb` → `.nb.md`) need to be lossless from day one? Export-first
  is lower risk to ship.
- Does the WYSIWYG canvas need real 2D layout (the `x`/`y` in `:widget:`), or
  does v1 ride Streamlit's linear top-to-bottom flow (insertion order = display
  order, what `streamlab` already does) and treat free-form positioning as a
  later addition?
- Memoization story for the full-rerun loop: is Streamlit-style user-code
  caching enough, or does numerical.run ship a blessed `sl_cache`-type helper
  so expensive cells don't recompute every interaction?

---

Not built — this is the design/scoping pass for the **jupyter-nextgen**
direction. Repo is private under `jeanclawd`; next step is whoever picks this
up deciding whether to prototype the `.nb.md` reader/writer or the WYSIWYG
canvas first.
