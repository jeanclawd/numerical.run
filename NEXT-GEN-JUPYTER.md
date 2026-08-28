# numerical.run as next-gen Jupyter — reactive, polyglot, WASM-native

Compiled 2026-08-28, on branch `next-gen-jupyter`. An alternative take on
`VISION.md`'s scope, requested explicitly: not "merge two RunMat-only
experiments," but "what if numerical.run's actual target is a next-generation
Jupyter — RunMat, R, and Python, all client-side, reactive across all three."
Backed by real research this time, not just this repo's own two source trees.

## The one-sentence pitch, revised

Don't build WASM notebook infrastructure — it's already built, three times
over, by three different teams. Build the thing none of them have: a
**reactive dependency graph that spans kernels**, with RunMat as a full peer
to Python and R instead of the only language in the room.

## What's already solved — cite it, don't rebuild it

This is the load-bearing finding of the research pass: the "WASM Jupyter"
problem is done.

- **[JupyterLite](https://github.com/jupyterlite/jupyterlite)** — a real,
  actively maintained distribution of JupyterLab that replaces the server
  with browser-native equivalents. Kernels run in Web Workers; the main
  thread ↔ worker protocol has already been through one real engineering
  evolution (`comlink` → [`coincident`](https://github.com/jupyterlite/pyodide-kernel/pull/115),
  which uses `SharedArrayBuffer` + `Atomics.wait` for synchronous calls when
  the page is cross-origin-isolated, falling back to `comlink` otherwise). A
  service worker handles kernel-side filesystem access. This is the hosting
  layer — not something numerical.run should reimplement.
- **Python**: [`jupyterlite-pyodide-kernel`](https://github.com/jupyterlite/pyodide-kernel) —
  official, mature, the reference implementation of the pattern above.
- **R**: [`r-wasm/jupyterlite-webr-kernel`](https://github.com/r-wasm/jupyterlite-webr-kernel) —
  official, built on [webR](https://github.com/r-wasm) (the same engine
  behind Quarto Live and Shinylive — i.e. webR already has its own track
  record powering *other* reactive/app-shaped tools). Live demo:
  jupyter.r-wasm.org. **Needs cross-origin-isolation headers** (COOP/COEP) to
  work — the same constraint this repo's own `signal-lab.mjs` work hit with
  ffmpeg.wasm's multithreaded core, so this is a known, already-handled
  category of deployment requirement, not a new one.
- **MATLAB/RunMat**: **`jeanclawd/runmat-jupyter`, private, pushed
  2026-08-25** — already exists, and it's not a stub. A real kernel for
  *both* JupyterLab (native, `ipykernel` wrapper) and JupyterLite (a proper
  `BaseKernel` TypeScript subclass, wasm fetched at runtime from `./static/`,
  exactly the pyodide-kernel pattern), plus a **Positron-style live variable
  browser** — a kernel-side comm (`runmat_variables`) pushes a typed
  workspace snapshot after every cell, no code-injection scraping. This is
  the RunMat-in-Jupyter story, and it's done. numerical.run's job is to sit
  on top of it, not next to it.

Net: three kernels, one hosting architecture, all speaking the standard
Jupyter kernel messaging protocol already. The actual gap is one layer up.

## The actual gap

Searched for prior art on the specific thing this proposal is about —
reactive notebooks that span more than one language kernel — rather than
assuming it doesn't exist:

- **Microsoft's Polyglot Notebooks / .NET Interactive** (VS Code) was the
  closest mainstream answer to "one notebook, several languages, shared
  variables." It's being **deprecated March 27 (extension) and April 24
  (.NET Interactive), 2026** — announced abruptly on 2026-02-11, [drawing
  real user backlash](https://www.theregister.com/2026/02/12/polyglot_notebooks_deprecation/).
  The apparent cause is organizational (it looks tangled up with Azure Data
  Studio's retirement, not a technical dead end for the idea itself) — worth
  reading as "the market leader just got orphaned," not "this doesn't work."
  Real opportunity, but also a caution: if Microsoft didn't sustain
  investment here, the addressable audience may be genuinely niche, not
  just underserved.
- **[Script of Scripts (SoS)](https://vatlab.github.io/sos-docs/)** — an
  existing, narrower academic tool for multi-kernel notebooks. Worth a
  direct feature comparison before designing numerical.run's own approach,
  not just a name-check.
- **[Kernel-FFI: Transparent Foreign Function Interfaces for Interactive
  Notebooks](https://arxiv.org/abs/2507.23205)** (Li, Bao, Xiao, Tian —
  2025) is the closest thing to a solved-in-research version of the hardest
  part of this proposal: cross-language function calls and object
  references inside notebooks, via **source-level transformation** (rewrite
  cross-language calls automatically, no manual bindings) plus a **side-channel
  communication mechanism** specifically built to work around Jupyter
  kernels' blocking, one-request-at-a-time execution model — which is
  exactly the obstacle a cross-kernel reactive DAG runs into (kernel A can't
  synchronously ask kernel B for a value mid-cell without a channel like
  this). This is the paper to build numerical.run's cross-kernel edges
  against, not a problem to solve from scratch.
- **[When Are Reactive Notebooks Not Reactive?](https://arxiv.org/pdf/2511.21994)**
  (2025) — a recent critique of reactive-notebook semantics generally.
  Required reading before finalizing the DAG's rerun rules — marimo and
  ReRun have presumably already hit some of what it describes; better to
  know the failure modes going in than rediscover them.

**The honest read:** nobody has shipped a *reactive* polyglot WASM
notebook. Adjacent pieces exist (polyglot-but-not-reactive in SoS and the
now-orphaned Polyglot Notebooks; reactive-but-single-language in marimo,
Pluto.jl, and ReRun itself; the hard cross-language mechanics solved in
Kernel-FFI's research prototype, not in a shipping notebook tool). That
combination — genuinely open — is a real, if narrow, positioning.

## Architecture

**One orchestrator, N kernel workers, one DAG.**

```
                    ┌─────────────────────────────────────┐
                    │  numerical.run orchestrator (main    │
                    │  thread): parses .nb.md/.rerun.m,    │
                    │  builds the cross-kernel DAG, routes │
                    │  execute_request per cell to the     │
                    │  right worker, merges results        │
                    └──────────────┬────────────────────────┘
                                   │  JupyterLite's own comlink/
                                   │  coincident worker protocol —
                                   │  reused as-is, not reimplemented
        ┌──────────────────────┬──┴───────────────────┬──────────────────────┐
        │                      │                       │                     │
┌───────┴────────┐   ┌─────────┴─────────┐   ┌─────────┴─────────┐           │
│ pyodide-kernel  │   │ jupyterlite-webr- │   │ runmat-jupyter's  │  … more   │
│ (official)      │   │ kernel (official) │   │ litekernel        │  kernels  │
│ Python          │   │ R                 │   │ (this org's own)  │  later    │
└─────────────────┘   └───────────────────┘   └────────────────────┘         │
                                                                              │
                       each kernel already exposes a comm channel for side   │
                       state (runmat-jupyter's runmat_variables is the       │
                       existing model) — numerical.run's cross-kernel value  │
                       exchange rides the SAME mechanism, generalized        │
```

**Within one language, dependency inference stays automatic** — `dag.js`'s
lexical approach (a name creates an edge only if some cell defines it) is
proven and reused as-is for MATLAB, and the same *kind* of lexical analysis
is buildable per-language for Python/R (different grammar, same idea).

**Across languages, inference doesn't generalize** — Python, R, and MATLAB
don't share a scoping model, so "does this identifier reference another
cell's output" isn't decidable the same way. v1 answer: explicit,
declared cross-kernel edges as cell metadata, using the exact mechanism
`VISION.md` already designed for widgets — JEP 103's shorthand metadata
block, one more key:

    ```python {jupyter.code-cell}
    :imports: {temps: cell:c7a3f21b}

    import numpy as np
    fahrenheit = (np.array(temps) * 9/5) + 32
    ```

`temps` here was defined in a MATLAB cell (`c7a3f21b`); the pragma is the
edge. No magic cross-language name resolution attempted — that's a v2
problem, and Kernel-FFI's source-rewriting approach is the reference to
study if/when it's tackled.

**Cross-kernel values serialize through a shared schema, not a shared
heap.** Each kernel's own WASM memory stays isolated — the exchange format
is the workspace-snapshot shape `runmat-jupyter`'s variable browser already
uses (`{name, className/dtype, shape, preview}` for structured values, JSON
for scalars/arrays). Good enough for numbers, strings, arrays, structs/dicts
across all three languages today; Kernel-FFI-style live object references
(so a Python object stays a Python object, callable from R) is explicitly
out of scope for v1.

**Widgets upgrade from Streamlab's hack to the real protocol.** Streamlab's
`sl_*` marker-over-stdout approach was a workaround for RunMat 0.6.1 having
no other channel (`global` is broken, documented in `runmat-lab`). Inside
the real Jupyter kernel protocol, there's a better channel already:
`comm_open`/`comm_msg` — the same mechanism `runmat-jupyter`'s variable
browser already uses in production. Widget state becomes a comm, the way
`ipywidgets` actually works upstream, instead of parsing `%%SL%%{...}` out
of a stdout stream. Strictly an upgrade, and it's already proven working
code in this org's own repo.

## Relationship to `VISION.md` (main branch)

Generalizes it, doesn't discard it. What carries over unchanged: the
`.rerun.m` / `.nb.md` dual-format idea, the `⟳`/JEP-103 pragma pattern
(now carrying `:imports:` alongside `:widget:`), the WYSIWYG-writes-code
concept. What changes: the execution substrate goes from "one embedded
RunMat session" to "N supervised Jupyter-protocol kernel workers via
JupyterLite's existing machinery," and RunMat's role goes from "the only
language" to "one of three peer kernels, already the most mature of the
three in this org specifically."

## Deployment

- webR **requires** COOP/COEP cross-origin isolation to run at all beyond a
  toy.
- pyodide-kernel adapts (`coincident` if isolated, `comlink` fallback if
  not) — works either way, faster if isolated.
- RunMat's wasm build has run fine with no special headers in every hands-on
  test this session (ReRun, Signal Lab, both compat surveys).

Net: numerical.run should default to serving cross-origin-isolated, since
that's a strict requirement for one of the three kernels and a pure
upgrade for another — not a new deployment category, the same header
requirement `signal-lab.mjs`'s own doc comments already flag for
ffmpeg.wasm's multithreaded core.

## Open questions / real risks, not glossed over

- **Is polyglot actually wanted, or is single-language-reactive (main
  branch's scope) the sharper product?** Polyglot Notebooks' deprecation
  cuts both ways — real gap, but also a data point that even Microsoft
  didn't find it worth sustaining. Worth being honest that this is the
  bigger bet, not the safer one.
- **`:imports:` pragma UX** — explicit and honest, but it's manual
  bookkeeping the moment a notebook has real cross-language flow. Read
  Kernel-FFI in full before deciding whether automatic inference is
  worth attempting for v2.
- **Read "When Are Reactive Notebooks Not Reactive?" before finalizing DAG
  rerun semantics** — don't assume ReRun's current rules generalize
  cleanly to a multi-kernel setting without checking against known failure
  modes first.
- **Scope discipline.** Three kernels, a cross-kernel DAG, a pragma system,
  a widget layer, and a WYSIWYG editor is a lot of "new." If this branch is
  the direction, the reactive-DAG-over-standard-kernel-protocol piece — nothing
  polyglot yet, just proving the orchestrator pattern against `runmat-jupyter`
  alone — is the honest first slice, not the three-language version.

---

Not built. This is the research-and-reframe pass, on its own branch per
what was asked — a deliberate alternative to weigh against `VISION.md`,
not a silent replacement of it.
