import { ASTNode, Quadruple, Program } from '../types';
import { ASTNodeType } from '../constants';

// A simple counter for temporary variables
let tempCounter = 0;
let labelCounter = 0;

function newTemp(): string {
  return `t${tempCounter++}`;
}

function newLabel(): string {
  return `L${labelCounter++}`;
}

export function generateIR(ast: Program): Quadruple[] {
  tempCounter = 0;
  labelCounter = 0;
  const ir: Quadruple[] = [];

  function gen(node: ASTNode): string | null {
    switch (node.type) {
      case ASTNodeType.Program:
      case ASTNodeType.BlockStatement:
        node.body.forEach((stmt: ASTNode) => gen(stmt));
        return null;

      case ASTNodeType.Literal:
        // Use JSON.stringify to keep quotes for strings and format numbers correctly
        return JSON.stringify(node.value);

      case ASTNodeType.Identifier:
        return node.value;

      case ASTNodeType.VariableDeclaration:
        if (node.init) {
          const val = gen(node.init);
          ir.push({ op: 'ASSIGN', arg1: val, arg2: null, result: node.name });
        }
        return null;

      case ASTNodeType.AssignmentExpression: {
        const right = gen(node.right);
        // Assuming left is identifier for now
        ir.push({ op: 'ASSIGN', arg1: right, arg2: null, result: node.left.value });
        return node.left.value;
      }

      case ASTNodeType.BinaryExpression: {
        const t1 = gen(node.left);
        const t2 = gen(node.right);
        const temp = newTemp();
        let opCode = '';
        switch(node.operator) {
            case '+': opCode = 'ADD'; break;
            case '-': opCode = 'SUB'; break;
            case '*': opCode = 'MUL'; break;
            case '/': opCode = 'DIV'; break;
            case '==': opCode = 'EQ'; break;
            case '>': opCode = 'GT'; break;
            case '<': opCode = 'LT'; break;
            default: opCode = 'UNKNOWN';
        }
        ir.push({ op: opCode, arg1: t1, arg2: t2, result: temp });
        return temp;
      }

      case ASTNodeType.ExpressionStatement:
        gen(node.expression);
        return null;

      case ASTNodeType.CallExpression: {
          // Special case for print
          if(node.callee.type === ASTNodeType.Identifier && node.callee.value === 'print') {
              const arg = gen(node.arguments[0]);
              ir.push({ op: 'PARAM', arg1: arg, arg2: null, result: null });
              ir.push({ op: 'CALL', arg1: 'print', arg2: '1', result: null });
              return null;
          }

          // Special case for console.log - treating it as alias for print
          if (node.callee.type === ASTNodeType.MemberExpression && 
              node.callee.object.type === ASTNodeType.Identifier && 
              node.callee.object.value === 'console' &&
              node.callee.property.type === ASTNodeType.Identifier &&
              node.callee.property.value === 'log') {
              
              const arg = gen(node.arguments[0]);
              ir.push({ op: 'PARAM', arg1: arg, arg2: null, result: null });
              ir.push({ op: 'CALL', arg1: 'print', arg2: '1', result: null });
              return null;
          }

          // Generic call
          const args = node.arguments.map((arg: ASTNode) => gen(arg));
          args.forEach((a: string) => {
             ir.push({ op: 'PARAM', arg1: a, arg2: null, result: null });
          });
          const funcName = node.callee.value;
          const temp = newTemp();
          ir.push({ op: 'CALL', arg1: funcName, arg2: args.length.toString(), result: temp });
          return temp;
      }

      case ASTNodeType.IfStatement: {
          const condition = gen(node.test);
          const labelElse = newLabel();
          const labelEnd = newLabel();
          
          ir.push({ op: 'IF_FALSE_GOTO', arg1: condition, arg2: null, result: labelElse });
          gen(node.consequent);
          ir.push({ op: 'GOTO', arg1: null, arg2: null, result: labelEnd });
          
          ir.push({ op: 'LABEL', arg1: null, arg2: null, result: labelElse });
          if(node.alternate) {
              gen(node.alternate);
          }
          ir.push({ op: 'LABEL', arg1: null, arg2: null, result: labelEnd });
          return null;
      }
      
      case ASTNodeType.FunctionDeclaration: {
          // Skip function generation in linear flow, jump over it
          const funcEndLabel = newLabel();
          ir.push({ op: 'GOTO', arg1: null, arg2: null, result: funcEndLabel });
          
          ir.push({ op: 'FUNC_START', arg1: null, arg2: null, result: node.name });
          node.params.forEach((p: string) => {
             ir.push({ op: 'ARG', arg1: null, arg2: null, result: p }); 
          });
          gen(node.body);
          // Implicit return if missing
          ir.push({ op: 'RETURN', arg1: '0', arg2: null, result: null });
          ir.push({ op: 'FUNC_END', arg1: null, arg2: null, result: node.name });
          
          ir.push({ op: 'LABEL', arg1: null, arg2: null, result: funcEndLabel });
          return null;
      }

      case ASTNodeType.ReturnStatement: {
          const val = node.argument ? gen(node.argument) : '0';
          ir.push({ op: 'RETURN', arg1: val, arg2: null, result: null });
          return null;
      }
    }
    return null;
  }

  gen(ast);
  return ir;
}