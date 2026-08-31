import * as vscode from 'vscode';
import { NbMdSerializer } from './serializer';
import { RunMatController } from './controller';
import { toNbMd } from './importers';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.workspace.registerNotebookSerializer('numerical-nb', new NbMdSerializer(), {
      transientOutputs: true,
    }),
  );

  const controller = new RunMatController(context);
  context.subscriptions.push(controller);

  context.subscriptions.push(
    vscode.commands.registerCommand('numerical.restartKernel', () => {
      controller.restart();
      vscode.window.showInformationMessage('RunMat kernel restarted.');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('numerical.openAsNotebook', async () => {
      const picks = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { Notebooks: ['ipynb', 'qmd', 'rmd', 'md', 'm', 'nb.md'] },
      });
      if (!picks || !picks.length) return;
      const uri = picks[0];
      const bytes = await vscode.workspace.fs.readFile(uri);
      const name = uri.path.split('/').pop() || '';
      const nbmd = toNbMd(new TextDecoder().decode(bytes), name);
      const doc = await vscode.workspace.openNotebookDocument(
        'numerical-nb', new NbMdSerializer().deserializeNotebook(new TextEncoder().encode(nbmd)),
      );
      await vscode.window.showNotebookDocument(doc);
    }),
  );
}

export function deactivate() { /* controller disposed via subscriptions */ }
