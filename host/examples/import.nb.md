# Import your notebooks

numerical.run reads more than its own `.nb.md` format. Point it at a Jupyter
notebook, a Quarto / R Markdown document, or a MATLAB live script and it is
converted to a `.nb.md` on load — then it edits, runs, and shares like any other
notebook here.

> Only **MATLAB / Octave** code executes on the RunMat kernel. Cells in other
> languages (Python, R, …) still import as code cells — you see them, but they
> won't run. The prose, structure and math come across regardless.

+++

## Supported formats

| Format | Extension | Notes |
|---|---|---|
| Jupyter | `.ipynb` | markdown + code cells, kernel language detected |
| Quarto / R Markdown | `.qmd`, `.Rmd` | fenced code blocks become cells |
| Jupytext / MyST | `.md` | fenced code blocks become cells |
| MATLAB live script | `.m` | `%%` sections → cells, `%` comment runs → prose |

Anything already tagged as a `.nb.md` code cell passes through untouched.

+++

## Two ways to open one

**By URL** — add `?doc=` pointing at a raw file:

```
numerical.run/?doc=https://example.com/analysis.ipynb
```

**By gist** — add `?gist=` with a gist id (or its raw URL); the first file is
converted by its extension:

```
numerical.run/?gist=<gist-id>
```

+++

## Try it

Live conversions of the same demo in three formats — open one, then flip to the
editor to see the `.nb.md` it became:

- [Jupyter `.ipynb` →](?gist=fcece655bfb3a6b9fba9af55614021e7)
- [Quarto `.qmd` →](?gist=7e956e2da560d9ed4f6c9dd9cb38208e)
- [MATLAB `.m` live script →](?gist=be7ffb28b4da1e8d296a2de7f00c4810)

Each one lands as a running notebook — no upload, no install, converted entirely
in your browser.
