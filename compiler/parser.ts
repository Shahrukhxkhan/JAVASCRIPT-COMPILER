import { Token, Program, ASTNode } from '../types';
import { TokenType, ASTNodeType } from '../constants';

export class Parser {
  private tokens: Token[];
  private current: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  public parse(): Program {
    const body: ASTNode[] = [];
    while (!this.isAtEnd()) {
      body.push(this.declaration());
    }
    return { type: ASTNodeType.Program, body };
  }

  private declaration(): ASTNode {
    if (this.matchKeyword('let') || this.matchKeyword('const')) {
      return this.varDeclaration();
    }
    if (this.matchKeyword('function')) {
      return this.funcDeclaration();
    }
    return this.statement();
  }

  private varDeclaration(): ASTNode {
    const name = this.consume(TokenType.Identifier, "Expected variable name.");
    let init = null;
    if (this.match(TokenType.Operator, '=')) {
      init = this.expression();
    }
    this.consume(TokenType.Punctuation, ';', "Expected ';' after variable declaration.");
    return {
      type: ASTNodeType.VariableDeclaration,
      name: name.value,
      init
    };
  }

  private funcDeclaration(): ASTNode {
    const name = this.consume(TokenType.Identifier, "Expected function name.");
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
      name: name.value,
      params,
      body
    };
  }

  private statement(): ASTNode {
    if (this.matchKeyword('if')) return this.ifStatement();
    if (this.matchKeyword('return')) return this.returnStatement();
    if (this.matchKeyword('print')) return this.printStatement();
    if (this.match(TokenType.Punctuation, '{')) return this.block();
    return this.expressionStatement();
  }

  private ifStatement(): ASTNode {
    this.consume(TokenType.Punctuation, '(', "Expected '(' after 'if'.");
    const condition = this.expression();
    this.consume(TokenType.Punctuation, ')', "Expected ')' after if condition.");
    
    const thenBranch = this.statement();
    let elseBranch = null;
    if (this.matchKeyword('else')) {
      elseBranch = this.statement();
    }
    return {
      type: ASTNodeType.IfStatement,
      test: condition,
      consequent: thenBranch,
      alternate: elseBranch
    };
  }

  private returnStatement(): ASTNode {
    let argument = null;
    if (!this.check(TokenType.Punctuation, ';')) {
      argument = this.expression();
    }
    this.consume(TokenType.Punctuation, ';', "Expected ';' after return value.");
    return { type: ASTNodeType.ReturnStatement, argument };
  }

  private printStatement(): ASTNode {
    // Treat 'print' as a built-in statement for simpler codegen/VM
    this.consume(TokenType.Punctuation, '(', "Expected '(' after print.");
    const argument = this.expression();
    this.consume(TokenType.Punctuation, ')', "Expected ')' after print argument.");
    this.consume(TokenType.Punctuation, ';', "Expected ';' after print statement.");
    
    // Represent print as a CallExpression for consistency or a custom node
    // Let's use a specialized CallExpression to a native 'print'
    return {
        type: ASTNodeType.ExpressionStatement,
        expression: {
            type: ASTNodeType.CallExpression,
            callee: { type: ASTNodeType.Identifier, value: 'print' },
            arguments: [argument]
        }
    };
  }

  private block(): ASTNode {
    const statements: ASTNode[] = [];
    while (!this.check(TokenType.Punctuation, '}') && !this.isAtEnd()) {
      statements.push(this.declaration());
    }
    this.consume(TokenType.Punctuation, '}', "Expected '}' after block.");
    return { type: ASTNodeType.BlockStatement, body: statements };
  }

  private expressionStatement(): ASTNode {
    const expr = this.expression();
    this.consume(TokenType.Punctuation, ';', "Expected ';' after expression.");
    return { type: ASTNodeType.ExpressionStatement, expression: expr };
  }

  private expression(): ASTNode {
    return this.assignment();
  }

  private assignment(): ASTNode {
    const expr = this.equality();
    if (this.match(TokenType.Operator, '=')) {
      const value = this.assignment();
      if (expr.type === ASTNodeType.Identifier) {
        return {
          type: ASTNodeType.AssignmentExpression,
          left: expr,
          right: value
        };
      }
      throw new Error("Invalid assignment target.");
    }
    return expr;
  }

  private equality(): ASTNode {
    let expr = this.comparison();
    while (this.match(TokenType.Operator, '==') || this.match(TokenType.Operator, '!=')) {
      const operator = this.previous().value;
      const right = this.comparison();
      expr = { type: ASTNodeType.BinaryExpression, operator, left: expr, right };
    }
    return expr;
  }

  private comparison(): ASTNode {
    let expr = this.term();
    while (this.match(TokenType.Operator, '>') || this.match(TokenType.Operator, '<')) {
       const operator = this.previous().value;
       const right = this.term();
       expr = { type: ASTNodeType.BinaryExpression, operator, left: expr, right };
    }
    return expr;
  }

  private term(): ASTNode {
    let expr = this.factor();
    while (this.match(TokenType.Operator, '+') || this.match(TokenType.Operator, '-')) {
      const operator = this.previous().value;
      const right = this.factor();
      expr = { type: ASTNodeType.BinaryExpression, operator, left: expr, right };
    }
    return expr;
  }

  private factor(): ASTNode {
    let expr = this.call();
    while (this.match(TokenType.Operator, '*') || this.match(TokenType.Operator, '/')) {
      const operator = this.previous().value;
      const right = this.call();
      expr = { type: ASTNodeType.BinaryExpression, operator, left: expr, right };
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
                property: { type: ASTNodeType.Identifier, value: name.value }
            };
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
      this.consume(TokenType.Punctuation, ')', "Expected ')' after arguments.");
      return {
          type: ASTNodeType.CallExpression,
          callee,
          arguments: args
      };
  }

  private primary(): ASTNode {
    if (this.match(TokenType.Number)) return { type: ASTNodeType.Literal, value: Number(this.previous().value) };
    if (this.match(TokenType.String)) return { type: ASTNodeType.Literal, value: this.previous().value };
    if (this.match(TokenType.Identifier)) return { type: ASTNodeType.Identifier, value: this.previous().value };
    if (this.match(TokenType.Punctuation, '(')) {
      const expr = this.expression();
      this.consume(TokenType.Punctuation, ')', "Expected ')' after expression.");
      return expr;
    }
    throw new Error(`Parse error at token: ${this.peek().value}`);
  }

  // Helpers
  private match(...types: any[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    if (arguments.length === 2 && typeof arguments[1] === 'string') {
        // match(TokenType, Value) overload check
        if (this.check(arguments[0], arguments[1])) {
            this.advance();
            return true;
        }
    }
    return false;
  }

  private matchKeyword(keyword: string): boolean {
    if (this.check(TokenType.Keyword) && this.peek().value === keyword) {
      this.advance();
      return true;
    }
    return false;
  }

  private check(type: TokenType, value?: string): boolean {
    if (this.isAtEnd()) return false;
    const token = this.peek();
    if (token.type !== type) return false;
    if (value && token.value !== value) return false;
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

  private consume(type: TokenType, message: string): Token;
  private consume(type: TokenType, value: string, message: string): Token;
  private consume(type: TokenType, arg2: string, arg3?: string): Token {
      const value = arg3 ? arg2 : undefined;
      const message = arg3 ? arg3 : arg2;
      
      if (this.check(type, value)) return this.advance();
      throw new Error(message + ` found ${this.peek().value} at line ${this.peek().line}`);
  }
}