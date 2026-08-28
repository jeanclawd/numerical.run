#!/usr/bin/env python3
"""Render numerical.run's README + VISION into one static page.

Output: /opt/sites/numerical/index.html — served (basicauth-gated, private
repo) at jean-clawd.com/numerical/. Re-run after editing the markdown.
"""
import pathlib
import markdown

SRC = pathlib.Path(__file__).resolve().parent
OUT = pathlib.Path("/opt/sites/numerical")
OUT.mkdir(parents=True, exist_ok=True)

md = markdown.Markdown(
    extensions=["fenced_code", "tables", "toc", "sane_lists", "attr_list"]
)

def render(name):
    text = (SRC / name).read_text(encoding="utf-8")
    md.reset()
    return md.convert(text)

readme = render("README.md")
vision = render("VISION.md")

html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>numerical.run</title>
<style>
:root {{
  --bg:#fbfbfa; --fg:#1a1a1a; --muted:#6b7280; --rule:#e5e7eb;
  --accent:#5b52e0; --code-bg:#f3f2f7; --card:#ffffff;
}}
@media (prefers-color-scheme: dark) {{
  :root {{
    --bg:#0f0e17; --fg:#e6e5ef; --muted:#9a97b5; --rule:#26243a;
    --accent:#9b91ff; --code-bg:#1a1826; --card:#161425;
  }}
}}
* {{ box-sizing:border-box; }}
html {{ scroll-behavior:smooth; }}
body {{
  margin:0; background:var(--bg); color:var(--fg);
  font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;
}}
.wrap {{ max-width:760px; margin:0 auto; padding:3.5rem 1.4rem 6rem; }}
.badge {{
  display:inline-block; font-size:.72rem; font-weight:600; letter-spacing:.06em;
  text-transform:uppercase; color:var(--accent); border:1px solid var(--accent);
  border-radius:999px; padding:.18rem .6rem; margin-bottom:1rem; opacity:.85;
}}
h1 {{ font-size:2.1rem; line-height:1.15; margin:.2rem 0 .6rem; letter-spacing:-.02em; }}
h2 {{ font-size:1.35rem; margin:2.6rem 0 .8rem; letter-spacing:-.01em;
     padding-top:1.4rem; border-top:1px solid var(--rule); }}
h3 {{ font-size:1.05rem; margin:1.6rem 0 .5rem; }}
p {{ margin:.7rem 0; }}
a {{ color:var(--accent); text-decoration:none; }}
a:hover {{ text-decoration:underline; }}
hr {{ border:0; border-top:1px solid var(--rule); margin:2.5rem 0; }}
code {{ background:var(--code-bg); padding:.12em .4em; border-radius:5px;
       font:.88em/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }}
pre {{ background:var(--code-bg); padding:1rem 1.1rem; border-radius:10px;
      overflow-x:auto; border:1px solid var(--rule); }}
pre code {{ background:none; padding:0; font-size:.85em; }}
blockquote {{ margin:1rem 0; padding:.2rem 1rem; border-left:3px solid var(--accent);
             color:var(--muted); }}
table {{ border-collapse:collapse; width:100%; margin:1.2rem 0; font-size:.92rem;
        display:block; overflow-x:auto; }}
th,td {{ border:1px solid var(--rule); padding:.5rem .7rem; text-align:left;
        vertical-align:top; }}
th {{ background:var(--code-bg); font-weight:600; }}
strong {{ font-weight:650; }}
.doc {{ margin-top:1rem; }}
.divider {{ margin:4rem 0; text-align:center; color:var(--muted);
           font-size:.8rem; letter-spacing:.15em; text-transform:uppercase; }}
.divider::before,.divider::after {{ content:"·  "; }}
footer {{ margin-top:4rem; padding-top:1.5rem; border-top:1px solid var(--rule);
         color:var(--muted); font-size:.82rem; }}
</style>
</head>
<body>
<div class="wrap">
  <span class="badge">private · design / scoping</span>
  <article class="doc">{readme}</article>
  <div class="divider">Vision</div>
  <article class="doc">{vision}</article>
  <footer>
    jeanclawd/numerical.run — private repository. Rendered from README.md and
    VISION.md; nothing here is built yet.
  </footer>
</div>
</body>
</html>
"""

(OUT / "index.html").write_text(html, encoding="utf-8")
print(f"wrote {OUT/'index.html'} ({len(html)} bytes)")
