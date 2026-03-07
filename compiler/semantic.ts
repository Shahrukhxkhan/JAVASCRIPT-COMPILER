import { ASTNode, Program, SemanticError } from '../types';
import { ASTNodeType } from '../constants';

class SymbolTable {
  private scopes: Set<string>[] = [];

  constructor() {
    this.enterScope(); // Global scope
  }

  enterScope() { this.scopes.push(new Set()); }
  exitScope() { this.scopes.pop(); }

  define(name: string): boolean {
    const scope = this.scopes[this.scopes.length - 1];
    if (scope.has(name)) return false;
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

  function walk(node: ASTNode) {
    if (!node) return;

    switch (node.type) {
      case ASTNodeType.Program:
        node.body.forEach(walk);
        break;

      case ASTNodeType.VariableDeclaration:
        if (!symbolTable.define(node.name)) {
          errors.push({ message: `Variable '${node.name}' declared twice.`, line: node.line });
        }
        if (node.init) walk(node.init);
        break;

      case ASTNodeType.FunctionDeclaration:
        if (!symbolTable.define(node.name)) {
          errors.push({ message: `Function '${node.name}' declared twice.`, line: node.line });
        }
        symbolTable.enterScope();
        node.params.forEach((p: string) => symbolTable.define(p));
        walk(node.body);
        symbolTable.exitScope();
        break;

      case ASTNodeType.BlockStatement:
        symbolTable.enterScope();
        node.body.forEach(walk);
        symbolTable.exitScope();
        break;

      case ASTNodeType.WhileStatement:
        walk(node.test);
        walk(node.body);
        break;

      case ASTNodeType.ForStatement:
        symbolTable.enterScope();
        if (node.init) walk(node.init);
        if (node.test) walk(node.test);
        if (node.update) walk(node.update);
        walk(node.body);
        symbolTable.exitScope();
        break;

      case ASTNodeType.BreakStatement:
      case ASTNodeType.ContinueStatement:
        break; // Validated in parser

      case ASTNodeType.IfStatement:
        walk(node.test);
        walk(node.consequent);
        if (node.alternate) walk(node.alternate);
        break;

      case ASTNodeType.ReturnStatement:
        if (node.argument) walk(node.argument);
        break;

      case ASTNodeType.ExpressionStatement:
        walk(node.expression);
        break;

      case ASTNodeType.AssignmentExpression:
        // For index/member assign, walk only the object part
        if (node.left.type === ASTNodeType.IndexExpression || node.left.type === ASTNodeType.MemberExpression) {
          walk(node.left.object);
          if (node.left.index) walk(node.left.index);
        } else {
          walk(node.left);
        }
        walk(node.right);
        break;

      case ASTNodeType.BinaryExpression:
        walk(node.left);
        walk(node.right);
        break;

      case ASTNodeType.UpdateExpression:
        walk(node.argument);
        break;

      case ASTNodeType.CallExpression:
        walk(node.callee);
        node.arguments.forEach(walk);
        break;

      case ASTNodeType.MemberExpression:
        walk(node.object);
        // property name is not a variable lookup
        break;

      case ASTNodeType.IndexExpression:
        walk(node.object);
        walk(node.index);
        break;

      case ASTNodeType.ArrayExpression:
        node.elements.forEach(walk);
        break;

      case ASTNodeType.ObjectExpression:
        node.properties.forEach((p: { key: string; value: ASTNode }) => walk(p.value));
        break;

      case ASTNodeType.Identifier:
        if (!symbolTable.resolve(node.value)) {
          errors.push({ message: `Undeclared identifier '${node.value}'.`, line: node.line });
        }
        break;

      case ASTNodeType.Literal:
        break; // Nothing to check

      default:
        break;
    }
  }

  walk(ast);
  return errors;
}