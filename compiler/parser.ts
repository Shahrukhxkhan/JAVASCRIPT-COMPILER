import { Token, Program, ASTNode, ParseError } from '../types';
import { TokenType, ASTNodeType } from '../constants';

export class Parser {
  private tokens: Token[];
  private current: number = 0;
  public parseErrors: ParseError[] = [];

  // Track loop nesting for break/continue validation
  private loopDepth: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  public parse(): Program {
    this.parseErrors = [];
    const body: ASTNode[] = [];
    while (!this.isAtEnd()) {
      const node = this.safeDeclaration();
      if (node) body.push(node);
    }
    return { type: ASTNodeType.Program, body };
  }

  // ──────── Error Recovery ────────

  /** Wraps declaration() with try/catch; on error recovers by synchronizing. */
  private safeDeclaration(): ASTNode | null {
    try {
      return this.declaration();
    } catch (err: any) {
      const tok = this.peek();
      this.parseErrors.push({
        message: err.message,
        line: tok.line,
        col: tok.column,
        recovered: true,
      });
      this.synchronize();
      return null;
    }
  }

  /** Skip tokens until a safe recovery point (statement boundary). */
  private synchronize(): void {
    this.advance();
    while (!this.isAtEnd()) {
      if (this.previous().value === ';') return;
      if (this.previous().type === TokenType.Punctuation && this.previous().value === '}') return;
      const v = this.peek().value;
      if (
        this.peek().type === TokenType.Keyword &&
        ['function', 'let', 'const', 'if', 'while', 'for', 'return', 'print'].includes(v)
      ) return;
      this.advance();
    }
  }

  // ──────── Declarations ────────

  private declaration(): ASTNode {
    if (this.matchKeyword('let') || this.matchKeyword('const')) return this.varDeclaration();
    if (this.matchKeyword('function')) return this.funcDeclaration();
    return this.statement();
  }

  private varDeclaration(): ASTNode {
    const nameTok = this.consume(TokenType.Identifier, "Expected variable name.");
    let init: ASTNode | null = null;
    if (this.match(TokenType.Operator, '=')) {
      init = this.expression();
    }
    this.consume(TokenType.Punctuation, ';', "Expected ';' after variable declaration.");
    return {
      type: ASTNodeType.VariableDeclaration,
      name: nameTok.value,
      init,
      line: nameTok.line,
      col: nameTok.column,
    };
  }

  private funcDeclaration(): ASTNode {
    const nameTok = this.consume(TokenType.Identifier, "Expected function name.");
    this.consume(TokenType.Punctuation, '(', "Expected '(' after function name.");
    const params: string[] = [];
    if (!this.check(TokenType.Punctuation, ')')) {
      do {
        params.push(this.consume(TokenType.Identifier, "Expected parameter name.").value);
      } while (this.match(TokenType.Punctuation, ','));
    }
    this.consume(TokenType.Punctuation, ')', "Expected ')' after parameters.");
    this.consume(TokenType.Punctuation, '{', "Expected '{' before function body.");
    const body = this.block();
    return {
      type: ASTNodeType.FunctionDeclaration,
      name: nameTok.value,
      params,
      body,
      line: nameTok.line,
      col: nameTok.column,
    };
  }

  // ──────── Statements ────────

  private statement(): ASTNode {
    if (this.matchKeyword('if')) return this.ifStatement();
    if (this.matchKeyword('while')) return this.whileStatement();
    if (this.matchKeyword('for')) return this.forStatement();
    if (this.matchKeyword('break')) return this.breakStatement();
    if (this.matchKeyword('continue')) return this.continueStatement();
    if (this.matchKeyword('return')) return this.returnStatement();
    if (this.matchKeyword('print')) return this.printStatement();
    if (this.match(TokenType.Punctuation, '{')) return this.block();
    return this.expressionStatement();
  }

  private ifStatement(): ASTNode {
    const line = this.previous().line;
    this.consume(TokenType.Punctuation, '(', "Expected '(' after 'if'.");
    const condition = this.expression();
    this.consume(TokenType.Punctuation, ')', "Expected ')' after if condition.");
    const thenBranch = this.statement();
    let elseBranch: ASTNode | null = null;
    if (this.matchKeyword('else')) {
      elseBranch = this.statement();
    }
    return { type: ASTNodeType.IfStatement, test: condition, consequent: thenBranch, alternate: elseBranch, line };
  }

  private whileStatement(): ASTNode {
    const line = this.previous().line;
    this.consume(TokenType.Punctuation, '(', "Expected '(' after 'while'.");
    const condition = this.expression();
    this.consume(TokenType.Punctuation, ')', "Expected ')' after while condition.");
    this.loopDepth++;
    const body = this.statement();
    this.loopDepth--;
    return { type: ASTNodeType.WhileStatement, test: condition, body, line };
  }

  private forStatement(): ASTNode {
    const line = this.previous().line;
    this.consume(TokenType.Punctuation, '(', "Expected '(' after 'for'.");

    // Init: variable declaration or expression or empty
    let init: ASTNode | null = null;
    if (!this.check(TokenType.Punctuation, ';')) {
      if (this.matchKeyword('let') || this.matchKeyword('const')) {
        init = this.varDeclaration(); // already consumes ';'
      } else {
        init = this.expressionStatement(); // already consumes ';'
      }
    } else {
      this.advance(); // consume ';'
    }

    // Condition
    let test: ASTNode | null = null;
    if (!this.check(TokenType.Punctuation, ';')) {
      test = this.expression();
    }
    this.consume(TokenType.Punctuation, ';', "Expected ';' after for condition.");

    // Update
    let update: ASTNode | null = null;
    if (!this.check(TokenType.Punctuation, ')')) {
      update = this.expression();
    }
    this.consume(TokenType.Punctuation, ')', "Expected ')' after for clauses.");

    this.loopDepth++;
    const body = this.statement();
    this.loopDepth--;

    return { type: ASTNodeType.ForStatement, init, test, update, body, line };
  }

  private breakStatement(): ASTNode {
    const line = this.previous().line;
    if (this.loopDepth === 0) throw new Error(`'break' used outside of a loop at line ${line}.`);
    this.consume(TokenType.Punctuation, ';', "Expected ';' after 'break'.");
    return { type: ASTNodeType.BreakStatement, line };
  }

  private continueStatement(): ASTNode {
    const line = this.previous().line;
    if (this.loopDepth === 0) throw new Error(`'continue' used outside of a loop at line ${line}.`);
    this.consume(TokenType.Punctuation, ';', "Expected ';' after 'continue'.");
    return { type: ASTNodeType.ContinueStatement, line };
  }

  private returnStatement(): ASTNode {
    const line = this.previous().line;
    let argument: ASTNode | null = null;
    if (!this.check(TokenType.Punctuation, ';')) {
      argument = this.expression();
    }
    this.consume(TokenType.Punctuation, ';', "Expected ';' after return value.");
    return { type: ASTNodeType.ReturnStatement, argument, line };
  }

  private printStatement(): ASTNode {
    const line = this.previous().line;
    this.consume(TokenType.Punctuation, '(', "Expected '(' after print.");
    const argument = this.expression();
    this.consume(TokenType.Punctuation, ')', "Expected ')' after print argument.");
    this.consume(TokenType.Punctuation, ';', "Expected ';' after print statement.");
    return {
      type: ASTNodeType.ExpressionStatement,
      expression: {
        type: ASTNodeType.CallExpression,
        callee: { type: ASTNodeType.Identifier, value: 'print' },
        arguments: [argument],
      },
      line,
    };
  }

  private block(): ASTNode {
    const line = this.previous().line;
    const statements: ASTNode[] = [];
    while (!this.check(TokenType.Punctuation, '}') && !this.isAtEnd()) {
      const node = this.safeDeclaration();
      if (node) statements.push(node);
    }
    this.consume(TokenType.Punctuation, '}', "Expected '}' after block.");
    return { type: ASTNodeType.BlockStatement, body: statements, line };
  }

  private expressionStatement(): ASTNode {
    const line = this.peek().line;
    const expr = this.expression();
    this.consume(TokenType.Punctuation, ';', "Expected ';' after expression.");
    return { type: ASTNodeType.ExpressionStatement, expression: expr, line };
  }

  // ──────── Expressions ────────

  private expression(): ASTNode {
    return this.assignment();
  }

  private assignment(): ASTNode {
    const expr = this.logicalOr();

    if (this.match(TokenType.Operator, '=')) {
      const line = this.previous().line;
      const value = this.assignment();
      if (expr.type === ASTNodeType.Identifier) {
        return { type: ASTNodeType.AssignmentExpression, left: expr, right: value, line };
      }
      if (expr.type === ASTNodeType.IndexExpression) {
        return { type: ASTNodeType.AssignmentExpression, left: expr, right: value, line };
      }
      if (expr.type === ASTNodeType.MemberExpression) {
        return { type: ASTNodeType.AssignmentExpression, left: expr, right: value, line };
      }
      throw new Error("Invalid assignment target.");
    }
    return expr;
  }

  private logicalOr(): ASTNode {
    let expr = this.logicalAnd();
    while (this.match(TokenType.Operator, '||')) {
      const line = this.previous().line;
      const right = this.logicalAnd();
      expr = { type: ASTNodeType.BinaryExpression, operator: '||', left: expr, right, line };
    }
    return expr;
  }

  private logicalAnd(): ASTNode {
    let expr = this.equality();
    while (this.match(TokenType.Operator, '&&')) {
      const line = this.previous().line;
      const right = this.equality();
      expr = { type: ASTNodeType.BinaryExpression, operator: '&&', left: expr, right, line };
    }
    return expr;
  }

  private equality(): ASTNode {
    let expr = this.comparison();
    while (
      this.match(TokenType.Operator, '==') || this.match(TokenType.Operator, '===') ||
      this.match(TokenType.Operator, '!=') || this.match(TokenType.Operator, '!==')
    ) {
      const operator = this.previous().value;
      const line = this.previous().line;
      const right = this.comparison();
      expr = { type: ASTNodeType.BinaryExpression, operator, left: expr, right, line };
    }
    return expr;
  }

  private comparison(): ASTNode {
    let expr = this.term();
    while (
      this.match(TokenType.Operator, '>') || this.match(TokenType.Operator, '<') ||
      this.match(TokenType.Operator, '>=') || this.match(TokenType.Operator, '<=')
    ) {
      const operator = this.previous().value;
      const line = this.previous().line;
      const right = this.term();
      expr = { type: ASTNodeType.BinaryExpression, operator, left: expr, right, line };
    }
    return expr;
  }

  private term(): ASTNode {
    let expr = this.factor();
    while (this.match(TokenType.Operator, '+') || this.match(TokenType.Operator, '-')) {
      const operator = this.previous().value;
      const line = this.previous().line;
      const right = this.factor();
      expr = { type: ASTNodeType.BinaryExpression, operator, left: expr, right, line };
    }
    return expr;
  }

  private factor(): ASTNode {
    let expr = this.unary();
    while (this.match(TokenType.Operator, '*') || this.match(TokenType.Operator, '/') || this.match(TokenType.Operator, '%')) {
      const operator = this.previous().value;
      const line = this.previous().line;
      const right = this.unary();
      expr = { type: ASTNodeType.BinaryExpression, operator, left: expr, right, line };
    }
    return expr;
  }

  private unary(): ASTNode {
    if (this.match(TokenType.Operator, '!') || this.match(TokenType.Operator, '-')) {
      const operator = this.previous().value;
      const line = this.previous().line;
      const right = this.unary();
      return { type: ASTNodeType.BinaryExpression, operator: operator === '-' ? 'UNARY_MINUS' : 'NOT', left: { type: ASTNodeType.Literal, value: 0, line }, right, line };
    }
    // Prefix ++ / --
    if (this.match(TokenType.Operator, '++') || this.match(TokenType.Operator, '--')) {
      const op = this.previous().value;
      const line = this.previous().line;
      const operand = this.call();
      return { type: ASTNodeType.UpdateExpression, operator: op, argument: operand, prefix: true, line };
    }
    return this.postfix();
  }

  private postfix(): ASTNode {
    let expr = this.call();
    if (this.match(TokenType.Operator, '++') || this.match(TokenType.Operator, '--')) {
      const op = this.previous().value;
      const line = this.previous().line;
      return { type: ASTNodeType.UpdateExpression, operator: op, argument: expr, prefix: false, line };
    }
    return expr;
  }

  private call(): ASTNode {
    let expr = this.primary();
    while (true) {
      if (this.match(TokenType.Punctuation, '(')) {
        expr = this.finishCall(expr);
      } else if (this.match(TokenType.Punctuation, '.')) {
        const name = this.consume(TokenType.Identifier, "Expected property name after '.'.");
        expr = {
          type: ASTNodeType.MemberExpression,
          object: expr,
          property: { type: ASTNodeType.Identifier, value: name.value },
          line: name.line,
        };
      } else if (this.match(TokenType.Punctuation, '[')) {
        const line = this.previous().line;
        const index = this.expression();
        this.consume(TokenType.Punctuation, ']', "Expected ']' after index.");
        expr = { type: ASTNodeType.IndexExpression, object: expr, index, line };
      } else {
        break;
      }
    }
    return expr;
  }

  private finishCall(callee: ASTNode): ASTNode {
    const args: ASTNode[] = [];
    if (!this.check(TokenType.Punctuation, ')')) {
      do {
        args.push(this.expression());
      } while (this.match(TokenType.Punctuation, ','));
    }
    const closeParen = this.consume(TokenType.Punctuation, ')', "Expected ')' after arguments.");
    return { type: ASTNodeType.CallExpression, callee, arguments: args, line: closeParen.line };
  }

  private primary(): ASTNode {
    const tok = this.peek();

    // Boolean / null literals
    if (this.matchKeyword('true')) return { type: ASTNodeType.Literal, value: true, line: tok.line };
    if (this.matchKeyword('false')) return { type: ASTNodeType.Literal, value: false, line: tok.line };
    if (this.matchKeyword('null')) return { type: ASTNodeType.Literal, value: null, line: tok.line };

    if (this.match(TokenType.Number)) return { type: ASTNodeType.Literal, value: Number(this.previous().value), line: tok.line };
    if (this.match(TokenType.String)) return { type: ASTNodeType.Literal, value: this.previous().value, line: tok.line };
    if (this.match(TokenType.Identifier)) return { type: ASTNodeType.Identifier, value: this.previous().value, line: tok.line };

    // Grouped expression
    if (this.match(TokenType.Punctuation, '(')) {
      const expr = this.expression();
      this.consume(TokenType.Punctuation, ')', "Expected ')' after expression.");
      return expr;
    }

    // Array literal: [a, b, c]
    if (this.match(TokenType.Punctuation, '[')) {
      const line = this.previous().line;
      const elements: ASTNode[] = [];
      if (!this.check(TokenType.Punctuation, ']')) {
        do {
          elements.push(this.expression());
        } while (this.match(TokenType.Punctuation, ','));
      }
      this.consume(TokenType.Punctuation, ']', "Expected ']' after array elements.");
      return { type: ASTNodeType.ArrayExpression, elements, line };
    }

    // Object literal: { key: value, ... }
    if (this.match(TokenType.Punctuation, '{')) {
      const line = this.previous().line;
      const properties: { key: string; value: ASTNode }[] = [];
      if (!this.check(TokenType.Punctuation, '}')) {
        do {
          // key can be identifier or string
          let key: string;
          if (this.check(TokenType.Identifier)) {
            key = this.advance().value;
          } else if (this.check(TokenType.String)) {
            key = this.advance().value;
          } else {
            throw new Error(`Expected property key at line ${this.peek().line}`);
          }
          this.consume(TokenType.Punctuation, ':', "Expected ':' after property key.");
          const value = this.expression();
          properties.push({ key, value });
        } while (this.match(TokenType.Punctuation, ',') && !this.check(TokenType.Punctuation, '}'));
      }
      this.consume(TokenType.Punctuation, '}', "Expected '}' after object properties.");
      return { type: ASTNodeType.ObjectExpression, properties, line };
    }

    throw new Error(`Unexpected token: '${tok.value}' at line ${tok.line}:${tok.column}`);
  }

  // ──────── Helpers ────────

  private match(type: TokenType, value?: string): boolean {
    if (this.check(type, value)) { this.advance(); return true; }
    return false;
  }

  private matchKeyword(keyword: string): boolean {
    if (this.check(TokenType.Keyword, keyword)) { this.advance(); return true; }
    return false;
  }

  private check(type: TokenType, value?: string): boolean {
    if (this.isAtEnd()) return false;
    const token = this.peek();
    if (token.type !== type) return false;
    if (value !== undefined && token.value !== value) return false;
    return true;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private consume(type: TokenType, arg2: string, arg3?: string): Token {
    const value = arg3 ? arg2 : undefined;
    const message = arg3 ? arg3 : arg2;
    if (this.check(type, value)) return this.advance();
    throw new Error(message + ` (found '${this.peek().value}' at line ${this.peek().line}:${this.peek().column})`);
  }
}