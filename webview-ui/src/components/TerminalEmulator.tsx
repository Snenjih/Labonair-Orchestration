import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface TerminalEmulatorHandle {
  writeOutput: (text: string) => void;
}

interface Props {
  hidden?: boolean;
}

const TerminalEmulator = forwardRef<TerminalEmulatorHandle, Props>(({ hidden }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useImperativeHandle(ref, () => ({
    writeOutput(text: string) {
      termRef.current?.write(text);
    },
  }));

  useEffect(() => {
    const term = new Terminal({
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
      },
      fontFamily: 'var(--vscode-editor-font-family, "Cascadia Code", monospace)',
      fontSize: 13,
      cursorBlink: false,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    termRef.current = term;
    fitAddonRef.current = fitAddon;

    if (containerRef.current) {
      term.open(containerRef.current);
      fitAddon.fit();
    }

    const onResize = () => fitAddon.fit();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Re-fit when visibility is restored
  useEffect(() => {
    if (!hidden) {
      requestAnimationFrame(() => fitAddonRef.current?.fit());
    }
  }, [hidden]);

  return (
    <div
      ref={containerRef}
      className="terminal-container"
      style={{ display: hidden ? 'none' : 'flex', flex: 1, minHeight: 0 }}
    />
  );
});

TerminalEmulator.displayName = 'TerminalEmulator';
export default TerminalEmulator;
