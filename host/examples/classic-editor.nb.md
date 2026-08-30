# The classic editor

Every notebook opens in one of two editors, chosen from the **Editor** button in
the header (or the `?editor=` URL flag):

- **Notebook** *(default)* — the notebook *is* the editor: a stack of editable
  cells, each with its own **▸ Run**, executed statefully against a persistent
  workspace. This is the Jupyter-style experience.
- **Classic** — one Monaco editor over the *whole* `.nb.md` document on the left,
  and the rendered **App** on the right. There is a single **Run** button in the
  header that reruns the entire document top-to-bottom on one RunMat kernel.

Reach for the classic editor when you want to see and edit the full source at
once — markdown prose, cell fences and code together — the way you would edit a
plain file, while watching the app rerun beside it.

+++

## What it looks like

![The classic editor: Monaco over the whole .nb.md on the left, the live App on the right](thumbs/classic-editor.png)

On the left, the complete `.nb.md` source: markdown, the `+++` cell separators
and the ```` ```matlab {jupyter.code-cell} ```` fences that mark executable code.
On the right, exactly what a visitor sees in **App** mode — title, prose, the
`nr_*` widgets and every figure — refreshed each time you hit **Run** (or `⌘↵`).

+++

## When to use which

| | Notebook | Classic |
|---|---|---|
| Layout | one editable cell at a time | whole document in one Monaco |
| Run | per-cell **▸ Run** (stateful) | one header **Run** (full rerun) |
| Best for | exploring, iterating cell by cell | editing the file as a whole, authoring apps |
| URL | *(default)* | `?editor=classic` |

Both editors drive the **same** kernel, the same `nr_*` widget library and the
same `.nb.md` file — switching editors never changes your document, only how you
edit it. Add `&edit` to open straight into the editor; drop it to view the App.

+++

A tiny app to try below — flip to the **classic editor** and edit the source
on the left, or drag the slider in **App** mode:

```matlab {jupyter.code-cell}
n = nr_slider('samples', 20, 200, 80, 10);
x = linspace(0, 2*pi, n);
figure; plot(x, gather(sin(x)), 'LineWidth', 2);
title(sprintf('sin over %d samples', n));
nr_figure();
nr_metric('samples', n, '%d');
```
