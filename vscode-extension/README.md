# numerical.run — VS Code extension

Open `.nb.md` files as native VS Code notebooks and run MATLAB/Octave cells on the
RunMat kernel, with figures inline. Same `.nb.md` format and kernel as the web app.

## Status

Early scaffold (issue #13). Working:

- **Notebook serializer** — `*.nb.md` ⇄ VS Code notebook cells, lossless round-trip
  (markdown cells, `matlab {jupyter.code-cell}` code cells, `:widget:` metadata
  preserved). Shares `parseNbMd`/`serializeNbMd` with the web app.
- **Kernel controller** — runs code cells on the RunMat WASM kernel (hosted in a
  webview), returning text output and `image/svg+xml` figures. Stateful workspace;
  **numerical.run: Restart RunMat kernel** resets it.
- **Import** — **numerical.run: Open file as notebook** converts `.ipynb` / `.qmd` /
  `.Rmd` / `.md` / `.m` via the shared importers and opens the result.

## Develop

```bash
npm install
npm run bundle-assets   # populate media/runtime/ (figrender, lib.m, RunMat WASM)
npm run compile         # or: npm run watch
```

Then press **F5** in VS Code to launch an Extension Development Host and open any
`.nb.md`.

## Layout

- `src/nbmd.ts` — the `.nb.md` parser/serializer (ported from the web app).
- `src/serializer.ts` — `NotebookSerializer` mapping to/from VS Code cells.
- `src/controller.ts` — `NotebookController` + the webview kernel bridge.
- `src/importers.ts` — foreign-format → `.nb.md` (ported from the web app).
- `media/runtime/` — bundled kernel assets (git-ignored; created by `bundle-assets`).

## Notes

The RunMat kernel is a browser WASM build, so it runs in a webview and results are
bridged over `postMessage`. Keeping `nbmd`/`importers` ported (not forked) keeps the
extension and the site in sync.
