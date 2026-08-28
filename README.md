# numerical.run

Merging [`rerun`](https://github.com/jeanclawd/rerun) (a reactive `.m`
notebook, marimo/Pluto.jl-inspired) and
[`streamlab`](https://github.com/jeanclawd/streamlab) (Streamlit's model on
the RunMat runtime) into one project: ReRun's reactive DAG engine, running
Streamlab's widget library, serialized to a portable notebook format that
stays `.m`-compatible (no `.mlx`, no proprietary format, no new MATLAB
syntax — widgets are plain function calls, layout rides in comments) with a
markdown-native sibling format for broader interop.

Two views over one document, one live session: a **notebook view** for
building (ReRun's cell/DAG UI, unchanged), and an **app view** for using
(Streamlab's widgets-in-place rendering, unchanged) — plus a WYSIWYG editor
that writes the same widget calls a developer would type by hand.

Design/scoping stage — see [`VISION.md`](VISION.md) for the full writeup:
the execution-model tension between the two source projects and how it
resolves, the notebook format and its pragma vocabulary, what's reused
verbatim from each repo vs. genuinely new, the IP posture, and the
inspirations (marimo, Pluto.jl, Jupyter, Streamlit, Jupytext/MyST-NB/Quarto)
this draws on honestly rather than by name-drop.

Private. Nothing here is built yet.

---

<sub>RunMat™ is a registered trademark of Dystr, Inc. MATLAB® is a registered trademark of The MathWorks, Inc. numerical.run is not affiliated with, endorsed by, or sponsored by Dystr, Inc or The MathWorks, Inc.</sub>
