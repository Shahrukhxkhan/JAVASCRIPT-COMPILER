import { ASTNode, Program, SemanticError } from '../types';
import { ASTNodeType } from '../constants';

class SymbolTable {
  private scopes: Map<string, { kind: string }>[] = [];

  constructor() {
    this.enterScope(); // Global scope
  }

  enterScope() {
    this.scopes.push(new Map());
  }

  exitScope() {
    this.scopes.pop();
  }

  define(name: string, kind: string = 'let'): boolean {
    const scope = this.scopes[this.scopes.length - 1];
    if (scope.has(name)) return false; // Duplicate definition in same scope
    scope.set(name, { kind });
    return true;
  }

  resolve(name: string): { kind: string } | null {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) return this.scopes[i].get(name)!;
    }
    return null;
  }
}

export function analyze(ast: Program): SemanticError[] {
  const errors: SemanticError[] = [];
  const symbolTable = new SymbolTable();
  
  // Pre-define built-ins
  symbolTable.define('print', 'const');
  symbolTable.define('console', 'const');
  symbolTable.define('Symbol', 'const');
  symbolTable.define('Array', 'const');
  symbolTable.define('Object', 'const');
  symbolTable.define('String', 'const');
  symbolTable.define('Number', 'const');
  symbolTable.define('Boolean', 'const');

  let loopDepth = 0;

  // Revised Traversal for specific nodes to prevent false positives on declaration names
  function walk(node: ASTNode) {
     if(!node) return;
     if(node.type === ASTNodeType.VariableDeclaration) {
         const kind = node.kind || 'let';
         if (node.target) {
           defineBindingPattern(node.target, kind);
         } else if (node.name) {
           if(!symbolTable.define(node.name, kind)) {
               errors.push({ message: `Variable '${node.name}' declared twice.`, line: node.line, column: node.column });
           }
         }
         if(node.init) walk(node.init);
     } else if (node.type === ASTNodeType.AssignmentExpression) {
         if (node.left.type === ASTNodeType.Identifier) {
             const symbol = symbolTable.resolve(node.left.value);
             if (symbol && symbol.kind === 'const') {
                 errors.push({ message: `Assignment to constant variable '${node.left.value}'.`, line: node.left.line, column: node.left.column });
             }
         }
         walk(node.left);
         walk(node.right);
     } else if (node.type === ASTNodeType.FunctionDeclaration || node.type === ASTNodeType.ArrowFunctionExpression) {
         if (node.type === ASTNodeType.FunctionDeclaration && node.name) {
           if(!symbolTable.define(node.name, 'const')) {
               errors.push({ message: `Function '${node.name}' declared twice.`, line: node.line, column: node.column });
           }
         }
         symbolTable.enterScope();
         node.params.forEach((p: string) => symbolTable.define(p, 'let'));
         const prevLoopDepth = loopDepth;
         loopDepth = 0; // Functions have their own loop context
         walk(node.body);
         loopDepth = prevLoopDepth;
         symbolTable.exitScope();
     } else if (node.type === ASTNodeType.ClassDeclaration) {
         if(!symbolTable.define(node.name, 'const')) {
             errors.push({ message: `Class '${node.name}' declared twice.`, line: node.line, column: node.column });
         }
         symbolTable.enterScope();
         node.body.forEach(walk);
         symbolTable.exitScope();
     } else if (node.type === ASTNodeType.BlockStatement) {
         symbolTable.enterScope();
         node.body.forEach(walk);
         symbolTable.exitScope();
     } else if (node.type === ASTNodeType.CatchClause) {
         symbolTable.enterScope();
         if (node.param) symbolTable.define(node.param, 'let');
         walk(node.body);
         symbolTable.exitScope();
     } else if (node.type === ASTNodeType.WhileStatement || node.type === ASTNodeType.DoWhileStatement || node.type === ASTNodeType.ForStatement) {
         loopDepth++;
         if (node.type === ASTNodeType.ForStatement) {
             symbolTable.enterScope();
             if (node.init) walk(node.init);
             if (node.test) walk(node.test);
             if (node.update) walk(node.update);
             walk(node.body);
             symbolTable.exitScope();
         } else {
             if (node.test) walk(node.test);
             walk(node.body);
         }
         loopDepth--;
     } else if (node.type === ASTNodeType.SwitchStatement) {
         loopDepth++; // switch statements can contain break
         walk(node.discriminant);
         node.cases.forEach(walk);
         loopDepth--;
     } else if (node.type === ASTNodeType.BreakStatement || node.type === ASTNodeType.ContinueStatement) {
         if (loopDepth === 0) {
             errors.push({ message: `Illegal '${node.type === ASTNodeType.BreakStatement ? 'break' : 'continue'}' statement outside of a loop or switch.`, line: node.line, column: node.column });
         }
     } else if (node.type === ASTNodeType.Identifier) {
         // 'this' is a special keyword that doesn't need to be declared
         if (node.value !== 'this' && !symbolTable.resolve(node.value)) {
             errors.push({ message: `Undeclared identifier '${node.value}'.`, line: node.line, column: node.column });
         }
     } else if (node.type === ASTNodeType.MemberExpression) {
         walk(node.object);
         if (node.computed) walk(node.property);
     } else {
         const keys = Object.keys(node);
         for(const key of keys) {
             const child = node[key];
             if(Array.isArray(child)) {
                 child.forEach(c => { if(c && typeof c.type === 'string') walk(c) });
             } else if (child && typeof child.type === 'string') {
                 walk(child);
             }
         }
     }
  }

  function defineBindingPattern(pattern: ASTNode, kind: string) {
    if (pattern.type === ASTNodeType.ArrayPattern) {
      pattern.elements.forEach((el: any) => {
        if (typeof el === 'string') {
          symbolTable.define(el, kind);
        } else if (el) {
          defineBindingPattern(el, kind);
        }
      });
    } else if (pattern.type === ASTNodeType.ObjectPattern) {
      pattern.properties.forEach((prop: any) => {
        if (typeof prop.value === 'string') {
          symbolTable.define(prop.value, kind);
        } else {
          defineBindingPattern(prop.value, kind);
        }
      });
    }
  }

  walk(ast);
  return errors;
}