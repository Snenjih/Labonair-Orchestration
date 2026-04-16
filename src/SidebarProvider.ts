import * as vscode from 'vscode';
import { SessionManager } from './SessionManager';

export class SidebarProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly sessionManager: SessionManager) {
    sessionManager.onDidChangeSessions(() => {
      this._onDidChangeTreeData.fire();
    });
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
    if (element) {
      return Promise.resolve([]);
    }

    const sessions = this.sessionManager.getAllSessions();
    const items = sessions.map(({ id }) => {
      const item = new vscode.TreeItem(
        `Session ${id.slice(0, 6)}`,
        vscode.TreeItemCollapsibleState.None
      );
      item.tooltip = id;
      item.iconPath = new vscode.ThemeIcon('$(clock)');
      item.command = {
        command: 'labonair.action.focusSession',
        title: 'Focus Session',
        arguments: [id],
      };
      return item;
    });

    return Promise.resolve(items);
  }
}
