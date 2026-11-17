import type { StreamParser, StringStream } from "@codemirror/language";

type NixState = {
  /** Nesting depth of `/* ... *​/` comments (Nix allows nesting). */
  inBlockComment: number;
  inString: boolean;
  inIndentedString: boolean;
  /** Bracket depth, used for a cheap auto-indent. */
  depth: number;
};

const KEYWORDS = new Set([
  "let",
  "in",
  "with",
  "rec",
  "inherit",
  "if",
  "then",
  "else",
  "assert",
  "or",
]);

const ATOMS = new Set(["true", "false", "null"]);

const BUILTINS = new Set([
  "import",
  "builtins",
  "abort",
  "baseNameOf",
  "derivation",
  "dirOf",
  "fetchGit",
  "fetchTarball",
  "map",
  "removeAttrs",
  "throw",
  "toString",
]);

function scanString(stream: StringStream, state: NixState): void {
  while (!stream.eol()) {
    if (stream.match(/^\\./)) continue;
    if (stream.match('"')) {
      state.inString = false;
      return;
    }
    stream.next();
  }
  state.inString = true;
}

function scanIndentedString(stream: StringStream, state: NixState): void {
  while (!stream.eol()) {
    if (stream.match("''")) {
      state.inIndentedString = false;
      return;
    }
    stream.next();
  }
  state.inIndentedString = true;
}

export const nix: StreamParser<unknown> = {
  name: "nix",

  startState: () =>
    ({
      inBlockComment: 0,
      inString: false,
      inIndentedString: false,
      depth: 0,
    }) as NixState,

  token(stream, rawState) {
    const state = rawState as NixState;

    if (state.inBlockComment > 0) {
      if (stream.match("/*")) {
        state.inBlockComment++;
        return "comment";
      }
      if (stream.match("*/")) {
        state.inBlockComment--;
        return "comment";
      }
      stream.next();
      return "comment";
    }

    if (state.inString) {
      scanString(stream, state);
      return "string";
    }

    if (state.inIndentedString) {
      scanIndentedString(stream, state);
      return "string";
    }

    if (stream.eatSpace()) return null;

    // Comments.
    if (stream.match("#")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match("/*")) {
      state.inBlockComment = 1;
      return "comment";
    }

    // Indented strings are checked before single-quoted strings.
    if (stream.match("''")) {
      scanIndentedString(stream, state);
      return "string";
    }
    if (stream.match('"')) {
      scanString(stream, state);
      return "string";
    }

    // <nixpkgs> style search paths.
    if (stream.match(/^<[A-Za-z0-9_./-]+>/)) return "string";

    // URIs (https://, file://, git+https://).
    if (stream.match(/^[a-z][a-z0-9+.-]*:\/\/[^\s(){}[\];,]+/i)) return "url";

    // Absolute / relative / home paths.
    if (stream.match(/^(?:\.\.?\/|~\/|\/)[^\s(){}[\];,]+/)) return "url";

    // Numbers.
    if (stream.match(/^(?:[0-9]+\.[0-9]+|[0-9]+)/)) return "number";

    // Attribute names (foo = ...) get their own colour before keywords.
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_'-]*(?=\s*=)/))
      return "propertyName";

    // Identifiers and keywords.
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_'-]*/)) {
      const name = stream.current();
      if (KEYWORDS.has(name)) return "keyword";
      if (ATOMS.has(name)) return "atom";
      if (BUILTINS.has(name)) return "builtin";
      return "variableName";
    }

    // Operators and punctuation.
    if (
      stream.match(/^(?:->|==|!=|<=|>=|&&|\|\||\/\/|\+\+|::|[+\-*/<>!?:=@.])/)
    ) {
      return "operator";
    }
    if (stream.match(/^[{}()[\]]/)) {
      const ch = stream.current();
      if (ch === "{" || ch === "[" || ch === "(") state.depth++;
      else state.depth = Math.max(0, state.depth - 1);
      return "bracket";
    }
    if (stream.match(/^[;,]/)) return "punctuation";

    stream.next();
    return null;
  },

  indent(rawState, textAfter) {
    const state = rawState as NixState;
    const closing = /^[}\])]/.test(textAfter);
    return Math.max(0, state.depth - (closing ? 1 : 0)) * 2;
  },

  languageData: {
    commentTokens: { line: "#", block: { open: "/*", close: "*/" } },
    closeBrackets: { brackets: ["(", "[", "{", '"'] },
  },
};
