declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState<T>(state: T): T;
};

const vscodeApi = (() => {
  // acquireVsCodeApi may only be called once per webview lifetime
  if (typeof acquireVsCodeApi === 'function') {
    return acquireVsCodeApi();
  }
  // Fallback for local dev outside VS Code
  return {
    postMessage: (msg: unknown) => console.log('[vscode stub] postMessage', msg),
    getState: () => undefined,
    setState: <T>(s: T) => s,
  };
})();

export const vscode = {
  postMessage: (message: unknown) => vscodeApi.postMessage(message),
  getState: () => vscodeApi.getState(),
  setState: <T>(state: T) => vscodeApi.setState(state),
};
