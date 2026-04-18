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
    return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.Program, body };
  }

  private declaration(): ASTNode {
    if (this.matchKeyword('let') || this.matchKeyword('const') || this.matchKeyword('var')) {
      const kind = this.previous().value;
      return this.varDeclaration(kind);
    }
    if (this.matchKeyword('function')) {
      return this.funcDeclaration();
    }
    if (this.matchKeyword('class')) {
      return this.classDeclaration();
    }
    if (this.matchKeyword('async')) {
      if (this.check(TokenType.Keyword, 'function')) {
        this.advance();
        return this.funcDeclaration(true);
      }
    }
    return this.statement();
  }

  private varDeclaration(kind: string): ASTNode {
    const target = this.parseBindingPattern();
    let init = null;
    if (this.match(TokenType.Operator, '=')) {
      init = this.expression();
    }
    this.consume(TokenType.Punctuation, ';', "Expected ';' after variable declaration.");
    return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.VariableDeclaration,
      kind,
      name: typeof target === 'string' ? target : undefined,
      target: typeof target !== 'string' ? target : undefined,
      init
    };
  }

  private parseBindingPattern(): string | ASTNode {
    if (this.match(TokenType.Punctuation, '[')) {
      const elements: any[] = [];
      while (!this.check(TokenType.Punctuation, ']')) {
        if (this.match(TokenType.Punctuation, ',')) {
          elements.push(null);
        } else {
          let isRest = false;
          if (this.match(TokenType.Punctuation, '...')) {
            isRest = true;
          }
          let pattern = this.parseBindingPattern();
          let defaultValue = null;
          if (!isRest && this.match(TokenType.Operator, '=')) {
              defaultValue = this.expression();
          }
          elements.push({ pattern, isRest, default: defaultValue });
          if (!this.check(TokenType.Punctuation, ']')) {
            this.consume(TokenType.Punctuation, ',');
          }
        }
      }
      this.consume(TokenType.Punctuation, ']', "Expected ']' after array pattern.");
      return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.ArrayPattern, elements };
    }
    if (this.match(TokenType.Punctuation, '{')) {
      const properties: any[] = [];
      while (!this.check(TokenType.Punctuation, '}')) {
        let isRest = false;
        if (this.match(TokenType.Punctuation, '...')) {
          isRest = true;
          const restTarget = this.consume(TokenType.Identifier, "Expected identifier after rest element.").value;
          properties.push({ key: null, value: restTarget, isRest });
          if (!this.check(TokenType.Punctuation, '}')) {
            this.consume(TokenType.Punctuation, ',');
          }
          continue;
        }
        
        const key = this.consume(TokenType.Identifier, "Expected property name.").value;
        let value: string | ASTNode = key;
        if (this.match(TokenType.Punctuation, ':')) {
          value = this.parseBindingPattern();
        }
        let defaultValue = null;
        if (this.match(TokenType.Operator, '=')) {
            defaultValue = this.expression();
        }
        properties.push({ key, value, isRest: false, default: defaultValue });
        if (!this.check(TokenType.Punctuation, '}')) {
          this.consume(TokenType.Punctuation, ',');
        }
      }
      this.consume(TokenType.Punctuation, '}', "Expected '}' after object pattern.");
      return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.ObjectPattern, properties };
    }
    return this.consume(TokenType.Identifier, "Expected identifier.").value;
  }

  private classDeclaration(): ASTNode {
    const name = this.consume(TokenType.Identifier, "Expected class name.");
    let superClass = null;
    if (this.matchKeyword('extends')) {
      superClass = this.consume(TokenType.Identifier, "Expected superclass name.").value;
    }
    this.consume(TokenType.Punctuation, '{', "Expected '{' before class body.");
    const body: ASTNode[] = [];
    while (!this.check(TokenType.Punctuation, '}') && !this.isAtEnd()) {
      if (this.check(TokenType.Identifier) && this.checkNext(TokenType.Punctuation, '(')) {
        body.push(this.methodDeclaration());
      } else {
        body.push(this.declaration());
      }
    }
    this.consume(TokenType.Punctuation, '}', "Expected '}' after class body.");
    return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.ClassDeclaration, name: name.value, superClass, body };
  }

  private methodDeclaration(): ASTNode {
    const name = this.consume(TokenType.Identifier, "Expected method name.");
    return this.finishFunction(name.value);
  }

  private checkNext(type: TokenType, value?: string): boolean {
    if (this.current + 1 >= this.tokens.length) return false;
    const token = this.tokens[this.current + 1];
    if (token.type !== type) return false;
    if (value !== undefined && token.value !== value) return false;
    return true;
  }

  private funcDeclaration(isAsync: boolean = false): ASTNode {
    let isGenerator = false;
    if (this.match(TokenType.Operator, '*')) {
        isGenerator = true;
    }
    const name = this.consume(TokenType.Identifier, "Expected function name.");
    return this.finishFunction(name.value, isAsync, isGenerator);
  }

  private finishFunction(name: string | null, isAsync: boolean = false, isGenerator: boolean = false): ASTNode {
    this.consume(TokenType.Punctuation, '(', "Expected '(' after function name.");
    const params: string[] = [];
    if (!this.check(TokenType.Punctuation, ')')) {
      do {
        if (this.match(TokenType.Punctuation, '...')) {
          const restName = this.consume(TokenType.Identifier, "Expected rest parameter name.");
          params.push('...' + restName.value);
        } else {
          params.push(this.consume(TokenType.Identifier, "Expected parameter name.").value);
        }
      } while (this.match(TokenType.Punctuation, ','));
    }
    this.consume(TokenType.Punctuation, ')', "Expected ')' after parameters.");
    this.consume(TokenType.Punctuation, '{', "Expected '{' before function body.");
    const body = this.block();
    return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.FunctionDeclaration,
      name,
      params,
      body,
      async: isAsync,
      generator: isGenerator
    };
  }

  private statement(): ASTNode {
    if (this.matchKeyword('if')) return this.ifStatement();
    if (this.matchKeyword('while')) return this.whileStatement();
    if (this.matchKeyword('do')) return this.doWhileStatement();
    if (this.matchKeyword('for')) return this.forStatement();
    if (this.matchKeyword('break')) return this.breakStatement();
    if (this.matchKeyword('continue')) return this.continueStatement();
    if (this.matchKeyword('switch')) return this.switchStatement();
    if (this.matchKeyword('try')) return this.tryStatement();
    if (this.matchKeyword('return')) return this.returnStatement();
    if (this.matchKeyword('print')) return this.printStatement();
    if (this.matchKeyword('throw')) return this.throwStatement();
    if (this.match(TokenType.Punctuation, '{')) return this.block();
    return this.expressionStatement();
  }

  private whileStatement(): ASTNode {
    this.consume(TokenType.Punctuation, '(', "Expected '(' after 'while'.");
    const condition = this.expression();
    this.consume(TokenType.Punctuation, ')', "Expected ')' after while condition.");
    const body = this.statement();
    return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.WhileStatement, test: condition, body };
  }

  private doWhileStatement(): ASTNode {
    const body = this.statement();
    this.consume(TokenType.Keyword, 'while', "Expected 'while' after do block.");
    this.consume(TokenType.Punctuation, '(', "Expected '(' after 'while'.");
    const condition = this.expression();
    this.consume(TokenType.Punctuation, ')', "Expected ')' after while condition.");
    this.consume(TokenType.Punctuation, ';', "Expected ';' after do-while condition.");
    return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.DoWhileStatement, test: condition, body };
  }

  private breakStatement(): ASTNode {
    this.consume(TokenType.Punctuation, ';', "Expected ';' after break.");
    return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.BreakStatement };
  }

  private continueStatement(): ASTNode {
    this.consume(TokenType.Punctuation, ';', "Expected ';' after continue.");
    return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.ContinueStatement };
  }

  private switchStatement(): ASTNode {
    this.consume(TokenType.Punctuation, '(', "Expected '(' after 'switch'.");
    const discriminant = this.expression();
    this.consume(TokenType.Punctuation, ')', "Expected ')' after switch value.");
    this.consume(TokenType.Punctuation, '{', "Expected '{' before switch body.");
    
    const cases: ASTNode[] = [];
    while (!this.check(TokenType.Punctuation, '}') && !this.isAtEnd()) {
      let test = null;
      if (this.matchKeyword('case')) {
        test = this.expression();
        this.consume(TokenType.Operator, ':', "Expected ':' after case value.");
      } else if (this.matchKeyword('default')) {
        this.consume(TokenType.Operator, ':', "Expected ':' after default.");
      } else {
        throw new Error(`[Line ${this.peek().line}:${this.peek().column}] Parse Error: Expected 'case' or 'default' inside switch.`);
      }
      
      const consequent: ASTNode[] = [];
      while (!this.check(TokenType.Punctuation, '}') && !this.check(TokenType.Keyword, 'case') && !this.check(TokenType.Keyword, 'default') && !this.isAtEnd()) {
        consequent.push(this.statement());
      }
      cases.push({ line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.SwitchCase, test, consequent });
    }
    this.consume(TokenType.Punctuation, '}', "Expected '}' after switch body.");
    return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.SwitchStatement, discriminant, cases };
  }

  private forStatement(): ASTNode {
    this.consume(TokenType.Punctuation, '(', "Expected '(' after 'for'.");
    let init = null;
    let isForIn = false;
    let isForOf = false;
    let kind = null;
    
    // Parse Initialization or For-In/Of left side
    if (this.matchKeyword('let') || this.matchKeyword('const') || this.matchKeyword('var')) {
        kind = this.previous().value;
        const target = this.parseBindingPattern();
        
        if (this.matchKeyword('in')) {
            isForIn = true;
            init = { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.VariableDeclaration, kind, target: typeof target !== 'string' ? target : undefined, name: typeof target === 'string' ? target : undefined, init: null };
        } else if (this.matchKeyword('of')) {
            isForOf = true;
            init = { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.VariableDeclaration, kind, target: typeof target !== 'string' ? target : undefined, name: typeof target === 'string' ? target : undefined, init: null };
        } else {
            // Normal variable declaration
            let initVal = null;
            if (this.match(TokenType.Operator, '=')) {
                initVal = this.expression();
            }
            init = { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.VariableDeclaration, kind, target: typeof target !== 'string' ? target : undefined, name: typeof target === 'string' ? target : undefined, init: initVal };
            this.consume(TokenType.Punctuation, ';', "Expected ';' after variable declaration.");
        }
    } else if (!this.match(TokenType.Punctuation, ';')) {
        const expr = this.expression();
        if (this.matchKeyword('in')) {
            isForIn = true;
            init = expr;
        } else if (this.matchKeyword('of')) {
            isForOf = true;
            init = expr;
        } else {
            init = { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.ExpressionStatement, expression: expr };
            this.consume(TokenType.Punctuation, ';', "Expected ';' after loop initialization.");
        }
    }

    if (isForIn || isForOf) {
        const iterable = this.expression();
        this.consume(TokenType.Punctuation, ')', "Expected ')' after for clauses.");
        const body = this.statement();
        return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: isForIn ? ASTNodeType.ForInStatement : ASTNodeType.ForOfStatement, left: init, right: iterable, body };
    }

    let condition = null;
    if (!this.match(TokenType.Punctuation, ';')) {
      condition = this.expression();
      this.consume(TokenType.Punctuation, ';', "Expected ';' after loop condition.");
    }
    let increment = null;
    if (!this.match(TokenType.Punctuation, ')')) {
      increment = this.expression();
      this.consume(TokenType.Punctuation, ')', "Expected ')' after for clauses.");
    }
    const body = this.statement();
    return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.ForStatement, init, test: condition, update: increment, body };
  }

  private tryStatement(): ASTNode {
    this.consume(TokenType.Punctuation, '{', "Expected '{' after 'try'.");
    const block = this.block();
    let handler = null;
    if (this.matchKeyword('catch')) {
      this.consume(TokenType.Punctuation, '(', "Expected '(' after 'catch'.");
      const param = this.consume(TokenType.Identifier, "Expected exception name.").value;
      this.consume(TokenType.Punctuation, ')', "Expected ')' after catch parameter.");
      this.consume(TokenType.Punctuation, '{', "Expected '{' before catch body.");
      const body = this.block();
      handler = { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.CatchClause, param, body };
    }
    let finalizer = null;
    if (this.matchKeyword('finally')) {
      this.consume(TokenType.Punctuation, '{', "Expected '{' before finally body.");
      finalizer = this.block();
    }
    return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.TryStatement, block, handler, finalizer };
  }

  private throwStatement(): ASTNode {
    const argument = this.expression();
    this.consume(TokenType.Punctuation, ';', "Expected ';' after throw.");
    return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.ThrowStatement, argument };
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
    return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.IfStatement,
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
    return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.ReturnStatement, argument };
  }

  private printStatement(): ASTNode {
    this.consume(TokenType.Punctuation, '(', "Expected '(' after print.");
    const args: ASTNode[] = [];
    if (!this.check(TokenType.Punctuation, ')')) {
      do {
        args.push(this.expression());
      } while (this.match(TokenType.Punctuation, ','));
    }
    this.consume(TokenType.Punctuation, ')', "Expected ')' after print arguments.");
    this.consume(TokenType.Punctuation, ';', "Expected ';' after print statement.");
    
    return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.ExpressionStatement,
        expression: { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.CallExpression,
            callee: { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.Identifier, value: 'print' },
            arguments: args
        }
    };
  }

  private block(): ASTNode {
    const statements: ASTNode[] = [];
    while (!this.check(TokenType.Punctuation, '}') && !this.isAtEnd()) {
      statements.push(this.declaration());
    }
    this.consume(TokenType.Punctuation, '}', "Expected '}' after block.");
    return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.BlockStatement, body: statements };
  }

  private expressionStatement(): ASTNode {
    const expr = this.expression();
    this.consume(TokenType.Punctuation, ';', "Expected ';' after expression.");
    return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.ExpressionStatement, expression: expr };
  }

  private expression(): ASTNode {
    return this.assignment();
  }

  private assignment(): ASTNode {
    if (this.matchKeyword('yield')) {
       const delegate = this.match(TokenType.Operator, '*');
       let argument: ASTNode | null = null;
       if (!this.check(TokenType.Punctuation, ';') && !this.check(TokenType.Punctuation, '}') && !this.check(TokenType.Punctuation, ')') && !this.check(TokenType.Punctuation, ']')) {
           // We might just be at the end of an expression
           // Try to parse the right side. If it's a newline scenario, technically JS has rules 
           // against newline after yield. But we won't strictly enforce ASI rules here.
           argument = this.assignment();
       }
       return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.YieldExpression, delegate, argument };
    }

    const expr = this.ternary();
    if (this.match(TokenType.Operator, '=') || 
        this.match(TokenType.Operator, '+=') || 
        this.match(TokenType.Operator, '-=') ||
        this.match(TokenType.Operator, '*=') ||
        this.match(TokenType.Operator, '/=')) {
      const operator = this.previous().value;
      const value = this.assignment();
      if (expr.type === ASTNodeType.Identifier || expr.type === ASTNodeType.MemberExpression) {
        return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.AssignmentExpression,
          operator,
          left: expr,
          right: value
        };
      }
      throw new Error(`[Line ${this.previous().line}:${this.previous().column}] Parse Error: Invalid assignment target.`);
    }
    return expr;
  }

  private ternary(): ASTNode {
    let expr = this.logicalOr();
    if (this.match(TokenType.Operator, '?')) {
      const consequent = this.expression();
      this.consume(TokenType.Operator, ':', "Expected ':' in ternary expression.");
      const alternate = this.assignment(); // Right-associative
      return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.ConditionalExpression, test: expr, consequent, alternate };
    }
    return expr;
  }

  private logicalOr(): ASTNode {
    let expr = this.logicalAnd();
    while (this.match(TokenType.Operator, '||')) {
      const operator = this.previous().value;
      const right = this.logicalAnd();
      expr = { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.BinaryExpression, operator, left: expr, right };
    }
    return expr;
  }

  private logicalAnd(): ASTNode {
    let expr = this.equality();
    while (this.match(TokenType.Operator, '&&')) {
      const operator = this.previous().value;
      const right = this.equality();
      expr = { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.BinaryExpression, operator, left: expr, right };
    }
    return expr;
  }

  private equality(): ASTNode {
    let expr = this.comparison();
    while (this.match(TokenType.Operator, '==') || this.match(TokenType.Operator, '!=') || this.match(TokenType.Operator, '===') || this.match(TokenType.Operator, '!==')) {
      const operator = this.previous().value;
      const right = this.comparison();
      expr = { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.BinaryExpression, operator, left: expr, right };
    }
    return expr;
  }

  private comparison(): ASTNode {
    let expr = this.term();
    while (this.match(TokenType.Operator, '>') || this.match(TokenType.Operator, '<') || this.match(TokenType.Operator, '>=') || this.match(TokenType.Operator, '<=') || this.matchKeyword('instanceof') || this.matchKeyword('in')) {
       const operator = this.previous().value;
       const right = this.term();
       expr = { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.BinaryExpression, operator, left: expr, right };
    }
    return expr;
  }

  private term(): ASTNode {
    let expr = this.factor();
    while (this.match(TokenType.Operator, '+') || this.match(TokenType.Operator, '-')) {
      const operator = this.previous().value;
      const right = this.factor();
      expr = { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.BinaryExpression, operator, left: expr, right };
    }
    return expr;
  }

  private factor(): ASTNode {
    let expr = this.unary();
    while (this.match(TokenType.Operator, '*') || this.match(TokenType.Operator, '/')) {
      const operator = this.previous().value;
      const right = this.unary();
      expr = { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.BinaryExpression, operator, left: expr, right };
    }
    return expr;
  }

  private unary(): ASTNode {
    if (this.match(TokenType.Operator, '!') || this.match(TokenType.Operator, '-') || this.matchKeyword('typeof')) {
      const operator = this.previous().value;
      const right = this.unary();
      return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.UnaryExpression, operator, argument: right };
    }
    return this.call();
  }

  private call(): ASTNode {
    let expr = this.primary();
    while (true) {
        if (this.match(TokenType.Punctuation, '(')) {
            expr = this.finishCall(expr);
        } else if (this.match(TokenType.Operator, '?.')) {
            const name = this.consume(TokenType.Identifier, "Expected property name after '?.'.");
            expr = { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.OptionalMemberExpression,
                object: expr,
                property: { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.Identifier, value: name.value },
                computed: false,
                optional: true
            };
        } else if (this.match(TokenType.Punctuation, '.')) {
            const name = this.consume(TokenType.Identifier, "Expected property name after '.'.");
            expr = { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.MemberExpression,
                object: expr,
                property: { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.Identifier, value: name.value },
                computed: false
            };
        } else if (this.match(TokenType.Punctuation, '[')) {
            const property = this.expression();
            this.consume(TokenType.Punctuation, ']', "Expected ']' after index.");
            expr = { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.MemberExpression,
                object: expr,
                property,
                computed: true
            };
        } else if (this.check(TokenType.TemplateNoSubstitution) || this.check(TokenType.TemplateHead)) {
            const quasi = this.primary();
            expr = { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.TaggedTemplateExpression,
                tag: expr,
                quasi
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
              if (this.match(TokenType.Punctuation, '...')) {
                  args.push({ line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.SpreadElement, argument: this.expression() });
              } else {
                  args.push(this.expression());
              }
          } while (this.match(TokenType.Punctuation, ','));
      }
      this.consume(TokenType.Punctuation, ')', "Expected ')' after arguments.");
      return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.CallExpression,
          callee,
          arguments: args
      };
  }

  private primary(): ASTNode {
    if (this.matchKeyword('new')) {
      let callee;
      if (this.match(TokenType.Identifier)) {
          callee = { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.Identifier, value: this.previous()!.value };
      } else {
          callee = this.expression();
      }
      
      let args: ASTNode[] = [];
      if (this.match(TokenType.Punctuation, '(')) {
          if (!this.check(TokenType.Punctuation, ')')) {
              do {
                  if (this.match(TokenType.Punctuation, '...')) {
                      args.push({ line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.SpreadElement, argument: this.expression() });
                  } else {
                      args.push(this.expression());
                  }
              } while (this.match(TokenType.Punctuation, ','));
          }
          this.consume(TokenType.Punctuation, ')', "Expected ')' after new arguments.");
      }
      
      return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.NewExpression,
        callee: callee,
        arguments: args
      };
    }
    if (this.matchKeyword('true')) return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.Literal, value: true };
    if (this.matchKeyword('false')) return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.Literal, value: false };
    if (this.matchKeyword('null')) return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.Literal, value: null };
    if (this.matchKeyword('undefined')) return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.Literal, value: undefined };
    if (this.match(TokenType.Number)) {
      const val = this.previous().value;
      if (val.endsWith('n')) {
        return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.Literal, value: BigInt(val.slice(0, -1)) };
      }
      return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.Literal, value: Number(val) };
    }
    if (this.match(TokenType.String)) return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.Literal, value: this.previous().value };
    
    if (this.match(TokenType.TemplateNoSubstitution)) {
      return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.TemplateLiteral,
        quasis: [{ type: 'TemplateElement', value: { raw: this.previous().value, cooked: this.previous().value }, tail: true }],
        expressions: []
      };
    }

    if (this.match(TokenType.TemplateHead)) {
      const quasis: any[] = [{ type: 'TemplateElement', value: { raw: this.previous().value, cooked: this.previous().value }, tail: false }];
      const expressions: any[] = [];
      
      expressions.push(this.expression());
      
      while (this.match(TokenType.TemplateMiddle)) {
        quasis.push({ type: 'TemplateElement', value: { raw: this.previous().value, cooked: this.previous().value }, tail: false });
        expressions.push(this.expression());
      }
      
      this.consume(TokenType.TemplateTail, "Expected end of template literal.");
      quasis.push({ type: 'TemplateElement', value: { raw: this.previous().value, cooked: this.previous().value }, tail: true });
      
      return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.TemplateLiteral,
        quasis,
        expressions
      };
    }

    if (this.matchKeyword('this')) {
      return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.Identifier, value: 'this' };
    }
    if (this.match(TokenType.Identifier)) {
      const id = this.previous().value;
      if (this.match(TokenType.Operator, '=>')) {
        return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.ArrowFunctionExpression,
          params: [id],
          body: this.expression()
        };
      }
      return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.Identifier, value: id };
    }
    if (this.matchKeyword('await')) {
      return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.AwaitExpression, argument: this.expression() };
    }
    if (this.match(TokenType.Punctuation, '[')) {
      const elements: ASTNode[] = [];
      if (!this.check(TokenType.Punctuation, ']')) {
        do {
          if (this.match(TokenType.Punctuation, '...')) {
            elements.push({ line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.SpreadElement, argument: this.expression() });
          } else {
            elements.push(this.expression());
          }
        } while (this.match(TokenType.Punctuation, ','));
      }
      this.consume(TokenType.Punctuation, ']', "Expected ']' after array.");
      return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.ArrayExpression, elements };
    }
    if (this.match(TokenType.Punctuation, '{')) {
      const properties: { key: string | null, value: ASTNode, isSpread?: boolean }[] = [];
      if (!this.check(TokenType.Punctuation, '}')) {
        do {
          if (this.match(TokenType.Punctuation, '...')) {
            properties.push({ key: null, value: this.expression(), isSpread: true });
          } else {
            const key = this.consume(TokenType.Identifier, "Expected property name.").value;
            let value: ASTNode = { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.Identifier, value: key };
            if (this.match(TokenType.Punctuation, ':') || this.match(TokenType.Operator, ':')) {
              value = this.expression();
            }
            properties.push({ key, value });
          }
        } while (this.match(TokenType.Punctuation, ','));
      }
      this.consume(TokenType.Punctuation, '}', "Expected '}' after object.");
      return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.ObjectExpression, properties };
    }
    if (this.matchKeyword('function')) {
      let name;
      if (this.check(TokenType.Identifier)) {
        name = this.consume(TokenType.Identifier, "Expected function name.").value;
      } else {
        name = `anonymous_${Math.floor(Math.random() * 100000)}`;
      }
      this.consume(TokenType.Punctuation, '(', "Expected '(' after function name.");
      const params: any[] = [];
      if (!this.check(TokenType.Punctuation, ')')) {
        do {
          let isRest = false;
          if (this.match(TokenType.Punctuation, '...')) {
            isRest = true;
          }
          const paramName = this.consume(TokenType.Identifier, "Expected parameter name.").value;
          params.push(isRest ? `...${paramName}` : paramName);
          if (isRest) break;
        } while (this.match(TokenType.Punctuation, ','));
      }
      this.consume(TokenType.Punctuation, ')', "Expected ')' after parameters.");
      this.consume(TokenType.Punctuation, '{', "Expected '{' before function body.");
      const body = this.block();
      return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.FunctionDeclaration, name, params, body };
    }
    if (this.match(TokenType.Punctuation, '(')) {
      // Check for arrow function
      const start = this.current;
      try {
        const params: any[] = [];
        if (!this.check(TokenType.Punctuation, ')')) {
          do {
            let isRest = false;
            if (this.match(TokenType.Punctuation, '...')) {
              isRest = true;
            }
            const paramName = this.consume(TokenType.Identifier, "Expected parameter.").value;
            params.push(isRest ? `...${paramName}` : paramName);
            if (isRest) break;
          } while (this.match(TokenType.Punctuation, ','));
        }
        this.consume(TokenType.Punctuation, ')', "Expected ')' after params.");
        if (this.match(TokenType.Operator, '=>')) {
          let body;
          if (this.match(TokenType.Punctuation, '{')) {
            body = this.block();
          } else {
            body = this.expression();
          }
          return { line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.ArrowFunctionExpression, params, body };
        }
      } catch (e) {
        // Not an arrow function, backtrack
      }
      this.current = start;
      const expr = this.expression();
      this.consume(TokenType.Punctuation, ')', "Expected ')' after expression.");
      return expr;
    }
    throw new Error(`[Line ${this.peek().line}:${this.peek().column}] Parse Error: Unexpected token '${this.peek().value}'`);
  }

  private match(type: TokenType, value?: string): boolean {
    if (this.check(type, value)) {
      this.advance();
      return true;
    }
    return false;
  }

  private matchKeyword(keyword: string): boolean {
    if (this.check(TokenType.Keyword, keyword)) {
      this.advance();
      return true;
    }
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
      const token = this.peek();
      throw new Error(`[Line ${token.line}:${token.column}] Parse Error: ${message} found '${token.value}'`);
  }
}