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
        if (node.value === undefined) return 'undefined';
        if (typeof node.value === 'bigint') return `${node.value}n`;
        // Use JSON.stringify to keep quotes for strings and format numbers correctly
        return JSON.stringify(node.value);

      case ASTNodeType.Identifier:
        return node.value;

      case ASTNodeType.VariableDeclaration:
        if (node.target) {
          // Destructuring
          const val = gen(node.init);
          genDestructuring(node.target, val);
        } else if (node.name && node.init) {
          const val = gen(node.init);
          ir.push({ line: node.line, column: node.column, op: 'ASSIGN', arg1: val, arg2: null, result: node.name });
        }
        return null;

      case ASTNodeType.AssignmentExpression: {
        const right = gen(node.right);
        let finalVal = right;
        if (node.operator && node.operator !== '=') {
          const leftVal = gen(node.left);
          const temp = newTemp();
          const op = node.operator.slice(0, -1);
          let opCode = '';
          switch(op) {
            case '+': opCode = 'ADD'; break;
            case '-': opCode = 'SUB'; break;
            case '*': opCode = 'MUL'; break;
            case '/': opCode = 'DIV'; break;
          }
          ir.push({ line: node.line, column: node.column, op: opCode, arg1: leftVal, arg2: right, result: temp });
          finalVal = temp;
        }

        if (node.left.type === ASTNodeType.Identifier) {
          ir.push({ line: node.line, column: node.column, op: 'ASSIGN', arg1: finalVal, arg2: null, result: node.left.value });
        } else if (node.left.type === ASTNodeType.MemberExpression) {
          const obj = gen(node.left.object);
          const prop = node.left.property.value;
          ir.push({ line: node.line, column: node.column, op: 'SET_PROP', arg1: obj, arg2: prop, result: finalVal });
        }
        return finalVal;
      }

      case ASTNodeType.MemberExpression: {
        const obj = gen(node.object);
        const prop = node.computed ? gen(node.property) : node.property.value;
        const temp = newTemp();
        ir.push({ line: node.line, column: node.column, op: 'GET_PROP', arg1: obj, arg2: prop, result: temp });
        return temp;
      }

      case ASTNodeType.ArrayExpression: {
        const elements = node.elements.map((e: ASTNode) => gen(e));
        const temp = newTemp();
        ir.push({ line: node.line, column: node.column, op: 'ARRAY', arg1: elements.length.toString(), arg2: elements.join(','), result: temp });
        return temp;
      }

      case ASTNodeType.ObjectExpression: {
        const props = node.properties.map((p: any) => `${p.key}:${gen(p.value)}`);
        const temp = newTemp();
        ir.push({ line: node.line, column: node.column, op: 'OBJECT', arg1: props.length.toString(), arg2: props.join(','), result: temp });
        return temp;
      }

      case ASTNodeType.WhileStatement: {
        const startLabel = newLabel();
        const endLabel = newLabel();
        ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: startLabel });
        const condition = gen(node.test);
        ir.push({ line: node.line, column: node.column, op: 'IF_FALSE_GOTO', arg1: condition, arg2: null, result: endLabel });
        gen(node.body);
        ir.push({ line: node.line, column: node.column, op: 'GOTO', arg1: null, arg2: null, result: startLabel });
        ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: endLabel });
        return null;
      }

      case ASTNodeType.ForStatement: {
        if (node.init) gen(node.init);
        const startLabel = newLabel();
        const endLabel = newLabel();
        ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: startLabel });
        if (node.test) {
          const condition = gen(node.test);
          ir.push({ line: node.line, column: node.column, op: 'IF_FALSE_GOTO', arg1: condition, arg2: null, result: endLabel });
        }
        gen(node.body);
        if (node.update) gen(node.update);
        ir.push({ line: node.line, column: node.column, op: 'GOTO', arg1: null, arg2: null, result: startLabel });
        ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: endLabel });
        return null;
      }

      case ASTNodeType.TryStatement: {
        const catchLabel = newLabel();
        const endLabel = newLabel();
        ir.push({ line: node.line, column: node.column, op: 'TRY_START', arg1: null, arg2: null, result: catchLabel });
        gen(node.block);
        ir.push({ line: node.line, column: node.column, op: 'TRY_END', arg1: null, arg2: null, result: null });
        ir.push({ line: node.line, column: node.column, op: 'GOTO', arg1: null, arg2: null, result: endLabel });
        
        ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: catchLabel });
        if (node.handler) {
          ir.push({ line: node.line, column: node.column, op: 'ARG', arg1: null, arg2: null, result: node.handler.param });
          gen(node.handler.body);
        }
        ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: endLabel });
        if (node.finalizer) gen(node.finalizer);
        return null;
      }

      case ASTNodeType.AwaitExpression: {
        const arg = gen(node.argument);
        const temp = newTemp();
        ir.push({ line: node.line, column: node.column, op: 'AWAIT', arg1: arg, arg2: null, result: temp });
        return temp;
      }

      case ASTNodeType.ArrowFunctionExpression: {
        const funcName = newTemp(); // Anonymous function needs a name in IR
        const funcEndLabel = newLabel();
        ir.push({ line: node.line, column: node.column, op: 'GOTO', arg1: null, arg2: null, result: funcEndLabel });
        ir.push({ line: node.line, column: node.column, op: 'FUNC_START', arg1: null, arg2: null, result: funcName });
        node.params.forEach((p: string) => {
          ir.push({ line: node.line, column: node.column, op: 'ARG', arg1: null, arg2: null, result: p });
        });
        if (node.body.type === ASTNodeType.BlockStatement) {
          gen(node.body);
        } else {
          const val = gen(node.body);
          ir.push({ line: node.line, column: node.column, op: 'RETURN', arg1: val, arg2: null, result: null });
        }
        ir.push({ line: node.line, column: node.column, op: 'RETURN', arg1: '0', arg2: null, result: null });
        ir.push({ line: node.line, column: node.column, op: 'FUNC_END', arg1: null, arg2: null, result: funcName });
        ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: funcEndLabel });
        return funcName;
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
        ir.push({ line: node.line, column: node.column, op: opCode, arg1: t1, arg2: t2, result: temp });
        return temp;
      }

      case ASTNodeType.TemplateLiteral: {
        let resultTemp = newTemp();
        // Start with the first quasi
        ir.push({ line: node.line, column: node.column, op: 'CONST', arg1: `"${node.quasis[0].value.cooked}"`, arg2: null, result: resultTemp });
        
        for (let i = 0; i < node.expressions.length; i++) {
            const exprTemp = gen(node.expressions[i]);
            const nextResultTemp = newTemp();
            ir.push({ line: node.line, column: node.column, op: 'ADD', arg1: resultTemp, arg2: exprTemp, result: nextResultTemp });
            resultTemp = nextResultTemp;
            
            const quasiCooked = node.quasis[i + 1].value.cooked;
            if (quasiCooked !== '') {
                const quasiTemp = newTemp();
                ir.push({ line: node.line, column: node.column, op: 'CONST', arg1: `"${quasiCooked}"`, arg2: null, result: quasiTemp });
                const finalResultTemp = newTemp();
                ir.push({ line: node.line, column: node.column, op: 'ADD', arg1: resultTemp, arg2: quasiTemp, result: finalResultTemp });
                resultTemp = finalResultTemp;
            }
        }
        return resultTemp;
      }

      case ASTNodeType.TaggedTemplateExpression: {
        // Tagged templates: tag(quasis, ...expressions)
        // For simplicity, we'll pass an array of strings as the first argument
        const tagTemp = gen(node.tag);
        
        // Create an array for quasis
        const quasisArrayTemp = newTemp();
        ir.push({ line: node.line, column: node.column, op: 'ARRAY', arg1: null, arg2: null, result: quasisArrayTemp });
        
        node.quasi.quasis.forEach((quasi: any, index: number) => {
            const strTemp = newTemp();
            ir.push({ line: node.line, column: node.column, op: 'CONST', arg1: `"${quasi.value.cooked}"`, arg2: null, result: strTemp });
            ir.push({ line: node.line, column: node.column, op: 'STORE_PROP', arg1: quasisArrayTemp, arg2: index.toString(), result: strTemp });
        });
        
        // Push quasis array as first param
        ir.push({ line: node.line, column: node.column, op: 'PARAM', arg1: quasisArrayTemp, arg2: null, result: null });
        
        // Push expressions as subsequent params
        const exprTemps = node.quasi.expressions.map((expr: ASTNode) => gen(expr));
        exprTemps.forEach((temp: string) => {
            ir.push({ line: node.line, column: node.column, op: 'PARAM', arg1: temp, arg2: null, result: null });
        });
        
        const resultTemp = newTemp();
        ir.push({ line: node.line, column: node.column, op: 'CALL', arg1: tagTemp, arg2: (1 + exprTemps.length).toString(), result: resultTemp });
        return resultTemp;
      }

      case ASTNodeType.ExpressionStatement:
        gen(node.expression);
        return null;

      case ASTNodeType.CallExpression: {
          // Special case for print
          if(node.callee.type === ASTNodeType.Identifier && node.callee.value === 'print') {
              const args = node.arguments.map((arg: ASTNode) => gen(arg));
              args.forEach((a: string) => {
                 ir.push({ line: node.line, column: node.column, op: 'PARAM', arg1: a, arg2: null, result: null });
              });
              ir.push({ line: node.line, column: node.column, op: 'CALL', arg1: 'print', arg2: args.length.toString(), result: null });
              return null;
          }

          // Special case for console.log
          if (node.callee.type === ASTNodeType.MemberExpression && 
              node.callee.object.type === ASTNodeType.Identifier && 
              node.callee.object.value === 'console' &&
              node.callee.property.type === ASTNodeType.Identifier &&
              node.callee.property.value === 'log') {
              
              const args = node.arguments.map((arg: ASTNode) => gen(arg));
              args.forEach((a: string) => {
                 ir.push({ line: node.line, column: node.column, op: 'PARAM', arg1: a, arg2: null, result: null });
              });
              ir.push({ line: node.line, column: node.column, op: 'CALL', arg1: 'print', arg2: args.length.toString(), result: null });
              return null;
          }

          // Generic call
          const args = node.arguments.map((arg: ASTNode) => gen(arg));
          args.forEach((a: string) => {
             ir.push({ line: node.line, column: node.column, op: 'PARAM', arg1: a, arg2: null, result: null });
          });
          
          let funcName;
          if (node.callee.type === ASTNodeType.Identifier) {
            funcName = node.callee.value;
          } else {
            funcName = gen(node.callee);
          }
          
          const temp = newTemp();
          ir.push({ line: node.line, column: node.column, op: 'CALL', arg1: funcName, arg2: args.length.toString(), result: temp });
          return temp;
      }

      case ASTNodeType.IfStatement: {
          const condition = gen(node.test);
          const labelElse = newLabel();
          const labelEnd = newLabel();
          
          ir.push({ line: node.line, column: node.column, op: 'IF_FALSE_GOTO', arg1: condition, arg2: null, result: labelElse });
          gen(node.consequent);
          ir.push({ line: node.line, column: node.column, op: 'GOTO', arg1: null, arg2: null, result: labelEnd });
          
          ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: labelElse });
          if(node.alternate) {
              gen(node.alternate);
          }
          ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: labelEnd });
          return null;
      }
      
      case ASTNodeType.FunctionDeclaration: {
          // Skip function generation in linear flow, jump over it
          const funcEndLabel = newLabel();
          ir.push({ line: node.line, column: node.column, op: 'GOTO', arg1: null, arg2: null, result: funcEndLabel });
          
          ir.push({ line: node.line, column: node.column, op: 'FUNC_START', arg1: null, arg2: null, result: node.name });
          node.params.forEach((p: string) => {
             ir.push({ line: node.line, column: node.column, op: 'ARG', arg1: null, arg2: null, result: p }); 
          });
          gen(node.body);
          // Implicit return if missing
          ir.push({ line: node.line, column: node.column, op: 'RETURN', arg1: '0', arg2: null, result: null });
          ir.push({ line: node.line, column: node.column, op: 'FUNC_END', arg1: null, arg2: null, result: node.name });
          
          ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: funcEndLabel });
          return node.name;
      }

      case ASTNodeType.ReturnStatement: {
          const val = node.argument ? gen(node.argument) : '0';
          ir.push({ line: node.line, column: node.column, op: 'RETURN', arg1: val, arg2: null, result: null });
          return null;
      }
      
      case ASTNodeType.ThrowStatement: {
          const val = gen(node.argument);
          ir.push({ line: node.line, column: node.column, op: 'THROW', arg1: val, arg2: null, result: null });
          return null;
      }

      case ASTNodeType.ClassDeclaration: {
        const classTemp = newTemp();
        ir.push({ line: node.line, column: node.column, op: 'OBJECT', arg1: '0', arg2: '', result: classTemp });
        
        if (node.superClass) {
          ir.push({ line: node.line, column: node.column, op: 'EXTENDS', arg1: node.superClass, arg2: classTemp, result: null });
        }

        ir.push({ line: node.line, column: node.column, op: 'ASSIGN', arg1: classTemp, arg2: null, result: node.name });
        
        node.body.forEach((member: ASTNode) => {
          if (member.type === ASTNodeType.FunctionDeclaration) {
            const funcName = gen(member);
            ir.push({ line: node.line, column: node.column, op: 'SET_PROP', arg1: classTemp, arg2: member.name, result: funcName });
          }
        });
        return classTemp;
      }
    }
    return null;
  }

  function genDestructuring(target: ASTNode, val: string | null) {
    if (target.type === ASTNodeType.ArrayPattern) {
      target.elements.forEach((el: any, i: number) => {
        if (el) {
          const temp = newTemp();
          ir.push({ line: target.line, column: target.column, op: 'GET_PROP', arg1: val, arg2: i.toString(), result: temp });
          if (typeof el === 'string') {
            ir.push({ line: target.line, column: target.column, op: 'ASSIGN', arg1: temp, arg2: null, result: el });
          } else {
            genDestructuring(el, temp);
          }
        }
      });
    } else if (target.type === ASTNodeType.ObjectPattern) {
      target.properties.forEach((prop: any) => {
        const temp = newTemp();
        ir.push({ line: target.line, column: target.column, op: 'GET_PROP', arg1: val, arg2: prop.key, result: temp });
        if (typeof prop.value === 'string') {
          ir.push({ line: target.line, column: target.column, op: 'ASSIGN', arg1: temp, arg2: null, result: prop.value });
        } else {
          genDestructuring(prop.value, temp);
        }
      });
    }
  }

  gen(ast);
  return ir;
}