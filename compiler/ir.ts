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
  const loopStack: { start: string, end: string }[] = [];
  const finallyStack: { node: ASTNode, depth: number }[] = [];

  function gen(node: ASTNode): string | null {
    if (!node) return null;
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
        } else if (node.name) {
          if (node.init) {
            const val = gen(node.init);
            ir.push({ line: node.line, column: node.column, op: 'DECLARE', arg1: val, arg2: node.kind, result: node.name });
          } else {
            ir.push({ line: node.line, column: node.column, op: 'DECLARE', arg1: 'undefined', arg2: node.kind, result: node.name });
          }
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
          const prop = node.left.computed ? gen(node.left.property) : `"${node.left.property.value}"`;
          ir.push({ line: node.line, column: node.column, op: 'SET_PROP', arg1: obj, arg2: prop, result: finalVal });
        }
        return finalVal;
      }

      case ASTNodeType.MemberExpression: {
        const obj = gen(node.object);
        const prop = node.computed ? gen(node.property) : `"${node.property.value}"`;
        const temp = newTemp();
        ir.push({ line: node.line, column: node.column, op: 'GET_PROP', arg1: obj, arg2: prop, result: temp });
        return temp;
      }

      case ASTNodeType.OptionalMemberExpression: {
        const obj = gen(node.object);
        const prop = node.computed ? gen(node.property) : `"${node.property.value}"`;
        const temp = newTemp();
        ir.push({ line: node.line, column: node.column, op: 'GET_PROP_OPTIONAL', arg1: obj, arg2: prop, result: temp });
        return temp;
      }

      case ASTNodeType.ArrayExpression: {
        const types: string[] = [];
        const elements = node.elements.map((e: ASTNode) => {
          if (e.type === ASTNodeType.SpreadElement) {
             types.push('spread');
             return gen(e.argument);
          }
          types.push('normal');
          return gen(e);
        });
        const temp = newTemp();
        ir.push({ line: node.line, column: node.column, op: 'ARRAY', arg1: types.join(','), arg2: elements.join(','), result: temp });
        return temp;
      }

      case ASTNodeType.ObjectExpression: {
        const types: string[] = [];
        const props = node.properties.map((p: any) => {
           if (p.isSpread) {
              types.push('spread');
              return `null:${gen(p.value)}`;
           }
           types.push('normal');
           return `${p.key}:${gen(p.value)}`;
        });
        const temp = newTemp();
        ir.push({ line: node.line, column: node.column, op: 'OBJECT', arg1: types.join(','), arg2: props.join(','), result: temp });
        return temp;
      }

      case ASTNodeType.WhileStatement: {
        const startLabel = newLabel();
        const endLabel = newLabel();
        loopStack.push({ start: startLabel, end: endLabel });
        ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: startLabel });
        const condition = gen(node.test);
        ir.push({ line: node.line, column: node.column, op: 'IF_FALSE_GOTO', arg1: condition, arg2: null, result: endLabel });
        gen(node.body);
        ir.push({ line: node.line, column: node.column, op: 'GOTO', arg1: null, arg2: null, result: startLabel });
        ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: endLabel });
        loopStack.pop();
        return null;
      }

      case ASTNodeType.DoWhileStatement: {
        const startLabel = newLabel();
        const continueLabel = newLabel();
        const endLabel = newLabel();
        loopStack.push({ start: continueLabel, end: endLabel });
        ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: startLabel });
        gen(node.body);
        ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: continueLabel });
        const condition = gen(node.test);
        ir.push({ line: node.line, column: node.column, op: 'IF_FALSE_GOTO', arg1: condition, arg2: null, result: endLabel });
        ir.push({ line: node.line, column: node.column, op: 'GOTO', arg1: null, arg2: null, result: startLabel });
        ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: endLabel });
        loopStack.pop();
        return null;
      }

      case ASTNodeType.ForStatement: {
        if (node.init) gen(node.init);
        const startLabel = newLabel();
        const continueLabel = newLabel();
        const endLabel = newLabel();
        loopStack.push({ start: continueLabel, end: endLabel });
        ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: startLabel });
        if (node.test) {
          const condition = gen(node.test);
          ir.push({ line: node.line, column: node.column, op: 'IF_FALSE_GOTO', arg1: condition, arg2: null, result: endLabel });
        }
        gen(node.body);
        ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: continueLabel });
        if (node.update) gen(node.update);
        ir.push({ line: node.line, column: node.column, op: 'GOTO', arg1: null, arg2: null, result: startLabel });
        ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: endLabel });
        loopStack.pop();
        return null;
      }

      case ASTNodeType.ForInStatement:
      case ASTNodeType.ForOfStatement: {
        const rightVal = gen(node.right);
        const iterTemp = newTemp();
        const iterOp = node.type === ASTNodeType.ForInStatement ? 'ITER_KEYS' : 'ITER_VALUES';
        ir.push({ line: node.line, column: node.column, op: iterOp, arg1: rightVal, arg2: null, result: iterTemp });
        
        const iTemp = newTemp();
        const lenTemp = newTemp();
        ir.push({ line: node.line, column: node.column, op: 'ASSIGN', arg1: '0', arg2: null, result: iTemp });
        ir.push({ line: node.line, column: node.column, op: 'GET_PROP', arg1: iterTemp, arg2: '"length"', result: lenTemp });
        
        const startLabel = newLabel();
        const continueLabel = newLabel();
        const endLabel = newLabel();
        loopStack.push({ start: continueLabel, end: endLabel });
        
        ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: startLabel });
        const cmpTemp = newTemp();
        ir.push({ line: node.line, column: node.column, op: 'LT', arg1: iTemp, arg2: lenTemp, result: cmpTemp });
        ir.push({ line: node.line, column: node.column, op: 'IF_FALSE_GOTO', arg1: cmpTemp, arg2: null, result: endLabel });
        
        const valTemp = newTemp();
        ir.push({ line: node.line, column: node.column, op: 'GET_PROP', arg1: iterTemp, arg2: iTemp, result: valTemp });
        
        if (node.left.type === ASTNodeType.VariableDeclaration) {
            if (node.left.target) {
                genDestructuring(node.left.target, valTemp, node.left.kind);
            } else {
                ir.push({ line: node.left.line, column: node.left.column, op: 'DECLARE', arg1: valTemp, arg2: node.left.kind, result: node.left.name });
            }
        } else if (node.left.type === ASTNodeType.Identifier) {
            ir.push({ line: node.left.line, column: node.left.column, op: 'ASSIGN', arg1: valTemp, arg2: null, result: node.left.value });
        }
        
        gen(node.body);
        
        ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: continueLabel });
        const iNext = newTemp();
        ir.push({ line: node.line, column: node.column, op: 'ADD', arg1: iTemp, arg2: '1', result: iNext });
        ir.push({ line: node.line, column: node.column, op: 'ASSIGN', arg1: iNext, arg2: null, result: iTemp });
        ir.push({ line: node.line, column: node.column, op: 'GOTO', arg1: null, arg2: null, result: startLabel });
        
        ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: endLabel });
        loopStack.pop();
        return null;
      }

      case ASTNodeType.BreakStatement: {
        if (loopStack.length > 0) {
          const endLabel = loopStack[loopStack.length - 1].end;
          const currentLoopDepth = loopStack.length;
          // Execute finally blocks that are inside this loop
          for (let i = finallyStack.length - 1; i >= 0; i--) {
              if (finallyStack[i].depth >= currentLoopDepth) {
                  gen(finallyStack[i].node);
              }
          }
          ir.push({ line: node.line, column: node.column, op: 'GOTO', arg1: null, arg2: null, result: endLabel });
        }
        return null;
      }

      case ASTNodeType.ContinueStatement: {
        if (loopStack.length > 0) {
          const startLabel = loopStack[loopStack.length - 1].start;
          const currentLoopDepth = loopStack.length;
          // Execute finally blocks that are inside this loop
          for (let i = finallyStack.length - 1; i >= 0; i--) {
              if (finallyStack[i].depth >= currentLoopDepth) {
                  gen(finallyStack[i].node);
              }
          }
          ir.push({ line: node.line, column: node.column, op: 'GOTO', arg1: null, arg2: null, result: startLabel });
        }
        return null;
      }

      case ASTNodeType.SwitchStatement: {
        const discriminant = gen(node.discriminant);
        const endLabel = newLabel();
        loopStack.push({ start: endLabel, end: endLabel }); // break goes to endLabel
        
        const caseLabels = node.cases.map(() => newLabel());
        let defaultLabel = endLabel;
        let defaultIndex = -1;

        // Generate condition checks
        node.cases.forEach((c: ASTNode, i: number) => {
          if (c.test) {
            const testVal = gen(c.test);
            const cmpTemp = newTemp();
            ir.push({ line: c.line, column: c.column, op: 'EQ', arg1: discriminant, arg2: testVal, result: cmpTemp });
            ir.push({ line: c.line, column: c.column, op: 'IF_TRUE_GOTO', arg1: cmpTemp, arg2: null, result: caseLabels[i] });
          } else {
            defaultLabel = caseLabels[i];
            defaultIndex = i;
          }
        });

        ir.push({ line: node.line, column: node.column, op: 'GOTO', arg1: null, arg2: null, result: defaultLabel });

        // Generate case bodies
        node.cases.forEach((c: ASTNode, i: number) => {
          ir.push({ line: c.line, column: c.column, op: 'LABEL', arg1: null, arg2: null, result: caseLabels[i] });
          c.consequent.forEach((stmt: ASTNode) => gen(stmt));
        });

        ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: endLabel });
        loopStack.pop();
        return null;
      }

      case ASTNodeType.ConditionalExpression: {
        const condition = gen(node.test);
        const elseLabel = newLabel();
        const endLabel = newLabel();
        const resultTemp = newTemp();
        
        ir.push({ line: node.line, column: node.column, op: 'IF_FALSE_GOTO', arg1: condition, arg2: null, result: elseLabel });
        const consVal = gen(node.consequent);
        ir.push({ line: node.line, column: node.column, op: 'ASSIGN', arg1: consVal, arg2: null, result: resultTemp });
        ir.push({ line: node.line, column: node.column, op: 'GOTO', arg1: null, arg2: null, result: endLabel });
        
        ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: elseLabel });
        const altVal = gen(node.alternate);
        ir.push({ line: node.line, column: node.column, op: 'ASSIGN', arg1: altVal, arg2: null, result: resultTemp });
        
        ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: endLabel });
        return resultTemp;
      }

      case ASTNodeType.TryStatement: {
        const catchLabel = newLabel();
        const finallyLabel = newLabel();
        const endLabel = newLabel();

        const hasCatch = !!node.handler;
        const hasFinally = !!node.finalizer;

        ir.push({ line: node.line, column: node.column, op: 'TRY_START', arg1: hasCatch ? `"${catchLabel}"` : null, arg2: hasFinally ? `"${finallyLabel}"` : null, result: null });
        
        if (hasFinally) finallyStack.push({ node: node.finalizer, depth: loopStack.length });
        
        gen(node.block);
        
        ir.push({ line: node.line, column: node.column, op: 'TRY_END', arg1: null, arg2: null, result: null });
        if (hasFinally) finallyStack.pop();
        ir.push({ line: node.line, column: node.column, op: 'GOTO', arg1: null, arg2: null, result: hasFinally ? finallyLabel : endLabel });
        
        if (hasCatch) {
          ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: catchLabel });
          
          if (hasFinally) {
            ir.push({ line: node.line, column: node.column, op: 'TRY_START', arg1: null, arg2: `"${finallyLabel}"`, result: null });
            finallyStack.push({ node: node.finalizer, depth: loopStack.length });
          }
          
          ir.push({ line: node.line, column: node.column, op: 'ARG', arg1: null, arg2: null, result: node.handler.param });
          gen(node.handler.body);
          
          if (hasFinally) {
            ir.push({ line: node.line, column: node.column, op: 'TRY_END', arg1: null, arg2: null, result: null });
            finallyStack.pop();
          }
          
          ir.push({ line: node.line, column: node.column, op: 'GOTO', arg1: null, arg2: null, result: hasFinally ? finallyLabel : endLabel });
        }
        
        if (hasFinally) {
          ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: finallyLabel });
          gen(node.finalizer);
          ir.push({ line: node.line, column: node.column, op: 'FINALLY_END', arg1: null, arg2: null, result: null });
        }
        
        ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: endLabel });
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
        const paramsReversed = [...node.params].reverse();
        paramsReversed.forEach((p: string, paramIndex: number) => {
          const originalIndex = node.params.length - 1 - paramIndex;
          if (p.startsWith('...')) {
              ir.push({ line: node.line, column: node.column, op: 'REST_ARG', arg1: originalIndex.toString(), arg2: node.params.length.toString(), result: p.slice(3) }); 
          } else {
              ir.push({ line: node.line, column: node.column, op: 'ARG', arg1: null, arg2: null, result: p }); 
          }
        });
        
        const oldLoopStack = [...loopStack];
        const oldFinallyStack = [...finallyStack];
        loopStack.length = 0;
        finallyStack.length = 0;
        
        if (node.body.type === ASTNodeType.BlockStatement) {
          gen(node.body);
        } else {
          const val = gen(node.body);
          ir.push({ line: node.line, column: node.column, op: 'RETURN', arg1: val, arg2: null, result: null });
        }
        
        loopStack.push(...oldLoopStack);
        finallyStack.push(...oldFinallyStack);
        
        ir.push({ line: node.line, column: node.column, op: 'RETURN', arg1: '0', arg2: null, result: null });
        ir.push({ line: node.line, column: node.column, op: 'FUNC_END', arg1: null, arg2: null, result: funcName });
        ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: funcEndLabel });
        
        const closureTemp = newTemp();
        const flags = `true,${!!node.async},${!!node.generator}`;
        ir.push({ line: node.line, column: node.column, op: 'CLOSURE', arg1: `"${funcName}"`, arg2: flags, result: closureTemp });
        return closureTemp;
      }

      case ASTNodeType.UnaryExpression: {
        const arg = gen(node.argument);
        const temp = newTemp();
        let opCode = '';
        switch(node.operator) {
            case '!': opCode = 'NOT'; break;
            case '-': opCode = 'NEG'; break;
            case 'typeof': opCode = 'TYPEOF'; break;
            default: opCode = 'UNKNOWN';
        }
        ir.push({ line: node.line, column: node.column, op: opCode, arg1: arg, arg2: null, result: temp });
        return temp;
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
            case '!=': opCode = 'NEQ'; break;
            case '===': opCode = 'EQ_STRICT'; break;
            case '!==': opCode = 'NEQ_STRICT'; break;
            case '>': opCode = 'GT'; break;
            case '<': opCode = 'LT'; break;
            case '>=': opCode = 'GTE'; break;
            case '<=': opCode = 'LTE'; break;
            case '&&': opCode = 'AND'; break;
            case '||': opCode = 'OR'; break;
            case '??': opCode = 'NULLISH'; break;
            case 'in': opCode = 'IN'; break;
            case 'instanceof': opCode = 'INSTANCEOF'; break;
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
          const callTypes: string[] = [];
          const args = node.arguments.map((arg: ASTNode) => {
             if (arg.type === ASTNodeType.SpreadElement) {
                 callTypes.push('spread');
                 return gen(arg.argument);
             }
             callTypes.push('normal');
             return gen(arg);
          });
          args.forEach((a: string) => {
             ir.push({ line: node.line, column: node.column, op: 'PARAM', arg1: a, arg2: null, result: null });
          });
          
          let funcName;
          let ctxTemp = 'null';
          if (node.callee.type === ASTNodeType.MemberExpression || node.callee.type === ASTNodeType.OptionalMemberExpression) {
             ctxTemp = gen(node.callee.object);
             funcName = newTemp();
             const prop = node.callee.computed ? gen(node.callee.property) : `"${node.callee.property.value}"`;
             ir.push({ line: node.line, column: node.column, op: node.callee.type === ASTNodeType.MemberExpression ? 'GET_PROP' : 'GET_PROP_OPTIONAL', arg1: ctxTemp, arg2: prop, result: funcName });
          } else if (node.callee.type === ASTNodeType.Identifier) {
            funcName = node.callee.value;
          } else {
            funcName = gen(node.callee);
          }
          
          const temp = newTemp();
          ir.push({ line: node.line, column: node.column, op: 'CALL', arg1: funcName, arg2: `${callTypes.join(',')}|::|${ctxTemp}`, result: temp });
          return temp;
      }

      case ASTNodeType.NewExpression: {
          const callTypes: string[] = [];
          const args = node.arguments.map((arg: ASTNode) => {
             if (arg.type === ASTNodeType.SpreadElement) {
                 callTypes.push('spread');
                 return gen(arg.argument);
             }
             callTypes.push('normal');
             return gen(arg);
          });
          args.forEach((a: string) => {
             ir.push({ line: node.line, column: node.column, op: 'PARAM', arg1: a, arg2: null, result: null });
          });
          
          const funcName = gen(node.callee);
          const temp = newTemp();
          ir.push({ line: node.line, column: node.column, op: 'NEW', arg1: funcName, arg2: callTypes.join(','), result: temp });
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
      
      case ASTNodeType.YieldExpression: {
        const temp = newTemp();
        if (node.argument) {
            const arg = gen(node.argument);
            ir.push({ line: node.line, column: node.column, op: node.delegate ? 'YIELD_STAR' : 'YIELD', arg1: arg, arg2: null, result: temp });
        } else {
            ir.push({ line: node.line, column: node.column, op: node.delegate ? 'YIELD_STAR' : 'YIELD', arg1: 'undefined', arg2: null, result: temp });
        }
        return temp;
      }

      case ASTNodeType.FunctionDeclaration: {
          // Skip function generation in linear flow, jump over it
          const funcEndLabel = newLabel();
          ir.push({ line: node.line, column: node.column, op: 'GOTO', arg1: null, arg2: null, result: funcEndLabel });
          
          ir.push({ line: node.line, column: node.column, op: 'FUNC_START', arg1: null, arg2: null, result: node.name });
          
          // ARG instructions pop from the stack. To get arguments in correct order (since param n is at top of stack),
          // we need to process them in reverse order.
          const paramsReversed = [...node.params].reverse();
          paramsReversed.forEach((p: string, paramIndex: number) => {
             const originalIndex = node.params.length - 1 - paramIndex;
             if (p.startsWith('...')) {
                 ir.push({ line: node.line, column: node.column, op: 'REST_ARG', arg1: originalIndex.toString(), arg2: node.params.length.toString(), result: p.slice(3) }); 
             } else {
                 ir.push({ line: node.line, column: node.column, op: 'ARG', arg1: null, arg2: null, result: p }); 
             }
          });
          
          const oldLoopStack = [...loopStack];
          const oldFinallyStack = [...finallyStack];
          loopStack.length = 0;
          finallyStack.length = 0;
          
          gen(node.body);
          
          loopStack.push(...oldLoopStack);
          finallyStack.push(...oldFinallyStack);
          
          // Implicit return if missing
          ir.push({ line: node.line, column: node.column, op: 'RETURN', arg1: '0', arg2: null, result: null });
          ir.push({ line: node.line, column: node.column, op: 'FUNC_END', arg1: null, arg2: null, result: node.name });
          
          ir.push({ line: node.line, column: node.column, op: 'LABEL', arg1: null, arg2: null, result: funcEndLabel });
          
          // Assign the function closure to a variable
          const flags = `false,${!!node.async},${!!node.generator}`;
          ir.push({ line: node.line, column: node.column, op: 'DECLARE', arg1: 'undefined', arg2: 'var', result: node.name });
          ir.push({ line: node.line, column: node.column, op: 'CLOSURE', arg1: `"${node.name}"`, arg2: flags, result: node.name });
          return node.name;
      }

      case ASTNodeType.ReturnStatement: {
          const val = node.argument ? gen(node.argument) : '0';
          
          for (let i = finallyStack.length - 1; i >= 0; i--) {
              gen(finallyStack[i].node);
          }
          
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
        ir.push({ line: node.line, column: node.column, op: 'OBJECT', arg1: '', arg2: '', result: classTemp });
        
        if (node.superClass) {
          ir.push({ line: node.line, column: node.column, op: 'EXTENDS', arg1: node.superClass, arg2: classTemp, result: null });
        }

        ir.push({ line: node.line, column: node.column, op: 'DECLARE', arg1: classTemp, arg2: 'const', result: node.name });
        
        node.body.forEach((member: ASTNode) => {
          if (member.type === ASTNodeType.FunctionDeclaration) {
            const funcName = gen(member);
            ir.push({ line: node.line, column: node.column, op: 'SET_PROP', arg1: classTemp, arg2: `"${member.name}"`, result: funcName });
          }
        });
        return classTemp;
      }
    }
    return null;
  }

  function genDestructuring(target: ASTNode, val: string | null, kind: string = 'let') {
    if (target.type === ASTNodeType.ArrayPattern) {
      target.elements.forEach((el: any, i: number) => {
        if (el) {
          const { pattern, isRest, default: defaultValue } = el;
          const temp = newTemp();
          
          if (isRest) {
              ir.push({ line: target.line, column: target.column, op: 'ARRAY_REST', arg1: val, arg2: i.toString(), result: temp });
          } else {
              ir.push({ line: target.line, column: target.column, op: 'GET_PROP', arg1: val, arg2: i.toString(), result: temp });

              if (defaultValue) {
                  const defaultValTemp = gen(defaultValue);
                  // Optional: handle default assignment if temp is undefined
                  const labelSkip = newLabel();
                  const cmpTemp = newTemp();
                  ir.push({ line: target.line, column: target.column, op: 'EQ_STRICT', arg1: temp, arg2: 'undefined', result: cmpTemp });
                  ir.push({ line: target.line, column: target.column, op: 'IF_FALSE_GOTO', arg1: cmpTemp, arg2: null, result: labelSkip });
                  ir.push({ line: target.line, column: target.column, op: 'ASSIGN', arg1: defaultValTemp, arg2: null, result: temp });
                  ir.push({ line: target.line, column: target.column, op: 'LABEL', arg1: null, arg2: null, result: labelSkip });
              }
          }

          if (typeof pattern === 'string') {
            ir.push({ line: target.line, column: target.column, op: 'DECLARE', arg1: temp, arg2: kind, result: pattern });
          } else {
            genDestructuring(pattern, temp, kind);
          }
        }
      });
    } else if (target.type === ASTNodeType.ObjectPattern) {
      const parsedKeys: string[] = [];
      target.properties.forEach((prop: any) => {
        const { key, value, isRest, default: defaultValue } = prop;
        const temp = newTemp();
        
        if (isRest) {
            ir.push({ line: target.line, column: target.column, op: 'OBJECT_REST', arg1: val, arg2: parsedKeys.join(','), result: temp });
        } else {
            parsedKeys.push(key);
            ir.push({ line: target.line, column: target.column, op: 'GET_PROP', arg1: val, arg2: `"${key}"`, result: temp });
            
            if (defaultValue) {
                const defaultValTemp = gen(defaultValue);
                const labelSkip = newLabel();
                const cmpTemp = newTemp();
                ir.push({ line: target.line, column: target.column, op: 'EQ_STRICT', arg1: temp, arg2: 'undefined', result: cmpTemp });
                ir.push({ line: target.line, column: target.column, op: 'IF_FALSE_GOTO', arg1: cmpTemp, arg2: null, result: labelSkip });
                ir.push({ line: target.line, column: target.column, op: 'ASSIGN', arg1: defaultValTemp, arg2: null, result: temp });
                ir.push({ line: target.line, column: target.column, op: 'LABEL', arg1: null, arg2: null, result: labelSkip });
            }
        }

        if (typeof value === 'string') {
          ir.push({ line: target.line, column: target.column, op: 'DECLARE', arg1: temp, arg2: kind, result: value });
        } else {
          genDestructuring(value, temp, kind);
        }
      });
    }
  }

  gen(ast);
  return ir;
}