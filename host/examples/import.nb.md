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

**By gist** — add `?gist=` with a gist id (or a raw gist URL); the first file is
converted by its extension:

```
https://numerical.run/?gist=fcece655bfb3a6b9fba9af55614021e7
```

**By URL** — add `?doc=` pointing at any raw file:

```
https://numerical.run/?doc=https://gist.githubusercontent.com/jeanclawd/fcece655bfb3a6b9fba9af55614021e7/raw/square-wave.ipynb
```

+++

## Try it

The same damped-wave demo in three formats. Open one — it converts and runs
immediately — then switch to the editor to see the `.nb.md` it became. **View
source** opens the original gist.

| Format | Open (by gist) | Open (by raw URL) | Source |
|---|---|---|---|
| Jupyter `.ipynb` | [open →](?gist=fcece655bfb3a6b9fba9af55614021e7) | [open →](?doc=https://gist.githubusercontent.com/jeanclawd/fcece655bfb3a6b9fba9af55614021e7/raw/square-wave.ipynb) | [square-wave.ipynb](https://gist.github.com/jeanclawd/fcece655bfb3a6b9fba9af55614021e7) |
| Quarto `.qmd` | [open →](?gist=7e956e2da560d9ed4f6c9dd9cb38208e) | [open →](?doc=https://gist.githubusercontent.com/jeanclawd/7e956e2da560d9ed4f6c9dd9cb38208e/raw/damped.qmd) | [damped.qmd](https://gist.github.com/jeanclawd/7e956e2da560d9ed4f6c9dd9cb38208e) |
| MATLAB `.m` | [open →](?gist=be7ffb28b4da1e8d296a2de7f00c4810) | [open →](?doc=https://gist.githubusercontent.com/jeanclawd/be7ffb28b4da1e8d296a2de7f00c4810/raw/chirp.m) | [chirp.m](https://gist.github.com/jeanclawd/be7ffb28b4da1e8d296a2de7f00c4810) |

Prefer full links? These open the public site directly:

- `https://numerical.run/?gist=fcece655bfb3a6b9fba9af55614021e7` — [open →](https://numerical.run/?gist=fcece655bfb3a6b9fba9af55614021e7)
- `https://numerical.run/?gist=7e956e2da560d9ed4f6c9dd9cb38208e` — [open →](https://numerical.run/?gist=7e956e2da560d9ed4f6c9dd9cb38208e)
- `https://numerical.run/?gist=be7ffb28b4da1e8d296a2de7f00c4810` — [open →](https://numerical.run/?gist=be7ffb28b4da1e8d296a2de7f00c4810)

Every one lands as a running notebook — no upload, no install, converted entirely
in your browser.
