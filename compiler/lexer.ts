import { Token } from '../types';
import { TokenType } from '../constants';

const KEYWORDS = new Set([
  'let', 'const', 'var', 'function', 'if', 'else', 'return', 'print',
  'while', 'for', 'try', 'catch', 'finally', 'class', 'extends',
  'async', 'await', 'throw', 'new', 'this', 'super', 'true', 'false', 'null', 'undefined'
]);

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let current = 0;
  let line = 1;
  let column = 1;

  // Stack to keep track of template literal nesting
  // Each element is the brace nesting level when the template expression started
  const templateStack: number[] = [];
  let braceLevel = 0;

  while (current < source.length) {
    let char = source[current];

    // If we are in a template literal (after a '}' that closes an expression)
    // We need to handle this at the end of the loop or when we see '}'
    // Actually, let's handle it when we see '}' in the punctuation section.

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

    // Numbers and BigInt
    if (/[0-9]/.test(char)) {
      let value = '';
      while (current < source.length && /[0-9]/.test(source[current])) {
        value += source[current];
        current++;
        column++;
      }
      if (current < source.length && source[current] === 'n') {
        value += 'n';
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

    // Strings and Template Literals
    if (char === '"' || char === "'") {
      const quote = char;
      let value = '';
      current++; // skip open quote
      column++;
      while (current < source.length && source[current] !== quote) {
        if (source[current] === '\n') {
          line++;
          column = 1;
        }
        value += source[current];
        current++;
        column++;
      }
      current++; // skip close quote
      column++;
      tokens.push({ 
        type: TokenType.String, 
        value, 
        line, 
        column 
      });
      continue;
    }

    if (char === '`' || (char === '}' && templateStack.length > 0 && braceLevel === templateStack[templateStack.length - 1])) {
      let isTemplateTail = false;
      let isTemplateHead = false;
      let value = '';
      
      if (char === '`') {
        current++; // skip open backtick
        column++;
        isTemplateHead = true;
      } else {
        // It's a '}' closing a template expression
        templateStack.pop();
        current++; // skip '}'
        column++;
      }

      while (current < source.length) {
        if (source[current] === '`') {
          isTemplateTail = true;
          current++; // skip close backtick
          column++;
          break;
        }
        if (source[current] === '$' && source[current + 1] === '{') {
          current += 2; // skip '${'
          column += 2;
          templateStack.push(braceLevel);
          break;
        }
        if (source[current] === '\n') {
          line++;
          column = 1;
        }
        value += source[current];
        current++;
        column++;
      }

      if (isTemplateHead && isTemplateTail) {
        tokens.push({ type: TokenType.TemplateNoSubstitution, value, line, column });
      } else if (isTemplateHead) {
        tokens.push({ type: TokenType.TemplateHead, value, line, column });
      } else if (isTemplateTail) {
        tokens.push({ type: TokenType.TemplateTail, value, line, column });
      } else {
        tokens.push({ type: TokenType.TemplateMiddle, value, line, column });
      }
      continue;
    }

    // Punctuation and Operators
    const twoCharMap: Record<string, boolean> = { 
      '==': true, '<=': true, '>=': true, '!=': true,
      '=>': true, '++': true, '--': true, '+=': true,
      '-=': true, '*=': true, '/=': true
    };
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

    if (/[(){};,.:[\]]/.test(char)) {
      if (char === '{') braceLevel++;
      if (char === '}') braceLevel--;
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