/**
 * Client-side evaluator for calculated screen fields.
 *
 * This mirrors the server's grammar exactly (NewHRFieldFormula on top of
 * NewHRPayrollFormulaEngine) so the number a user watches appear while typing is the
 * number that gets stored. The server still recalculates on save and its answer wins —
 * this exists for immediacy, never as the source of truth.
 *
 * Grammar
 *   value      : number | {field_key}
 *   operators  : + - * /  and unary -
 *   comparison : > < >= <= == != <>      (yield 1 or 0, useful inside IF)
 *   grouping   : ( )
 *   functions  : MIN(a,b) MAX(a,b) ROUND(a,n) IF(condition,a,b)
 *
 * Hand-written tokenizer + shunting-yard, like the server: no eval, no Function(),
 * nothing outside the grammar can execute.
 */

const REF = /\{\s*([A-Za-z_][A-Za-z0-9_]{0,79})\s*\}/g;

const FUNCTIONS = { MIN: 2, MAX: 2, ROUND: 2, IF: 3 };

const PRECEDENCE = { 'u-': 4, '*': 3, '/': 3, '+': 2, '-': 2, '>': 1, '<': 1, '>=': 1, '<=': 1, '==': 1, '!=': 1 };

/** Field keys a formula reads, in first-seen order. */
export const extractRefs = (formula) => {
  const out = [];
  if (!formula) return out;
  REF.lastIndex = 0;
  let m = REF.exec(formula);
  while (m) {
    if (!out.some((r) => r.toLowerCase() === m[1].toLowerCase())) out.push(m[1]);
    m = REF.exec(formula);
  }
  return out;
};

/** Reads one value out of a form state, by field key or by column name. */
const lookup = (values, key) => {
  if (!values) return null;
  if (key in values) return values[key];
  const hit = Object.keys(values).find((k) => k.toLowerCase() === key.toLowerCase());
  return hit === undefined ? null : values[hit];
};

/** null (not 0) when there is nothing numeric to read — "empty" and "zero" differ. */
export const toNumber = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) ? n : null;
};

/* ------------------------------------------------------------------ tokenizer */

function tokenize(expression) {
  const tokens = [];
  let i = 0;

  while (i < expression.length) {
    const c = expression[i];

    if (/\s/.test(c)) { i += 1; continue; }

    if (c === '{') {
      const end = expression.indexOf('}', i);
      if (end < 0) return { error: 'A field reference is missing its closing brace.' };
      const key = expression.slice(i + 1, end).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(key)) return { error: `'${key}' is not a field key.` };
      tokens.push({ type: 'ref', text: key });
      i = end + 1;
      continue;
    }

    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(expression[i + 1] || ''))) {
      let j = i;
      while (j < expression.length && /[0-9.]/.test(expression[j])) j += 1;
      const text = expression.slice(i, j);
      if ((text.match(/\./g) || []).length > 1) return { error: `'${text}' is not a number.` };
      tokens.push({ type: 'number', value: Number(text) });
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < expression.length && /[A-Za-z0-9_]/.test(expression[j])) j += 1;
      const word = expression.slice(i, j).toUpperCase();
      if (!(word in FUNCTIONS)) {
        return { error: `'${expression.slice(i, j)}' is not a function. Reference a field as {field_key}.` };
      }
      tokens.push({ type: 'function', text: word, args: 0 });
      i = j;
      continue;
    }

    const two = expression.slice(i, i + 2);
    if (['>=', '<=', '==', '!=', '<>'].includes(two)) {
      tokens.push({ type: 'operator', text: two === '<>' ? '!=' : two });
      i += 2;
      continue;
    }

    if ('+-*/><'.includes(c)) { tokens.push({ type: 'operator', text: c }); i += 1; continue; }
    if (c === '(') { tokens.push({ type: 'lparen' }); i += 1; continue; }
    if (c === ')') { tokens.push({ type: 'rparen' }); i += 1; continue; }
    if (c === ',') { tokens.push({ type: 'comma' }); i += 1; continue; }
    if (c === '=') return { error: "Use '==' to compare two values." };

    return { error: `'${c}' cannot be used in a formula.` };
  }

  return { tokens };
}

/* --------------------------------------------------------------- shunting-yard */

function toRpn(tokens) {
  const output = [];
  const stack = [];
  const argCount = [];
  let previous = null;

  for (const token of tokens) {
    switch (token.type) {
      case 'number':
      case 'ref':
        output.push(token);
        break;

      case 'function':
        stack.push(token);
        argCount.push(1);
        break;

      case 'comma': {
        while (stack.length && stack[stack.length - 1].type !== 'lparen') output.push(stack.pop());
        if (!stack.length) return { error: 'Misplaced comma — check the brackets.' };
        if (argCount.length) argCount[argCount.length - 1] += 1;
        break;
      }

      case 'operator': {
        // a - at the start, or straight after another operator or an open bracket, is a sign
        const unary =
          token.text === '-' &&
          (previous === null || previous.type === 'operator' || previous.type === 'lparen' || previous.type === 'comma');
        const op = unary ? 'u-' : token.text;
        while (stack.length) {
          const top = stack[stack.length - 1];
          if (top.type !== 'operator') break;
          const higher = PRECEDENCE[top.text] > PRECEDENCE[op];
          const equal = PRECEDENCE[top.text] === PRECEDENCE[op] && op !== 'u-';
          if (!higher && !equal) break;
          output.push(stack.pop());
        }
        stack.push({ type: 'operator', text: op });
        break;
      }

      case 'lparen':
        stack.push(token);
        break;

      case 'rparen': {
        while (stack.length && stack[stack.length - 1].type !== 'lparen') output.push(stack.pop());
        if (!stack.length) return { error: 'A closing bracket has no opening bracket.' };
        stack.pop();
        if (stack.length && stack[stack.length - 1].type === 'function') {
          const fn = stack.pop();
          fn.args = argCount.pop() ?? 0;
          if (fn.args !== FUNCTIONS[fn.text]) {
            return { error: `${fn.text} takes ${FUNCTIONS[fn.text]} arguments, not ${fn.args}.` };
          }
          output.push(fn);
        }
        break;
      }

      default:
        return { error: 'The formula could not be read.' };
    }
    previous = token;
  }

  while (stack.length) {
    const top = stack.pop();
    if (top.type === 'lparen') return { error: 'An opening bracket was never closed.' };
    output.push(top);
  }

  return { rpn: output };
}

/* -------------------------------------------------------------------- evaluate */

const round = (value, scale) => {
  if (scale === '' || scale === null || scale === undefined) return value;
  const places = Number(scale);
  if (!Number.isFinite(places) || places < 0 || places > 6) return value;
  // half away from zero, matching decimal.Round(..., MidpointRounding.AwayFromZero)
  const factor = 10 ** places;
  return Math.sign(value) * Math.round(Math.abs(value) * factor) / factor;
};

/**
 * Runs a formula. Missing references count as zero and are reported, so a half-filled
 * form still shows a number instead of an error — the same rule the server applies.
 */
export function evaluateFormula(formula, values, roundTo) {
  if (!formula || !String(formula).trim()) return { ok: false, error: 'This field has no formula.' };

  const { tokens, error: tokenError } = tokenize(String(formula));
  if (tokenError) return { ok: false, error: tokenError };

  const { rpn, error: parseError } = toRpn(tokens);
  if (parseError) return { ok: false, error: parseError };

  const stack = [];
  const missing = [];

  for (const token of rpn) {
    if (token.type === 'number') { stack.push(token.value); continue; }

    if (token.type === 'ref') {
      const n = toNumber(lookup(values, token.text));
      if (n === null) { missing.push(token.text); stack.push(0); }
      else stack.push(n);
      continue;
    }

    if (token.type === 'operator') {
      if (token.text === 'u-') {
        if (!stack.length) return { ok: false, error: 'The formula is incomplete.' };
        stack.push(-stack.pop());
        continue;
      }
      if (stack.length < 2) return { ok: false, error: 'The formula is incomplete.' };
      const right = stack.pop();
      const left = stack.pop();
      switch (token.text) {
        case '+': stack.push(left + right); break;
        case '-': stack.push(left - right); break;
        case '*': stack.push(left * right); break;
        case '/':
          if (right === 0) return { ok: false, error: 'Division by zero.' };
          stack.push(left / right);
          break;
        case '>': stack.push(left > right ? 1 : 0); break;
        case '<': stack.push(left < right ? 1 : 0); break;
        case '>=': stack.push(left >= right ? 1 : 0); break;
        case '<=': stack.push(left <= right ? 1 : 0); break;
        case '==': stack.push(left === right ? 1 : 0); break;
        case '!=': stack.push(left !== right ? 1 : 0); break;
        default: return { ok: false, error: `Unsupported operator '${token.text}'.` };
      }
      continue;
    }

    if (token.type === 'function') {
      if (stack.length < token.args) return { ok: false, error: `${token.text} is missing arguments.` };
      const args = stack.splice(stack.length - token.args, token.args);
      switch (token.text) {
        case 'MIN': stack.push(Math.min(args[0], args[1])); break;
        case 'MAX': stack.push(Math.max(args[0], args[1])); break;
        case 'ROUND': stack.push(round(args[0], args[1])); break;
        case 'IF': stack.push(args[0] !== 0 ? args[1] : args[2]); break;
        default: return { ok: false, error: `Unknown function '${token.text}'.` };
      }
      continue;
    }
  }

  if (stack.length !== 1) return { ok: false, error: 'The formula is incomplete.' };
  const value = round(stack[0], roundTo);
  if (!Number.isFinite(value)) return { ok: false, error: 'The result is not a number.' };

  return { ok: true, value, missing };
}

/**
 * Orders computed fields so each is evaluated after the fields it reads. A field caught
 * in a cycle is returned last rather than dropped — the server refuses to store one, but
 * a layout fetched from an older API might still contain it.
 */
export function inEvaluationOrder(fields) {
  const byKey = new Map(fields.map((f) => [f.fieldKey.toLowerCase(), f]));
  const ordered = [];
  const done = new Set();
  const visiting = new Set();

  const walk = (field) => {
    const key = field.fieldKey.toLowerCase();
    if (done.has(key) || visiting.has(key)) return;
    visiting.add(key);
    for (const ref of field.formulaRefs?.length ? field.formulaRefs : extractRefs(field.formula)) {
      const dep = byKey.get(String(ref).toLowerCase());
      if (dep) walk(dep);
    }
    visiting.delete(key);
    done.add(key);
    ordered.push(field);
  };

  fields.forEach(walk);
  return ordered;
}

export default evaluateFormula;
