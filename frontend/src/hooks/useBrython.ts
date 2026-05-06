import { useCallback } from 'react';

export type DebugCommandKind = 'start' | 'continue' | 'step' | 'step_into' | 'step_over' | 'step_out';

export type DebugCommand = {
  kind: DebugCommandKind;
  originFrameId?: string | null;
  originLine?: number | null;
};

export type DebugVariable = {
  name: string;
  type: string;
  value: string;
};

export type DebugFrame = {
  id: string;
  name: string;
  file: string;
  line: number;
  locals: DebugVariable[];
};

export type DebugSnapshot = {
  state: 'paused' | 'finished';
  event: 'line' | 'call' | 'return' | 'exception' | 'finished';
  line: number | null;
  frames: DebugFrame[];
  error?: {
    type?: string;
    message?: string;
  };
};

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

export type DebugRunResult = {
  status: 'paused' | 'finished' | 'stdin_needed' | 'error';
  entries: ConsoleEntry[];
  snapshot?: DebugSnapshot;
};

type BrythonIO = {
  write: (text: string) => void;
  flush: () => void;
};

type BrythonRuntime = {
  python_to_js: (source: string, moduleName: string, options: number) => string;
  stdout: BrythonIO;
  stderr: BrythonIO;
};

type PylamosWindow = Window & {
  __BRYTHON__?: BrythonRuntime;
  __PYLAMOS_STDIN_NEEDED?: boolean;
  __PYLAMOS_STDIN_QUEUE?: string[];
  __PYLAMOS_READ_STDIN?: () => string | undefined;
  __PYLAMOS_ECHO_INPUT?: (value: string) => void;
  __PYLAMOS_DEBUG_STATE_JSON?: string;
};

function countLines(text: string): number {
  return text.split('\n').length;
}

function getPylamosWindow(): PylamosWindow {
  return window as PylamosWindow;
}

function buildWrapperPrefix(randomSeed: number): string {
  return `import sys
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
}

function installSharedRuntime(B: BrythonRuntime, entries: ConsoleEntry[], stdinLines: string[], randomSeed: number) {
  const appWindow = getPylamosWindow();

  B.stdout = {
  write: (text: string) => { if (text) entries.push({ type: 'output', text }); },
  flush: () => {},
  };

  const wrapperPrefix = buildWrapperPrefix(randomSeed);
  const userCodeStartLine = countLines(wrapperPrefix);

  let stderrBuffer = '';
  B.stderr = {
  write: (text: string) => { if (text) stderrBuffer += text; },
  flush: () => {},
  };

  appWindow.__PYLAMOS_STDIN_NEEDED = false;
  appWindow.__PYLAMOS_STDIN_QUEUE = [...stdinLines];
  appWindow.__PYLAMOS_READ_STDIN = () => {
  const queue = appWindow.__PYLAMOS_STDIN_QUEUE ?? [];
  if (queue.length === 0) {
    appWindow.__PYLAMOS_STDIN_NEEDED = true;
    throw new Error('__PYLAMOS_STDIN_NEEDED__');
  }
  return queue.shift();
  };
  appWindow.__PYLAMOS_ECHO_INPUT = (val: string) => {
  entries.push({ type: 'input', text: val + '\n' });
  };

  return {
  wrapperPrefix,
  userCodeStartLine,
  clearStderrBuffer: () => {
    stderrBuffer = '';
  },
  getStderrBuffer: () => stderrBuffer,
  };
}

function buildDebugHarness(code: string, breakpoints: number[], commands: DebugCommand[]): string {
  const userCodeJson = JSON.stringify(code);
  const userCodeLiteral = JSON.stringify(userCodeJson);
  const configJson = JSON.stringify({ breakpoints, commands });
  const configLiteral = JSON.stringify(configJson);

  return `
import json
import linecache
import bdb
import builtins as __pylamos_builtins
from browser import window as _win

__PYLAMOS_DEBUG_FILENAME = "codi_usuari.py"
__PYLAMOS_USER_CODE = json.loads(${userCodeLiteral})
__PYLAMOS_DEBUG_CONFIG = json.loads(${configLiteral})

def __pylamos_seed_linecache():
  linecache.cache[__PYLAMOS_DEBUG_FILENAME] = (
    len(__PYLAMOS_USER_CODE),
    None,
    __PYLAMOS_USER_CODE.splitlines(True),
    __PYLAMOS_DEBUG_FILENAME,
  )

def __pylamos_render_value(value):
  try:
    rendered = repr(value)
  except Exception as exc:
    rendered = "<repr failed: " + type(exc).__name__ + ": " + str(exc) + ">"
  if len(rendered) > 240:
    rendered = rendered[:237] + "..."
  return {
    "type": type(value).__name__,
    "value": rendered,
  }

def __pylamos_normalize_frame_name(name):
  if not name or name == "<module>":
    return "<main>"
  return name

def __pylamos_default_final_line():
  lines = __PYLAMOS_USER_CODE.splitlines()
  for index in range(len(lines) - 1, -1, -1):
    if lines[index].strip():
      return index + 1
  return 1

def __pylamos_serialize_locals(mapping):
  hidden = {
    "_win",
    "_Out",
    "_Err",
    "_random",
    "sys",
    "json",
    "bdb",
    "linecache",
    "_debugger",
    "_PylamosReplayDebugger",
  }
  items = []
  for name in sorted(mapping.keys()):
    if name in hidden or name.startswith("__PYLAMOS_"):
      continue
    if name.startswith("__") and name.endswith("__"):
      continue
    value = mapping[name]
    if name == "input" and value is input:
      continue
    try:
      rendered = __pylamos_render_value(value)
    except Exception as exc:
      rendered = {
        "type": "unavailable",
        "value": "<serialization failed: " + type(exc).__name__ + ">",
      }
    items.append({
      "name": name,
      "type": rendered["type"],
      "value": rendered["value"],
    })
  return items

def __pylamos_find_user_frame(frame):
  cursor = frame
  while cursor is not None:
    if cursor.f_code.co_filename == __PYLAMOS_DEBUG_FILENAME:
      return cursor
    cursor = cursor.f_back
  return None

def __pylamos_collect_frames(frame):
  frames = []
  cursor = frame
  depth = 0
  while cursor is not None:
    if cursor.f_code.co_filename == __PYLAMOS_DEBUG_FILENAME:
      frame_name = __pylamos_normalize_frame_name(cursor.f_code.co_name)
      frames.append({
        "id": str(depth) + ":" + frame_name + ":" + str(cursor.f_lineno),
        "name": frame_name,
        "file": cursor.f_code.co_filename,
        "line": cursor.f_lineno,
        "locals": __pylamos_serialize_locals(cursor.f_locals),
      })
    cursor = cursor.f_back
    depth += 1
  return frames

def __pylamos_collect_main_frame(namespace, line_number):
  resolved_line = line_number if line_number is not None else __pylamos_default_final_line()
  return {
    "id": "final:<main>:" + str(resolved_line),
    "name": "<main>",
    "file": __PYLAMOS_DEBUG_FILENAME,
    "line": resolved_line,
    "locals": __pylamos_serialize_locals(namespace),
  }

class _PylamosReplayDebugger(bdb.Bdb):
  def __init__(self, config):
    super().__init__()
    self.commands = config.get("commands", [])
    self.breakpoints = config.get("breakpoints", [])
    self.command_index = 0
    self.payload = None
    self.last_user_line = None
    self.last_main_line = None

  def _remember_line(self, frame):
    user_frame = __pylamos_find_user_frame(frame)
    if user_frame is None:
      return None
    self.last_user_line = user_frame.f_lineno
    if __pylamos_normalize_frame_name(user_frame.f_code.co_name) == "<main>":
      self.last_main_line = user_frame.f_lineno
    return user_frame

  def dispatch_return(self, frame, arg):
    if self.stop_here(frame) or frame == self.returnframe:
      try:
        self.frame_returning = frame
        self.user_return(frame, arg)
      finally:
        self.frame_returning = None
      if self.quitting:
        raise bdb.BdbQuit
      if self.stopframe is frame and self.stoplineno != -1:
        self._set_stopinfo(None, None)
    return self.trace_dispatch

  def dispatch_exception(self, frame, arg):
    if self.stop_here(frame):
      self.user_exception(frame, arg)
      if self.quitting:
        raise bdb.BdbQuit
    return self.trace_dispatch

  def _apply_breakpoints(self):
    for line in self.breakpoints:
      try:
        self.set_break(__PYLAMOS_DEBUG_FILENAME, int(line))
      except Exception:
        pass

  def break_here(self, frame):
    filename = self.canonic(frame.f_code.co_filename)
    if filename not in self.breaks:
      return False

    lineno = frame.f_lineno
    if lineno not in self.breaks[filename]:
      return False

    bp, flag = bdb.effective(filename, lineno, frame)
    if bp:
      self.currentbp = bp.number
      if flag and bp.temporary:
        self.do_clear(str(bp.number))
      return True
    return False

  def break_anywhere(self, frame):
    filename = self.canonic(frame.f_code.co_filename)
    return filename in self.breaks

  def _apply_command(self, command, frame=None):
    kind = command.get("kind")
    user_frame = __pylamos_find_user_frame(frame) if frame is not None else None
    if kind in ("start", "step", "step_into"):
      self.set_step()
    elif kind == "step_over":
      if user_frame is None:
        self.set_step()
      else:
        self.set_next(user_frame)
    elif kind == "step_out":
      if user_frame is None:
        self.set_continue()
      else:
        self.set_return(user_frame)
    elif kind == "continue":
      self.set_continue()
    else:
      self.set_step()

  def _current_visible_frame_id(self, frame):
    user_frame = __pylamos_find_user_frame(frame)
    if user_frame is None:
      return None
    frame_name = __pylamos_normalize_frame_name(user_frame.f_code.co_name)
    return "0:" + frame_name + ":" + str(user_frame.f_lineno)

  def _current_command(self):
    if not self.commands:
      return None
    if self.command_index < 0 or self.command_index >= len(self.commands):
      return None
    return self.commands[self.command_index]

  def _is_direct_user_frame(self, frame):
    return frame is not None and frame.f_code.co_filename == __PYLAMOS_DEBUG_FILENAME

  def _is_same_visible_position(self, frame, command):
    current_frame_id = self._current_visible_frame_id(frame)
    origin_frame_id = command.get("originFrameId")
    origin_line = command.get("originLine")

    if origin_frame_id is not None:
      return current_frame_id == origin_frame_id

    if origin_line is None:
      return False

    user_frame = __pylamos_find_user_frame(frame)
    if user_frame is None:
      return False
    return user_frame.f_lineno == origin_line

  def _should_wait_for_visible_stop(self, frame, event, error=None):
    if error is not None:
      return False
    command = self._current_command()
    if command is None:
      return False

    kind = command.get("kind")
    if kind == "start":
      return event != "line"

    if kind in ("step", "step_into"):
      if event == "call":
        return (not self._is_direct_user_frame(frame)) or self._is_same_visible_position(frame, command)
      if event == "line":
        return self._is_same_visible_position(frame, command)
      return True

    if kind in ("step_over", "step_out"):
      if event != "line":
        return True
      return self._is_same_visible_position(frame, command)

    return False

  def _capture(self, frame, event, error=None):
    user_frame = self._remember_line(frame)
    if user_frame is None:
      return
    payload = {
      "state": "paused",
      "event": event,
      "line": user_frame.f_lineno,
      "frames": __pylamos_collect_frames(user_frame),
    }
    if error is not None:
      payload["error"] = error
    self.payload = payload
    self.set_quit()

  def _advance_or_capture(self, frame, event, error=None):
    user_frame = self._remember_line(frame)
    if user_frame is None:
      return
    if self._should_wait_for_visible_stop(frame, event, error):
      return
    if self.command_index >= len(self.commands) - 1:
      self._capture(frame, event, error)
      return
    self.command_index += 1
    self._apply_command(self.commands[self.command_index], user_frame)

  def user_line(self, frame):
    self._advance_or_capture(frame, "line")

  def user_call(self, frame, argument_list):
    self._advance_or_capture(frame, "call")

  def user_return(self, frame, return_value):
    self._advance_or_capture(frame, "return")

  def user_exception(self, frame, exc_info):
    exc_type, exc_value, _ = exc_info
    self._advance_or_capture(
      frame,
      "exception",
      {
        "type": getattr(exc_type, "__name__", str(exc_type)),
        "message": str(exc_value),
      },
    )

  def run_replay(self):
    compiled = compile(__PYLAMOS_USER_CODE, __PYLAMOS_DEBUG_FILENAME, "exec")
    wrapped_input = input
    user_globals = {
      "__name__": "__main__",
      "__builtins__": __pylamos_builtins,
      "input": wrapped_input,
    }
    previous_input = __pylamos_builtins.input
    self.reset()
    self._apply_breakpoints()
    if self.commands:
      self.command_index = 0
      self._apply_command(self.commands[0])
    else:
      self._apply_command({"kind": "start"})
    sys.settrace(self.trace_dispatch)
    __pylamos_builtins.input = wrapped_input
    try:
      exec(compiled, user_globals, user_globals)
      if self.payload is None:
        final_line = self.last_main_line if self.last_main_line is not None else self.last_user_line
        self.payload = {
          "state": "finished",
          "event": "finished",
          "line": final_line if final_line is not None else __pylamos_default_final_line(),
          "frames": [__pylamos_collect_main_frame(user_globals, final_line)],
        }
    except bdb.BdbQuit:
      pass
    finally:
      __pylamos_builtins.input = previous_input
      self.quitting = True
      sys.settrace(None)

__pylamos_seed_linecache()
_debugger = _PylamosReplayDebugger(__PYLAMOS_DEBUG_CONFIG)
_debugger.run_replay()
_win.__PYLAMOS_DEBUG_STATE_JSON = json.dumps(_debugger.payload)
`;
}

function parseDebugSnapshot(value: unknown): DebugSnapshot | undefined {
  if (!value) return undefined;
  try {
  return JSON.parse(String(value)) as DebugSnapshot;
  } catch {
  return undefined;
  }
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
    const appWindow = getPylamosWindow();

    const B = appWindow.__BRYTHON__;
    if (!B) {
      entries.push({ type: 'error', text: 'Brython no està carregat. Recarrega la pàgina.\n' });
      return { status: 'done', entries };
    }
    const runtime = installSharedRuntime(B, entries, stdinLines, randomSeed);
    const { wrapperPrefix, userCodeStartLine } = runtime;

    const wrapped = `${wrapperPrefix}${code}\n`;

    // — Fase de compilació (python_to_js) ————————————————————————————
    runtime.clearStderrBuffer();
    let compiledJs: string;
    try {
      compiledJs = B.python_to_js(wrapped, '__main__', 1);
    } catch (err: unknown) {
      const formatted = formatExecutionError(err, userCodeStartLine);
      const stderrBuffer = runtime.getStderrBuffer();
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
    runtime.clearStderrBuffer();
    try {
      new Function(compiledJs)();
      if (appWindow.__PYLAMOS_STDIN_NEEDED) {
        return { status: 'stdin_needed', entries };
      }
      // Stderr pot tenir warnings que no han llançat excepció
      const stderrBuffer = runtime.getStderrBuffer();
      if (stderrBuffer) {
        const remapped = remapTracebackToUserCode(stderrBuffer, userCodeStartLine);
        const formatted = formatExecutionError(remapped, userCodeStartLine);
        entries.push({ type: 'error', text: formatted.summary + '\n', details: formatted.details, phase: 'runtime' });
      }
      return { status: 'done', entries };
    } catch (err: unknown) {
      if (appWindow.__PYLAMOS_STDIN_NEEDED) {
        return { status: 'stdin_needed', entries };
      }
      const formatted = formatExecutionError(err, userCodeStartLine);
      // Prioritzem el traceback raw del stderr (més complet que l'objecte d'excepció JS)
      const stderrBuffer = runtime.getStderrBuffer();
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

  const debugReplay = useCallback(
    (
      code: string,
      stdinLines: string[],
      randomSeed: number,
      breakpoints: number[],
      commands: DebugCommand[]
    ): DebugRunResult => {
      const entries: ConsoleEntry[] = [];
      const appWindow = getPylamosWindow();

      const B = appWindow.__BRYTHON__;
      if (!B) {
        entries.push({ type: 'error', text: 'Brython no està carregat. Recarrega la pàgina.\n' });
        return { status: 'error', entries };
      }

      const runtime = installSharedRuntime(B, entries, stdinLines, randomSeed);
      const debugUserCodeStartLine = 1;
      appWindow.__PYLAMOS_DEBUG_STATE_JSON = '';

      const wrapped = `${runtime.wrapperPrefix}${buildDebugHarness(code, breakpoints, commands)}`;

      runtime.clearStderrBuffer();
      let compiledJs: string;
      try {
        compiledJs = B.python_to_js(wrapped, '__main__', 1);
      } catch (err: unknown) {
        const formatted = formatExecutionError(err, runtime.userCodeStartLine);
        const stderrBuffer = runtime.getStderrBuffer();
        entries.push({
          type: 'error',
          text: formatted.summary + '\n',
          details: stderrBuffer || formatted.details,
          phase: 'compile',
        });
        return { status: 'error', entries };
      }

      runtime.clearStderrBuffer();
      try {
        new Function(compiledJs)();
        if (appWindow.__PYLAMOS_STDIN_NEEDED) {
          return { status: 'stdin_needed', entries };
        }

        const snapshot = parseDebugSnapshot(appWindow.__PYLAMOS_DEBUG_STATE_JSON);
        const stderrBuffer = runtime.getStderrBuffer();
        if (stderrBuffer) {
          const formatted = formatExecutionError(stderrBuffer, debugUserCodeStartLine);
          entries.push({ type: 'error', text: formatted.summary + '\n', details: formatted.details, phase: 'runtime' });
        }
        if (snapshot?.state === 'finished') {
          return { status: 'finished', entries, snapshot };
        }
        if (snapshot) {
          return { status: 'paused', entries, snapshot };
        }
        return { status: 'finished', entries };
      } catch (err: unknown) {
        if (appWindow.__PYLAMOS_STDIN_NEEDED) {
          return { status: 'stdin_needed', entries };
        }

        const snapshot = parseDebugSnapshot(appWindow.__PYLAMOS_DEBUG_STATE_JSON);
        const stderrBuffer = runtime.getStderrBuffer();
        const formatted = formatExecutionError(stderrBuffer || err, debugUserCodeStartLine);
        entries.push({
          type: 'error',
          text: formatted.summary + '\n',
          details: stderrBuffer || formatted.details,
          phase: 'runtime',
        });
        return { status: 'error', entries, snapshot };
      }
    },
    []
  );

  return { run, debugReplay };
}
