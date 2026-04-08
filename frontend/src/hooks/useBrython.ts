import { useCallback } from 'react';

export type ConsoleEntry = {
  type: 'output' | 'error' | 'info' | 'input';
  text: string;
  details?: string;
  line?: number;
  /** 'compile' = error en python_to_js, 'runtime' = error en execució */
  phase?: 'compile' | 'runtime';
};

/** Returned synchronously after each call to run(). */
export type RunResult =
  | { status: 'done'; entries: ConsoleEntry[] }
  | { status: 'stdin_needed'; entries: ConsoleEntry[] };

function countLines(text: string): number {
  return text.split('\n').length;
}

function wrappedToUserLine(wrappedLine: number, userCodeStartLine: number): number {
  const mapped = wrappedLine - userCodeStartLine + 1;
  return mapped > 0 ? mapped : wrappedLine;
}

function remapTracebackToUserCode(text: string, userCodeStartLine: number): string {
  let remapped = text;

  remapped = remapped.replace(
    /File\s+"([^"]*)",\s+line\s+(\d+)/g,
    (_match, _file, lineText: string) => {
      const wrappedLine = Number(lineText);
      const userLine = wrappedToUserLine(wrappedLine, userCodeStartLine);
      return `File "codi_usuari.py", line ${userLine}`;
    }
  );

  remapped = remapped.replace(/\bline\s+(\d+)\b/g, (match, lineText: string) => {
    const wrappedLine = Number(lineText);
    if (!Number.isFinite(wrappedLine)) return match;
    const userLine = wrappedToUserLine(wrappedLine, userCodeStartLine);
    return `line ${userLine}`;
  });

  return remapped;
}

function extractErrorHeadline(errorText: string): string | null {
  const lines = errorText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const explicitErrorLine = lines.find((line) =>
    /(?:SyntaxError|IndentationError|TabError|NameError|TypeError|ZeroDivisionError|IndexError|KeyError|ValueError|AttributeError|ImportError|ModuleNotFoundError|RuntimeError|Exception|Error):/.test(line)
  );
  if (explicitErrorLine) return explicitErrorLine;

  const firstUsefulLine = lines.find((line) => !/^File\s+"/.test(line) && !/^Traceback/.test(line));
  return firstUsefulLine ?? null;
}

function formatExecutionError(err: unknown, userCodeStartLine: number): { summary: string; details: string } {
  const unknown = "Error desconegut durant l'execució.";
  if (!err) return { summary: unknown, details: unknown };

  let remapped = '';

  if (typeof err === 'string') {
    remapped = remapTracebackToUserCode(err, userCodeStartLine);
  }
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
    if (lines.length > 0) {
      const raw = lines.join('\n');
      remapped = remapTracebackToUserCode(raw, userCodeStartLine);
    }
  }

  if (!remapped) {
    remapped = remapTracebackToUserCode(String(err), userCodeStartLine);
  }

  const firstUserLineMatch = remapped.match(/\bline\s+(\d+)\b/);
  const isCompileError = /(SyntaxError|IndentationError|TabError)/.test(remapped);
  const phase = isCompileError ? 'compilació' : 'execució';
  const lineHint = firstUserLineMatch ? ` (línia ${firstUserLineMatch[1]})` : '';
  const headline = extractErrorHeadline(remapped);

  const summary = [
    `Error de ${phase}${lineHint}.`,
    headline,
  ].filter(Boolean).join('\n');

  return { summary, details: remapped };
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
    const wrapperPrefix = `import sys
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

# __PYLAMOS_USER_CODE_START__
`;
    const userCodeStartLine = countLines(wrapperPrefix);

    // Acumular stderr en un buffer en lloc d'afegir entrades directament.
    // Brython escriu el traceback sencer per stderr I llança una excepció;
    // d'aquesta manera evitem duplicats i usem el traceback raw com a 'details'.
    let stderrBuffer = '';
    B.stderr = {
      write: (text: string) => { if (text) stderrBuffer += text; },
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

    const wrapped = `${wrapperPrefix}${code}\n`;

    // — Fase de compilació (python_to_js) ————————————————————————————
    stderrBuffer = '';
    let compiledJs: string;
    try {
      compiledJs = B.python_to_js(wrapped, '__main__', 1);
    } catch (err: any) {
      const formatted = formatExecutionError(err, userCodeStartLine);
      const rawDetails = stderrBuffer ? remapTracebackToUserCode(stderrBuffer, userCodeStartLine) : undefined;
      entries.push({
        type: 'error',
        text: formatted.summary + '\n',
        details: rawDetails ?? formatted.details,
        phase: 'compile',
      });
      return { status: 'done', entries };
    }

    // — Fase d'execució —————————————————————————————————————————————
    stderrBuffer = '';
    try {
      new Function(compiledJs)();
      if ((window as any).__PYLAMOS_STDIN_NEEDED) {
        return { status: 'stdin_needed', entries };
      }
      // Stderr pot tenir warnings que no han llançat excepció
      if (stderrBuffer) {
        const remapped = remapTracebackToUserCode(stderrBuffer, userCodeStartLine);
        const formatted = formatExecutionError(remapped, userCodeStartLine);
        entries.push({ type: 'error', text: formatted.summary + '\n', details: formatted.details, phase: 'runtime' });
      }
      return { status: 'done', entries };
    } catch (err: any) {
      if ((window as any).__PYLAMOS_STDIN_NEEDED) {
        return { status: 'stdin_needed', entries };
      }
      const formatted = formatExecutionError(err, userCodeStartLine);
      // Prioritzem el traceback raw del stderr (més complet que l'objecte d'excepció JS)
      const details = stderrBuffer
        ? remapTracebackToUserCode(stderrBuffer, userCodeStartLine)
        : formatted.details;
      entries.push({
        type: 'error',
        text: formatted.summary + '\n',
        details,
        phase: 'runtime',
      });
      return { status: 'done', entries };
    }
  }, []);

  return { run };
}
