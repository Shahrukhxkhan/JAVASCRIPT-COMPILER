import { Token } from '../types';
import { TokenType } from '../constants';

const KEYWORDS = new Set([
  'let', 'const', 'function', 'if', 'else', 'return', 'print'
]);

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let current = 0;
  let line = 1;
  let column = 1;

  while (current < source.length) {
    let char = source[current];

    // Whitespace
    if (/\s/.test(char)) {
      if (char === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
      current++;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(char)) {
      let value = '';
      while (current < source.length && /[0-9]/.test(source[current])) {
        value += source[current];
        current++;
        column++;
      }
      tokens.push({ type: TokenType.Number, value, line, column });
      continue;
    }

    // Identifiers and Keywords
    if (/[a-zA-Z_]/.test(char)) {
      let value = '';
      while (current < source.length && /[a-zA-Z0-9_]/.test(source[current])) {
        value += source[current];
        current++;
        column++;
      }
      const type = KEYWORDS.has(value) ? TokenType.Keyword : TokenType.Identifier;
      tokens.push({ type, value, line, column });
      continue;
    }

    // Strings
    if (char === '"' || char === "'") {
      const quote = char;
      let value = '';
      current++; // skip open quote
      column++;
      while (current < source.length && source[current] !== quote) {
        value += source[current];
        current++;
        column++;
      }
      current++; // skip close quote
      column++;
      tokens.push({ type: TokenType.String, value, line, column });
      continue;
    }

    // Punctuation and Operators
    const twoCharMap: Record<string, boolean> = { '==': true, '<=': true, '>=': true, '!=': true };
    const twoChar = source.slice(current, current + 2);

    if (twoCharMap[twoChar]) {
      tokens.push({ type: TokenType.Operator, value: twoChar, line, column });
      current += 2;
      column += 2;
      continue;
    }

    if (/[+\-*/=<>]/.test(char)) {
      tokens.push({ type: TokenType.Operator, value: char, line, column });
      current++;
      column++;
      continue;
    }

    if (/[(){};,.]/.test(char)) {
      tokens.push({ type: TokenType.Punctuation, value: char, line, column });
      current++;
      column++;
      continue;
    }

    throw new Error(`Unexpected character: ${char} at ${line}:${column}`);
  }

  tokens.push({ type: TokenType.EOF, value: 'EOF', line, column });
  return tokens;
}