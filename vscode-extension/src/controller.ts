import * as vscode from 'vscode';
import * as fs from 'fs';

/** Executes code cells on the RunMat WASM kernel. The kernel is a browser build,
 *  so it runs inside a webview; this controller bridges execute requests/results
 *  over postMessage. Execution is stateful (persistent workspace) to match the
 *  web app's notebook mode; "Restart kernel" resets the session. */
export class RunMatController {
  static readonly id = 'runmat';
  static readonly notebookType = 'numerical-nb';

  private readonly controller: vscode.NotebookController;
  private host: KernelHost | undefined;
  private order = 0;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.controller = vscode.notebooks.createNotebookController(
      RunMatController.id, RunMatController.notebookType, 'RunMat',
    );
    this.controller.supportedLanguages = ['matlab'];
    this.controller.supportsExecutionOrder = true;
    this.controller.executeHandler = this.execute.bind(this);
  }

  restart() { this.host?.reset(); }

  dispose() { this.host?.dispose(); this.controller.dispose(); }

  private host_() {
    if (!this.host) this.host = new KernelHost(this.context);
    return this.host;
  }

  private async execute(cells: vscode.NotebookCell[]): Promise<void> {
    const host = this.host_();
    for (const cell of cells) {
      const exec = this.controller.createNotebookCellExecution(cell);
      exec.executionOrder = ++this.order;
      exec.start(Date.now());
      try {
        const res = await host.exec(cell.document.getText());
        const outputs: vscode.NotebookCellOutput[] = [];
        if (res.text && res.text.trim()) {
          outputs.push(new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.text(res.text, 'text/plain'),
          ]));
        }
        for (const svg of res.figures) {
          outputs.push(new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.text(svg, 'image/svg+xml'),
          ]));
        }
        if (res.error) {
          outputs.push(new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.error({ name: 'RunMat', message: res.error }),
          ]));
        }
        await exec.replaceOutput(outputs);
        exec.end(!res.error, Date.now());
      } catch (err) {
        await exec.replaceOutput([new vscode.NotebookCellOutput([
          vscode.NotebookCellOutputItem.error(err as Error),
        ])]);
        exec.end(false, Date.now());
      }
    }
  }
}

interface ExecResult { text: string; figures: string[]; error: string | null; }

/** Owns the hidden-ish webview that hosts the WASM kernel and serializes
 *  execute requests to it. Assets (runtime, figrender, lib.m) come from the
 *  bundled `media/runtime` folder — run `npm run bundle-assets` to populate it. */
class KernelHost {
  private panel: vscode.WebviewPanel | undefined;
  private ready: Promise<void> | undefined;
  private seq = 0;
  private readonly pending = new Map<number, (r: ExecResult) => void>();
  private resetNext = false;

  constructor(private readonly context: vscode.ExtensionContext) {}

  reset() { this.resetNext = true; }

  dispose() { this.panel?.dispose(); this.panel = undefined; this.ready = undefined; }

  private ensure(): Promise<void> {
    if (this.ready) return this.ready;
    const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    const panel = vscode.window.createWebviewPanel(
      'runmatKernel', 'RunMat kernel', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [mediaRoot] },
    );
    this.panel = panel;
    panel.onDidDispose(() => { this.panel = undefined; this.ready = undefined; });

    const wv = panel.webview;
    const runtimeBase = wv.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'runtime')).toString();
    const figrender = wv.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'runtime', 'figrender.mjs')).toString();
    const libPath = vscode.Uri.joinPath(mediaRoot, 'runtime', 'lib.m');
    let library = '';
    try { library = fs.readFileSync(libPath.fsPath, 'utf8'); } catch { /* assets not bundled yet */ }

    this.ready = new Promise<void>((resolve) => {
      wv.onDidReceiveMessage((msg: any) => {
        if (msg?.type === 'ready') {
          wv.postMessage({ type: 'init', runtimeBase, figrender, library });
        } else if (msg?.type === 'inited') {
          resolve();
        } else if (msg?.type === 'result') {
          const cb = this.pending.get(msg.id);
          if (cb) { this.pending.delete(msg.id); cb({ text: msg.text || '', figures: msg.figures || [], error: msg.error || null }); }
        }
      });
      wv.html = htmlShell(wv.cspSource);
    });
    return this.ready;
  }

  async exec(code: string): Promise<ExecResult> {
    await this.ensure();
    const id = ++this.seq;
    const reset = this.resetNext; this.resetNext = false;
    return new Promise<ExecResult>((resolve) => {
      this.pending.set(id, resolve);
      this.panel!.webview.postMessage({ type: 'exec', id, code, reset });
    });
  }
}

function htmlShell(cspSource: string): string {
  const csp = `default-src 'none'; img-src ${cspSource} data:; style-src 'unsafe-inline'; ` +
    `script-src ${cspSource} 'unsafe-inline' 'unsafe-eval'; connect-src ${cspSource};`;
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
</head><body>
<script type="module" src="${''}"></script>
<script type="module">
${KERNEL_BRIDGE}
</script>
</body></html>`;
}

// Runs inside the webview: loads the RunMat runtime + figrender, then executes
// code (with lib.m appended so nr_* exist), returning stdout and figure SVGs.
const KERNEL_BRIDGE = String.raw`
const vscodeApi = acquireVsCodeApi();
let session = null, renderFigureScene = null, library = '';
let streamBuf = '', streaming = false;

window.addEventListener('message', async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    try {
      const fig = await import(m.figrender);
      renderFigureScene = fig.renderFigureScene;
      const base = m.runtimeBase.replace(/\/$/, '');
      const web = await import(base + '/runmat_wasm_web.js');
      await web.default({ module_or_path: base + '/runmat_wasm_web_bg.wasm' });
      session = await web.initRunMat({ enableGpu: false, enableJit: false, telemetryConsent: false, logLevel: 'error', languageCompat: 'matlab' });
      try { await web.subscribeStdout((ev) => { if (streaming) streamBuf += ev.text ?? ''; }); } catch {}
      library = m.library || '';
      vscodeApi.postMessage({ type: 'inited' });
    } catch (err) {
      vscodeApi.postMessage({ type: 'inited' });
      console.error('kernel init failed', err);
    }
  } else if (m.type === 'exec') {
    const out = { type: 'result', id: m.id, text: '', figures: [], error: null };
    if (!session) { out.error = 'kernel not initialized (assets bundled?)'; vscodeApi.postMessage(out); return; }
    try {
      if (m.reset) await session.resetSession();
      streamBuf = ''; streaming = true;
      const result = await session.executeRequest({ source: { kind: 'text', name: '<cell>', text: m.code + '\n\n' + library } });
      streaming = false;
      // strip %%NR%% widget markers from the visible text
      out.text = streamBuf.split('\n').filter((l) => !l.startsWith('%%NR%%')).join('\n').replace(/\s+$/, '');
      if (result.error) out.error = (result.error.identifier || 'error') + ': ' + result.error.message;
      for (const h of (result.figuresTouched || [])) {
        try {
          const bytes = await session.exportFigureScene(h);
          if (bytes && bytes.length && renderFigureScene) {
            out.figures.push(renderFigureScene(JSON.parse(new TextDecoder().decode(bytes)), { width: 700, height: 420 }));
          }
        } catch {}
      }
    } catch (err) {
      streaming = false;
      out.error = String(err && err.message ? err.message : err);
    }
    vscodeApi.postMessage(out);
  }
});
vscodeApi.postMessage({ type: 'ready' });
`;
