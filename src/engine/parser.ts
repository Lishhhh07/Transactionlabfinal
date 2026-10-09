import { Operation, ValueExpr } from "./types";

export class ParseError extends Error {}

const ITEM = "[A-Za-z][A-Za-z0-9_]*";

const READ_RE = new RegExp(`^READ\\(\\s*(${ITEM})\\s*\\)$`, "i");
const WRITE_RE = new RegExp(`^WRITE\\(\\s*(${ITEM})\\s*,\\s*(.+?)\\s*\\)$`, "i");
const CONST_RE = /^-?\d+(\.\d+)?$/;
const READ_PLUS_RE = new RegExp(`^(${ITEM})\\s*([+-])\\s*(\\d+(?:\\.\\d+)?)$`);

function parseValue(raw: string): ValueExpr {
  if (CONST_RE.test(raw)) {
    return { kind: "const", value: Number(raw) };
  }
  const m = raw.match(READ_PLUS_RE);
  if (m) {
    const delta = Number(m[3]) * (m[2] === "-" ? -1 : 1);
    return { kind: "readPlus", item: m[1].toUpperCase(), delta };
  }
  throw new ParseError(`Cannot understand value "${raw}". Use a number (800) or e.g. A-200.`);
}

export function parseOp(text: string): Operation {
  const t = text.trim();

  if (/^COMMIT$/i.test(t)) return { type: "COMMIT" };
  if (/^ROLLBACK$/i.test(t)) return { type: "ROLLBACK" };

  let m = t.match(READ_RE);
  if (m) return { type: "READ", item: m[1].toUpperCase() };

  m = t.match(WRITE_RE);
  if (m) return { type: "WRITE", item: m[1].toUpperCase(), value: parseValue(m[2]) };

  throw new ParseError(`Unknown operation "${text}". Try READ(A), WRITE(A, 800), COMMIT, ROLLBACK.`);
}

export function parseOps(lines: string[]): Operation[] {
  return lines.map(parseOp);
}

export function opToString(op: Operation): string {
  switch (op.type) {
    case "READ":
      return `READ(${op.item})`;
    case "WRITE": {
      const v = op.value;
      if (v.kind === "const") return `WRITE(${op.item}, ${v.value})`;
      const sign = v.delta < 0 ? "-" : "+";
      return `WRITE(${op.item}, ${v.item}${sign}${Math.abs(v.delta)})`;
    }
    case "COMMIT":
      return "COMMIT";
    case "ROLLBACK":
      return "ROLLBACK";
  }
}