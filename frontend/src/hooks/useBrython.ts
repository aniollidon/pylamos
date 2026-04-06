import { useCallback } from 'react';

export type ConsoleEntry = { type: 'output' | 'error' | 'info' | 'input'; text: string };

/** Returned synchronously after each call to run(). */
export type RunResult =
  | { status: 'done'; entries: ConsoleEntry[] }
  | { status: 'stdin_needed'; entries: ConsoleEntry[] };

function formatExecutionError(err: unknown): string {
  if (!err) return "Error desconegut durant l'execució.";
  if (typeof err === 'string') return err;
  if (typeof err === 'object') {
    const e = err as {
      name?: string;
      message?: string;
      info?: string;
      stack?: string;
      args?: unknown[];
    };
    const lines: string[] = [];
    const head = [e.name, e.message].filter(Boolean).join(': ');
    if (head) lines.push(head);
    if (Array.isArray(e.args) && e.args.length > 0)
      lines.push(`args: ${e.args.map((x) => String(x)).join(', ')}`);
    if (e.info) lines.push(e.info);
    if (e.stack) lines.push(e.stack);
    if (lines.length > 0) return lines.join('\n');
  }
  return String(err);
}

export function useBrython() {
  const run = useCallback((code: string, stdinLines: string[], randomSeed: number): RunResult => {
    const entries: ConsoleEntry[] = [];

    const B = (window as any).__BRYTHON__;
    if (!B) {
      entries.push({ type: 'error', text: 'Brython no està carregat. Recarrega la pàgina.\n' });
      return { status: 'done', entries };
    }

    B.stdout = {
      write: (text: string) => { if (text) entries.push({ type: 'output', text }); },
      flush: () => {},
    };
    B.stderr = {
      write: (text: string) => { if (text) entries.push({ type: 'error', text }); },
      flush: () => {},
    };

    // Use a window flag so the signal survives Brython's exception wrapping.
    (window as any).__PYLAMOS_STDIN_NEEDED = false;
    (window as any).__PYLAMOS_STDIN_QUEUE = [...stdinLines];
    (window as any).__PYLAMOS_READ_STDIN = () => {
      const queue = (window as any).__PYLAMOS_STDIN_QUEUE as string[];
      if (queue.length === 0) {
        (window as any).__PYLAMOS_STDIN_NEEDED = true;
        throw new Error('__PYLAMOS_STDIN_NEEDED__');
      }
      return queue.shift();
    };
    // Echo consumed input in green (called by Python wrapper after a successful read).
    (window as any).__PYLAMOS_ECHO_INPUT = (val: string) => {
      entries.push({ type: 'input', text: val + '\n' });
    };

    const wrapped = `import sys
import random as _random
from browser import window as _win

class _Out:
    def write(self, s):
        if s:
            _win.__BRYTHON__.stdout.write(s)
    def flush(self): pass

class _Err:
    def write(self, s):
        if s:
            _win.__BRYTHON__.stderr.write(s)
    def flush(self): pass

sys.stdout = _Out()
sys.stderr = _Err()

# Fix the random seed so re-executions (needed for interactive input) are deterministic.
_random.seed(${randomSeed})

def input(prompt=""):
    if prompt:
        sys.stdout.write(str(prompt))
    val = _win.__PYLAMOS_READ_STDIN()
    _win.__PYLAMOS_ECHO_INPUT(str(val))
    return str(val)

${code}
`;

    try {
      const js = B.python_to_js(wrapped, '__main__', 1);
      new Function(js)();
      // Also check flag in case throw was caught inside user code.
      if ((window as any).__PYLAMOS_STDIN_NEEDED) {
        return { status: 'stdin_needed', entries };
      }
      return { status: 'done', entries };
    } catch (err: any) {
      if ((window as any).__PYLAMOS_STDIN_NEEDED) {
        return { status: 'stdin_needed', entries };
      }
      entries.push({ type: 'error', text: formatExecutionError(err) + '\n' });
      return { status: 'done', entries };
    }
  }, []);

  return { run };
}
