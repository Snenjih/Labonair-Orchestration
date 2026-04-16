import * as vscode from 'vscode';
import { SessionManager } from './SessionManager';
import { SessionStatus } from './shared/types';

function statusIcon(status: SessionStatus): vscode.ThemeIcon {
  switch (status) {
    case 'idle':             return new vscode.ThemeIcon('clock');
    case 'working':          return new vscode.ThemeIcon('sync~spin');
    case 'permission_required':
      return new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.orange'));
    case 'finished':
      return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
    case 'error':
      return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
  }
}

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
    if (element) { return Promise.resolve([]); }

    const items = this.sessionManager.getAllSessions().map(({ id, state }) => {
      const item = new vscode.TreeItem(state.label, vscode.TreeItemCollapsibleState.None);
      item.tooltip = id;
      item.description = state.status;
      item.iconPath = statusIcon(state.status);
      item.contextValue = 'labonair.session';
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
