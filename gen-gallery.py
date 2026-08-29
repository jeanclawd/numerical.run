#!/usr/bin/env python3
"""Generate the demo gallery manifest + thumbnails.

For each example .nb.md: load it in App view (headless), read its nr_demo()
title/description, and screenshot its first figure/heatmap as the thumbnail.
Writes host/gallery.json and host/thumbs/<name>.png (committed, served as-is).

Usage: python3 gen-gallery.py [base_url]   (default http://127.0.0.1:8153/numerical/)
"""
import json, sys, pathlib
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8153/numerical/").rstrip("/") + "/"
HOST = pathlib.Path(__file__).resolve().parent / "host"
THUMBS = HOST / "thumbs"; THUMBS.mkdir(exist_ok=True)
EXAMPLES = ["waves.nb.md", "signal.nb.md", "knn.nb.md", "hello.nb.md"]

manifest = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome",
                          args=["--no-sandbox", "--disable-gpu", "--force-color-profile=srgb"])
    pg = b.new_page(viewport={"width": 900, "height": 900}, device_scale_factor=2)
    pg.goto(BASE, wait_until="load", timeout=60000)
    pg.wait_for_function("()=>/ran/.test(document.getElementById('status2').textContent)", timeout=90000)
    for name in EXAMPLES:
        pg.select_option("#example", name)
        pg.wait_for_function("()=>/ran/.test(document.getElementById('status2').textContent)", timeout=120000)
        pg.wait_for_timeout(900)
        # switch to App view for a clean render, then read metadata
        pg.click('#nav-app'); pg.wait_for_timeout(1200)
        meta = pg.evaluate("() => window.__numerical.demo") or {}
        title = meta.get("title") or name.replace(".nb.md", "")
        desc = meta.get("description") or ""
        thumb = None
        # first figure or heatmap → thumbnail
        el = pg.query_selector("#pv-app .nr-figure, #pv-app .nr-heatmap")
        if el:
            fn = name.replace(".nb.md", "") + ".png"
            el.screenshot(path=str(THUMBS / fn))
            thumb = "thumbs/" + fn
        manifest.append({"file": name, "title": title, "description": desc, "thumb": thumb})
        print(f"{name}: title={title!r} thumb={thumb}")
        # back to notebook for the next select (App view has no #example? it does — edit-only). reset:
        pg.click('#nav-edit'); pg.wait_for_timeout(300)
    b.close()

(HOST / "gallery.json").write_text(json.dumps(manifest, indent=2) + "\n")
print("wrote host/gallery.json with", len(manifest), "entries")
