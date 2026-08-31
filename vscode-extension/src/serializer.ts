import * as vscode from 'vscode';
import { parseNbMd, serializeNbMd, NbCell } from './nbmd';

const dec = new TextDecoder();
const enc = new TextEncoder();

/** Round-trips *.nb.md through the shared parseNbMd/serializeNbMd so files stay
 *  byte-compatible with the web app. Cell metadata (incl. :widget:) is preserved
 *  on the VS Code cell so serializing back is lossless. */
export class NbMdSerializer implements vscode.NotebookSerializer {
  deserializeNotebook(content: Uint8Array): vscode.NotebookData {
    const doc = parseNbMd(dec.decode(content));
    const cells = doc.cells.map((c) => {
      if (c.kind === 'code') {
        const cell = new vscode.NotebookCellData(
          vscode.NotebookCellKind.Code, c.source, languageForCell(c),
        );
        cell.metadata = { nb: { lang: c.lang ?? 'matlab', meta: c.meta } };
        return cell;
      }
      const cell = new vscode.NotebookCellData(
        vscode.NotebookCellKind.Markup, c.source, 'markdown',
      );
      cell.metadata = { nb: { kind: 'markdown' } };
      return cell;
    });
    const data = new vscode.NotebookData(cells);
    if (doc.frontmatter) data.metadata = { frontmatter: doc.frontmatter };
    return data;
  }

  serializeNotebook(data: vscode.NotebookData): Uint8Array {
    const cells: NbCell[] = data.cells.map((c) => {
      const nb = (c.metadata?.nb ?? {}) as { lang?: string; meta?: Record<string, unknown> };
      if (c.kind === vscode.NotebookCellKind.Code) {
        return { kind: 'code', lang: nb.lang || 'matlab', source: c.value, meta: nb.meta || {} };
      }
      return { kind: 'markdown', source: c.value, meta: {} };
    });
    const frontmatter = (data.metadata?.frontmatter as string | undefined) ?? null;
    return enc.encode(serializeNbMd({ frontmatter, cells }));
  }
}

// RunMat runs MATLAB/Octave; VS Code's built-in grammar id for that is 'matlab'.
function languageForCell(c: NbCell): string {
  const l = (c.lang || 'matlab').toLowerCase();
  if (l === 'octave' || l === 'm') return 'matlab';
  return l || 'matlab';
}
