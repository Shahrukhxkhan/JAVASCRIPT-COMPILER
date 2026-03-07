import { Token } from '../types';
import { TokenType } from '../constants';

const KEYWORDS = new Set([
  'let', 'const', 'function', 'if', 'else', 'return', 'print',
  'while', 'for', 'break', 'continue', 'true', 'false', 'null'
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

    // Comments (Single line: //)
    if (char === '/' && source[current + 1] === '/') {
      while (current < source.length && source[current] !== '\n') {
        current++;
        column++;
      }
      continue;
    }

    // Numbers (integer and float)
    if (/[0-9]/.test(char)) {
      let value = '';
      const startCol = column;
      while (current < source.length && /[0-9.]/.test(source[current])) {
        value += source[current];
        current++;
        column++;
      }
      tokens.push({ type: TokenType.Number, value, line, column: startCol });
      continue;
    }

    // Identifiers and Keywords
    if (/[a-zA-Z_$]/.test(char)) {
      let value = '';
      const startCol = column;
      while (current < source.length && /[a-zA-Z0-9_$]/.test(source[current])) {
        value += source[current];
        current++;
        column++;
      }
      const type = KEYWORDS.has(value) ? TokenType.Keyword : TokenType.Identifier;
      tokens.push({ type, value, line, column: startCol });
      continue;
    }

    // Strings
    if (char === '"' || char === "'") {
      const quote = char;
      let value = '';
      const startCol = column;
      current++; // skip open quote
      column++;
      while (current < source.length && source[current] !== quote) {
        if (source[current] === '\\') {
          current++;
          column++;
          const esc = source[current];
          value += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc;
        } else {
          value += source[current];
        }
        current++;
        column++;
      }
      current++; // skip close quote
      column++;
      tokens.push({ type: TokenType.String, value, line, column: startCol });
      continue;
    }

    // Three-char operators
    const threeChar = source.slice(current, current + 3);
    if (threeChar === '===' || threeChar === '!==') {
      tokens.push({ type: TokenType.Operator, value: threeChar, line, column });
      current += 3; column += 3;
      continue;
    }

    // Two-char operators
    const twoChar = source.slice(current, current + 2);
    if (['==', '!=', '<=', '>=', '++', '--', '&&', '||'].includes(twoChar)) {
      tokens.push({ type: TokenType.Operator, value: twoChar, line, column });
      current += 2; column += 2;
      continue;
    }

    // Single-char operators
    if (/[+\-*/=<>!%]/.test(char)) {
      tokens.push({ type: TokenType.Operator, value: char, line, column });
      current++; column++;
      continue;
    }

    // Punctuation (including square brackets for arrays)
    if (/[(){};,.:[\]]/.test(char)) {
      tokens.push({ type: TokenType.Punctuation, value: char, line, column });
      current++; column++;
      continue;
    }

    throw new Error(`Unexpected character: '${char}' at ${line}:${column}`);
  }

  tokens.push({ type: TokenType.EOF, value: 'EOF', line, column });
  return tokens;
}