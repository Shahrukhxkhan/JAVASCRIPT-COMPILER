import { ASTNode, Program, SemanticError } from '../types';
import { ASTNodeType } from '../constants';

class SymbolTable {
  private scopes: Set<string>[] = [];

  constructor() {
    this.enterScope(); // Global scope
  }

  enterScope() {
    this.scopes.push(new Set());
  }

  exitScope() {
    this.scopes.pop();
  }

  define(name: string): boolean {
    const scope = this.scopes[this.scopes.length - 1];
    if (scope.has(name)) return false; // Duplicate definition in same scope
    scope.add(name);
    return true;
  }

  resolve(name: string): boolean {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) return true;
    }
    return false;
  }
}

export function analyze(ast: Program): SemanticError[] {
  const errors: SemanticError[] = [];
  const symbolTable = new SymbolTable();
  
  // Pre-define built-ins
  symbolTable.define('print');
  symbolTable.define('console');

  // Revised Traversal for specific nodes to prevent false positives on declaration names
  function walk(node: ASTNode) {
     if(!node) return;
     if(node.type === ASTNodeType.VariableDeclaration) {
         if(!symbolTable.define(node.name)) {
             errors.push({ message: `Variable '${node.name}' declared twice.` });
         }
         if(node.init) walk(node.init);
     } else if (node.type === ASTNodeType.FunctionDeclaration) {
         if(!symbolTable.define(node.name)) {
             errors.push({ message: `Function '${node.name}' declared twice.` });
         }
         symbolTable.enterScope();
         node.params.forEach((p: string) => symbolTable.define(p));
         walk(node.body);
         symbolTable.exitScope();
     } else if (node.type === ASTNodeType.BlockStatement) {
         symbolTable.enterScope();
         node.body.forEach(walk);
         symbolTable.exitScope();
     } else if (node.type === ASTNodeType.Identifier) {
         if(!symbolTable.resolve(node.value)) {
             errors.push({ message: `Undeclared identifier '${node.value}'.` });
         }
     } else if (node.type === ASTNodeType.MemberExpression) {
         walk(node.object);
         // Do not walk the property as it is a member name, not a variable lookup
     } else {
         // Generic recursive step
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

  walk(ast);
  return errors;
}