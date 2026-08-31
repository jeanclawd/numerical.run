# The classic editor

By default a notebook opens in the **notebook editor**: a stack of editable
cells, each with its own **▸ Run**, executed statefully against a persistent
workspace — the Jupyter-style experience.

There is a second, hidden editor — think of it as an **Easter egg**. Add
`?editor=classic` to the URL and you get one Monaco editor over the *whole*
`.nb.md` document on the left, with the rendered **App** on the right and a
single **Run** in the header that reruns the entire document top-to-bottom.
The header buttons only switch between editing and the App view — the classic
editor has no button, it lives entirely behind that URL flag.

+++

## What it looks like

![The classic editor: Monaco over the whole .nb.md on the left, the live App on the right](thumbs/classic-editor.png)

On the left, the complete `.nb.md` source — markdown, the `+++` cell separators,
and the fenced code blocks that hold executable code. On the right, exactly what
a visitor sees in **App** mode — title, prose, the `nr_*` widgets and every
figure — refreshed each time you hit **Run** (or `⌘↵`).

+++

## Notebook vs. classic

| | Notebook *(default)* | Classic *(Easter egg)* |
|---|---|---|
| Layout | one editable cell at a time | whole document in one Monaco |
| Run | per-cell **▸ Run** (stateful) | one header **Run** (full rerun) |
| Best for | exploring, iterating cell by cell | editing the file as a whole |
| How to open | just open the notebook | add `?editor=classic` to the URL |

Both editors drive the **same** kernel, the same `nr_*` widget library and the
same `.nb.md` file — switching never changes your document, only how you edit it.
Add `&edit` to open straight into the editor; drop it to view the App.

+++

## The `.nb.md` format

A code cell is a fenced block tagged with `matlab {jupyter.code-cell}`; prose
lives between `+++` separators. A cell looks like this:

```
n = nr_slider('samples', 20, 200, 80, 10);
x = linspace(0, 2*pi, n);
figure; plot(x, gather(sin(x)), 'LineWidth', 2);
nr_figure();
```

Delete the `:widget:` metadata and it's still a plain Markdown Jupyter notebook
any JEP-103 tool can read.

+++

A live version of that cell — flip to the classic editor with `?editor=classic`
to edit the whole source at once, or just drag the slider here in **App** mode:

```matlab {jupyter.code-cell}
n = nr_slider('samples', 20, 200, 80, 10);
x = linspace(0, 2*pi, n);
figure; plot(x, gather(sin(x)), 'LineWidth', 2);
title(sprintf('sin over %d samples', n));
nr_figure();
nr_metric('samples', n, '%d');
```
