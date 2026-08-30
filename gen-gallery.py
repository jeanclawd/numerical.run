#!/usr/bin/env python3
"""Regenerate demo thumbnails.

Loads each example in App view (headless) and screenshots its first figure/heatmap
into host/thumbs/<name>.png — the images the gallery notebook (examples/gallery.nb.md)
links to. Run after adding/changing a demo. Requires a local server serving the
built site (default http://127.0.0.1:8153/numerical/).

Usage: python3 gen-gallery.py [base_url]
"""
import sys, pathlib
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8153/numerical/").rstrip("/") + "/"
THUMBS = pathlib.Path(__file__).resolve().parent / "host" / "thumbs"; THUMBS.mkdir(exist_ok=True)
EXAMPLES = ["waves.nb.md", "signal.nb.md", "knn.nb.md"]   # demos that produce a figure

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome",
                          args=["--no-sandbox", "--disable-gpu", "--force-color-profile=srgb"])
    pg = b.new_page(viewport={"width": 900, "height": 900}, device_scale_factor=2)
    for name in EXAMPLES:
        pg.goto(f"{BASE}?doc=examples/{name}", wait_until="load", timeout=60000)
        pg.wait_for_function("()=>/ran/.test(document.getElementById('status2').textContent)", timeout=120000)
        pg.wait_for_timeout(1000)
        el = pg.query_selector("#pv-app .nr-figure, #pv-app .nr-heatmap")
        if el:
            el.screenshot(path=str(THUMBS / (name.replace(".nb.md", "") + ".png")))
            print(f"{name}: thumb written")
        else:
            print(f"{name}: no figure — skipped")
    b.close()
