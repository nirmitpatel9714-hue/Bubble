import { redo, undo } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import {
  EditorSelection,
  EditorState,
  type Extension,
  Prec,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { type Command, type EditorView, keymap } from "@codemirror/view";

/**
 * Helix-style modal editing.
 *
 * Helix keeps a selection around in normal mode; motions either replace it
 * (normal) or extend it (select). This is a focused subset of the real
 * keymap: core motions, selection, delete/change/yank/paste, line edits,
 * undo/redo and search. It deliberately does not try to reproduce multi
 * cursor, macros, or the full `:` command language.
 */
export type HelixMode = "normal" | "insert" | "select";

type HelixState = {
  mode: HelixMode;
  /** A `g` was pressed and we are waiting for the second key. */
  pendingG: boolean;
};

const setMode = StateEffect.define<HelixMode>();
const setPendingG = StateEffect.define<boolean>();

const helixField = StateField.define<HelixState>({
  create: () => ({ mode: "normal", pendingG: false }),
  update(value, tr) {
    let next = value;
    for (const effect of tr.effects) {
      if (effect.is(setMode)) {
        next = { ...next, mode: effect.value, pendingG: false };
      } else if (effect.is(setPendingG)) {
        next = { ...next, pendingG: effect.value };
      }
    }
    return next;
  },
});

function helixState(state: EditorState): HelixState {
  return state.field(helixField, false) ?? { mode: "normal", pendingG: false };
}

function modeOf(state: EditorState): HelixMode {
  return helixState(state).mode;
}

/** Wrap a command so it only runs outside insert mode and clears `g`. */
function command(
  run: (view: EditorView) => boolean,
  options: { allowG?: boolean; anyMode?: boolean } = {},
): Command {
  return (view) => {
    const state = helixState(view.state);
    if (!options.anyMode && state.mode === "insert") return false;
    if (state.pendingG && !options.allowG) {
      view.dispatch({ effects: setPendingG.of(false) });
    }
    return run(view);
  };
}

function moveTo(view: EditorView, head: number, extend: boolean): boolean {
  const state = view.state;
  const clamped = Math.max(0, Math.min(state.doc.length, head));
  const anchor = extend ? state.selection.main.anchor : clamped;
  view.dispatch({
    selection: EditorSelection.single(anchor, clamped),
    scrollIntoView: true,
    userEvent: "select.helix",
  });
  return true;
}

function extendSelection(state: EditorState): boolean {
  return modeOf(state) === "select";
}

function vertical(view: EditorView, direction: 1 | -1): boolean {
  const state = view.state;
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  const column = head - line.from;
  const targetNumber = line.number + direction;
  if (targetNumber < 1) return moveTo(view, 0, extendSelection(state));
  if (targetNumber > state.doc.lines) {
    return moveTo(view, state.doc.length, extendSelection(state));
  }
  const target = state.doc.line(targetNumber);
  return moveTo(
    view,
    target.from + Math.min(column, target.length),
    extendSelection(state),
  );
}

function wordForward(view: EditorView): boolean {
  const state = view.state;
  const head = state.selection.main.head;
  const rest = state.sliceDoc(head);
  const token = /^[\p{L}\p{N}_]+/u.exec(rest) ?? /^[^\s]+/u.exec(rest);
  let offset = token ? token[0].length : 0;
  while (offset < rest.length && /\s/.test(rest[offset])) offset++;
  if (offset === 0) return false;
  return moveTo(view, head + offset, extendSelection(state));
}

function wordBackward(view: EditorView): boolean {
  const state = view.state;
  const head = state.selection.main.head;
  const before = state.sliceDoc(0, head);
  let index = before.length;
  while (index > 0 && /\s/.test(before[index - 1])) index--;
  while (index > 0 && !/\s/.test(before[index - 1])) index--;
  if (index === head) return false;
  return moveTo(view, index, extendSelection(state));
}

function wordEnd(view: EditorView): boolean {
  const state = view.state;
  const head = state.selection.main.head;
  const rest = state.sliceDoc(head + 1);
  let index = 0;
  while (index < rest.length && /\s/.test(rest[index])) index++;
  while (index < rest.length && !/\s/.test(rest[index])) index++;
  if (index === 0) return false;
  return moveTo(view, head + index, extendSelection(state));
}

function lineStart(view: EditorView, firstNonSpace = false): boolean {
  const state = view.state;
  const line = state.doc.lineAt(state.selection.main.head);
  const lead = firstNonSpace
    ? line.text.length - line.text.trimStart().length
    : 0;
  return moveTo(view, line.from + lead, extendSelection(state));
}

function lineEnd(view: EditorView): boolean {
  const state = view.state;
  const line = state.doc.lineAt(state.selection.main.head);
  return moveTo(view, line.to, extendSelection(state));
}

const charLeft = command((view) =>
  moveTo(view, view.state.selection.main.head - 1, extendSelection(view.state)),
);
const charRight = command((view) =>
  moveTo(view, view.state.selection.main.head + 1, extendSelection(view.state)),
);
const lineUp = command((view) => vertical(view, -1));
const lineDown = command((view) => vertical(view, 1));
const forward = command(wordForward);
const backward = command(wordBackward);
const endOfWord = command(wordEnd);
const startOfLine = command((view) => lineStart(view));
const endOfLine = command(lineEnd);
const firstNonSpace = command((view) => lineStart(view, true));
const docStart = command((view) =>
  moveTo(view, 0, extendSelection(view.state)),
);
const docEnd = command((view) =>
  moveTo(view, view.state.doc.length, extendSelection(view.state)),
);

const gPrefix = command(
  (view) => {
    view.dispatch({ effects: setPendingG.of(true) });
    return true;
  },
  { allowG: true },
);

function gMotion(run: Command): Command {
  return (view) => {
    if (!helixState(view.state).pendingG) return false;
    view.dispatch({ effects: setPendingG.of(false) });
    return run(view);
  };
}

const deleteSelection = command((view) => {
  const state = view.state;
  const selection = state.selection.main;
  if (selection.empty) {
    if (selection.head >= state.doc.length) return false;
    const to = Math.min(state.doc.length, selection.head + 1);
    view.dispatch({
      changes: { from: selection.head, to },
      selection: EditorSelection.cursor(selection.head),
      userEvent: "helix.delete",
    });
    return true;
  }
  view.dispatch({
    changes: { from: selection.from, to: selection.to },
    selection: EditorSelection.cursor(selection.from),
    userEvent: "helix.delete",
  });
  return true;
});

const changeSelection = command((view) => {
  const state = view.state;
  const selection = state.selection.main;
  const from = selection.from;
  const to = selection.empty
    ? Math.min(state.doc.length, selection.head + 1)
    : selection.to;
  view.dispatch({
    changes: { from, to },
    selection: EditorSelection.cursor(from),
    effects: setMode.of("insert"),
    userEvent: "helix.delete",
  });
  return true;
});

let yankRegister = "";

const yankSelection = command((view) => {
  const state = view.state;
  const selection = state.selection.main;
  const text = selection.empty
    ? `${state.doc.lineAt(selection.head).text}\n`
    : state.sliceDoc(selection.from, selection.to);
  yankRegister = text;
  void navigator.clipboard?.writeText(text).catch(() => undefined);
  return true;
});

const pasteSelection = command((view) => {
  const head = view.state.selection.main.head;
  if (yankRegister) {
    view.dispatch({
      changes: { from: head, insert: yankRegister },
      selection: EditorSelection.cursor(head + yankRegister.length),
      userEvent: "helix.paste",
    });
    return true;
  }
  // Nothing yanked in this session: fall back to the system clipboard.
  void navigator.clipboard
    ?.readText()
    .then((text) => {
      if (!text) return;
      const at = view.state.selection.main.head;
      view.dispatch({
        changes: { from: at, insert: text },
        selection: EditorSelection.cursor(at + text.length),
        userEvent: "helix.paste",
      });
    })
    .catch(() => undefined);
  return true;
});

const insertAtHead = command((view) => {
  const selection = view.state.selection.main;
  view.dispatch({
    selection: EditorSelection.cursor(selection.from),
    effects: setMode.of("insert"),
  });
  return true;
});

const appendAfter = command((view) => {
  const state = view.state;
  const selection = state.selection.main;
  const line = state.doc.lineAt(selection.to);
  view.dispatch({
    selection: EditorSelection.cursor(Math.min(line.to, selection.to + 1)),
    effects: setMode.of("insert"),
  });
  return true;
});

const appendLineEnd = command((view) => {
  const state = view.state;
  const line = state.doc.lineAt(state.selection.main.head);
  view.dispatch({
    selection: EditorSelection.cursor(line.to),
    effects: setMode.of("insert"),
  });
  return true;
});

const insertLineStart = command((view) => {
  const state = view.state;
  const line = state.doc.lineAt(state.selection.main.head);
  const lead = line.text.length - line.text.trimStart().length;
  view.dispatch({
    selection: EditorSelection.cursor(line.from + lead),
    effects: setMode.of("insert"),
  });
  return true;
});

const openLineBelow = command((view) => {
  const state = view.state;
  const line = state.doc.lineAt(state.selection.main.head);
  view.dispatch({
    changes: { from: line.to, insert: "\n" },
    selection: EditorSelection.cursor(line.to + 1),
    effects: setMode.of("insert"),
    userEvent: "helix.openLine",
  });
  return true;
});

const openLineAbove = command((view) => {
  const state = view.state;
  const line = state.doc.lineAt(state.selection.main.head);
  view.dispatch({
    changes: { from: line.from, insert: "\n" },
    selection: EditorSelection.cursor(line.from),
    effects: setMode.of("insert"),
    userEvent: "helix.openLine",
  });
  return true;
});

const selectLine = command((view) => {
  const state = view.state;
  const selection = state.selection.main;
  if (!selection.empty) {
    const endLine = state.doc.lineAt(selection.to);
    if (endLine.number < state.doc.lines) {
      const next = state.doc.line(endLine.number + 1);
      view.dispatch({
        selection: EditorSelection.range(selection.from, next.to),
        effects: setMode.of("select"),
      });
      return true;
    }
  }
  const line = state.doc.lineAt(selection.head);
  view.dispatch({
    selection: EditorSelection.range(line.from, line.to),
    effects: setMode.of("select"),
  });
  return true;
});

const extendToLineStart = command((view) => {
  const state = view.state;
  const selection = state.selection.main;
  const line = state.doc.lineAt(selection.head);
  view.dispatch({
    selection: EditorSelection.range(
      line.from,
      Math.max(selection.head, line.from),
    ),
    effects: setMode.of("select"),
  });
  return true;
});

const toggleSelect = command((view) => {
  const state = view.state;
  const selection = state.selection.main;
  if (modeOf(state) === "select") {
    view.dispatch({
      selection: EditorSelection.cursor(selection.head),
      effects: setMode.of("normal"),
    });
  } else {
    view.dispatch({ effects: setMode.of("select") });
  }
  return true;
});

const exitMode = command(
  (view) => {
    const state = helixState(view.state);
    const selection = view.state.selection.main;
    if (state.mode === "insert") {
      const line = view.state.doc.lineAt(selection.head);
      const head =
        selection.head > line.from ? selection.head - 1 : selection.head;
      view.dispatch({
        selection: EditorSelection.cursor(head),
        effects: setMode.of("normal"),
      });
      return true;
    }
    if (state.mode === "select") {
      view.dispatch({
        selection: EditorSelection.cursor(selection.head),
        effects: setMode.of("normal"),
      });
      return true;
    }
    if (state.pendingG) {
      view.dispatch({ effects: setPendingG.of(false) });
      return true;
    }
    return false;
  },
  { anyMode: true },
);

const undoCommand = command((view) => undo(view));
const redoCommand = command((view) => redo(view));
const search = command((view) => {
  openSearchPanel(view);
  return true;
});

const helixKeymap = keymap.of([
  { key: "Escape", run: exitMode },

  { key: "i", run: insertAtHead },
  { key: "a", run: appendAfter },
  { key: "I", run: insertLineStart },
  { key: "A", run: appendLineEnd },
  { key: "o", run: openLineBelow },
  { key: "O", run: openLineAbove },

  { key: "h", run: gMotion(startOfLine) },
  { key: "h", run: charLeft },
  { key: "j", run: lineDown },
  { key: "k", run: lineUp },
  { key: "l", run: gMotion(endOfLine) },
  { key: "l", run: charRight },
  { key: "ArrowLeft", run: charLeft },
  { key: "ArrowRight", run: charRight },
  { key: "ArrowUp", run: lineUp },
  { key: "ArrowDown", run: lineDown },

  { key: "w", run: forward },
  { key: "b", run: backward },
  { key: "e", run: gMotion(docEnd) },
  { key: "e", run: endOfWord },
  { key: "s", run: gMotion(firstNonSpace) },
  { key: "0", run: startOfLine },
  { key: "$", run: endOfLine },
  { key: "Home", run: startOfLine },
  { key: "End", run: endOfLine },

  { key: "g", run: gMotion(docStart) },
  { key: "g", run: gPrefix },
  { key: "G", run: gMotion(docEnd) },
  { key: "G", run: docEnd },

  { key: "d", run: deleteSelection },
  { key: "c", run: changeSelection },
  { key: "y", run: yankSelection },
  { key: "p", run: pasteSelection },
  { key: "x", run: selectLine },
  { key: "X", run: extendToLineStart },
  { key: "v", run: toggleSelect },

  { key: "u", run: undoCommand },
  { key: "U", run: redoCommand },
  { key: "/", run: search },
]);

/**
 * Block typing, backspace, delete, paste and drop while in normal/select mode
 * so the buffer only changes through a Helix command or insert mode.
 */
const blockTyping = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || modeOf(tr.startState) === "insert") return tr;
  const directEdit = tr.isUserEvent("input") || tr.isUserEvent("delete");
  return directEdit ? [] : tr;
});

export function helix(): Extension {
  return [helixField, blockTyping, Prec.highest(helixKeymap)];
}
