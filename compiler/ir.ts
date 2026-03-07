import { ASTNode, Quadruple, Program } from '../types';
import { ASTNodeType } from '../constants';

let tempCounter = 0;
let labelCounter = 0;

function newTemp(): string { return `t${tempCounter++}`; }
function newLabel(): string { return `L${labelCounter++}`; }

export function generateIR(ast: Program): Quadruple[] {
  tempCounter = 0;
  labelCounter = 0;
  const ir: Quadruple[] = [];

  // Stack of { breakLabel, continueLabel } for nested loops
  const loopStack: { breakLabel: string; continueLabel: string }[] = [];

  function emit(op: string, arg1: string | null, arg2: string | null, result: string | null, sourceLine?: number) {
    ir.push({ op, arg1, arg2, result, sourceLine });
  }

  function gen(node: ASTNode): string | null {
    const line = node.line;

    switch (node.type) {

      case ASTNodeType.Program:
      case ASTNodeType.BlockStatement:
        node.body.forEach((stmt: ASTNode) => gen(stmt));
        return null;

      case ASTNodeType.Literal:
        return JSON.stringify(node.value);

      case ASTNodeType.Identifier:
        return node.value;

      case ASTNodeType.VariableDeclaration:
        if (node.init) {
          const val = gen(node.init);
          emit('DEFINE_VAR', val, null, node.name, line);
        } else {
          emit('DEFINE_VAR', 'null', null, node.name, line);
        }
        return null;

      case ASTNodeType.AssignmentExpression: {
        const right = gen(node.right);
        const left = node.left;

        if (left.type === ASTNodeType.IndexExpression) {
          // arr[i] = val  →  ARRAY_SET
          const obj = gen(left.object);
          const idx = gen(left.index);
          emit('ARRAY_SET', obj, idx, right, line);
          return right;
        }
        if (left.type === ASTNodeType.MemberExpression) {
          // obj.key = val  →  OBJ_SET
          const obj = gen(left.object);
          const key = JSON.stringify(left.property.value);
          emit('OBJ_SET', obj, key, right, line);
          return right;
        }
        // Simple variable assignment
        emit('ASSIGN', right, null, left.value, line);
        return left.value;
      }

      case ASTNodeType.BinaryExpression: {
        // Handle short-circuit && / ||
        if (node.operator === '&&') {
          const temp = newTemp();
          const falseLabel = newLabel();
          const endLabel = newLabel();
          const l = gen(node.left);
          emit('IF_FALSE_GOTO', l, null, falseLabel, line);
          const r = gen(node.right);
          emit('ASSIGN', r, null, temp, line);
          emit('GOTO', null, null, endLabel, line);
          emit('LABEL', null, null, falseLabel, line);
          emit('ASSIGN', '0', null, temp, line);
          emit('LABEL', null, null, endLabel, line);
          return temp;
        }
        if (node.operator === '||') {
          const temp = newTemp();
          const trueLabel = newLabel();
          const endLabel = newLabel();
          const l = gen(node.left);
          emit('IF_TRUE_GOTO', l, null, trueLabel, line);
          const r = gen(node.right);
          emit('ASSIGN', r, null, temp, line);
          emit('GOTO', null, null, endLabel, line);
          emit('LABEL', null, null, trueLabel, line);
          emit('ASSIGN', '1', null, temp, line);
          emit('LABEL', null, null, endLabel, line);
          return temp;
        }

        const t1 = gen(node.left);
        const t2 = gen(node.right);
        const temp = newTemp();
        const opMap: Record<string, string> = {
          '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '%': 'MOD',
          '==': 'EQ', '===': 'EQ', '!=': 'NEQ', '!==': 'NEQ',
          '>': 'GT', '<': 'LT', '>=': 'GTE', '<=': 'LTE',
          'UNARY_MINUS': 'UNARY_MINUS', 'NOT': 'NOT',
        };
        const opCode = opMap[node.operator] || 'UNKNOWN';

        if (opCode === 'UNARY_MINUS') {
          emit('UNARY_MINUS', t2, null, temp, line);
        } else if (opCode === 'NOT') {
          emit('NOT', t2, null, temp, line);
        } else {
          emit(opCode, t1, t2, temp, line);
        }
        return temp;
      }

      case ASTNodeType.UpdateExpression: {
        // i++ / ++i  →  ASSIGN i, i+1; return old or new value
        const argName = gen(node.argument)!;
        const one = '1';
        const temp = newTemp();
        emit('ADD', argName, one, temp, line);
        if (node.operator === '--') emit('SUB', argName, one, temp, line);
        // prefix returns new value, postfix returns old value
        const retVal = newTemp();
        emit('ASSIGN', node.prefix ? temp : argName, null, retVal, line);
        emit('ASSIGN', temp, null, argName, line);
        return retVal;
      }

      case ASTNodeType.ExpressionStatement:
        gen(node.expression);
        return null;

      case ASTNodeType.CallExpression: {
        // print / console.log
        const isPrint =
          (node.callee.type === ASTNodeType.Identifier && node.callee.value === 'print') ||
          (node.callee.type === ASTNodeType.MemberExpression &&
            node.callee.object.value === 'console' &&
            node.callee.property.value === 'log');

        if (isPrint) {
          node.arguments.forEach((a: ASTNode) => {
            const arg = gen(a);
            emit('PARAM', arg, null, null, line);
          });
          emit('CALL', 'print', String(node.arguments.length), null, line);
          return null;
        }

        // Generic call
        const args = node.arguments.map((a: ASTNode) => gen(a));
        args.forEach((a) => emit('PARAM', a, null, null, line));
        const funcName = node.callee.type === ASTNodeType.Identifier
          ? node.callee.value
          : node.callee.object?.value + '.' + node.callee.property?.value;
        const temp = newTemp();
        emit('CALL', funcName, String(args.length), temp, line);
        return temp;
      }

      case ASTNodeType.IfStatement: {
        const condition = gen(node.test);
        const labelElse = newLabel();
        const labelEnd = newLabel();
        emit('IF_FALSE_GOTO', condition, null, labelElse, line);
        gen(node.consequent);
        emit('GOTO', null, null, labelEnd, line);
        emit('LABEL', null, null, labelElse, line);
        if (node.alternate) gen(node.alternate);
        emit('LABEL', null, null, labelEnd, line);
        return null;
      }

      case ASTNodeType.WhileStatement: {
        const loopStart = newLabel();
        const loopEnd = newLabel();
        loopStack.push({ breakLabel: loopEnd, continueLabel: loopStart });

        emit('LABEL', null, null, loopStart, line);
        const cond = gen(node.test);
        emit('IF_FALSE_GOTO', cond, null, loopEnd, line);
        gen(node.body);
        emit('GOTO', null, null, loopStart, line);
        emit('LABEL', null, null, loopEnd, line);

        loopStack.pop();
        return null;
      }

      case ASTNodeType.ForStatement: {
        const loopStart = newLabel();
        const loopUpdate = newLabel();
        const loopEnd = newLabel();
        loopStack.push({ breakLabel: loopEnd, continueLabel: loopUpdate });

        // Init
        if (node.init) gen(node.init);

        emit('LABEL', null, null, loopStart, line);

        // Condition guard
        if (node.test) {
          const cond = gen(node.test);
          emit('IF_FALSE_GOTO', cond, null, loopEnd, line);
        }

        gen(node.body);

        // Update
        emit('LABEL', null, null, loopUpdate, line);
        if (node.update) gen(node.update);

        emit('GOTO', null, null, loopStart, line);
        emit('LABEL', null, null, loopEnd, line);

        loopStack.pop();
        return null;
      }

      case ASTNodeType.BreakStatement: {
        const top = loopStack[loopStack.length - 1];
        emit('GOTO', null, null, top.breakLabel, line);
        return null;
      }

      case ASTNodeType.ContinueStatement: {
        const top = loopStack[loopStack.length - 1];
        emit('GOTO', null, null, top.continueLabel, line);
        return null;
      }

      case ASTNodeType.FunctionDeclaration: {
        const funcEndLabel = newLabel();
        emit('GOTO', null, null, funcEndLabel, line);
        emit('FUNC_START', null, null, node.name, line);
        emit('ENTER_SCOPE', null, null, null, line);
        node.params.forEach((p: string) => emit('DEFINE_ARG', null, null, p, line));
        gen(node.body);
        emit('RETURN', '0', null, null, line);
        emit('FUNC_END', null, null, node.name, line);
        emit('EXIT_SCOPE', null, null, null, line);
        emit('LABEL', null, null, funcEndLabel, line);
        return null;
      }

      case ASTNodeType.ReturnStatement: {
        const val = node.argument ? gen(node.argument) : '0';
        emit('RETURN', val, null, null, line);
        return null;
      }

      // ──── Arrays ────

      case ASTNodeType.ArrayExpression: {
        const temp = newTemp();
        const n = node.elements.length;
        // Push each element; ARRAY_NEW n pops them in order
        node.elements.forEach((el: ASTNode) => {
          const v = gen(el);
          emit('PARAM', v, null, null, line);
        });
        emit('ARRAY_NEW', String(n), null, temp, line);
        return temp;
      }

      case ASTNodeType.IndexExpression: {
        const obj = gen(node.object);
        const idx = gen(node.index);
        const temp = newTemp();
        emit('ARRAY_GET', obj, idx, temp, line);
        return temp;
      }

      // ──── Objects ────

      case ASTNodeType.ObjectExpression: {
        const temp = newTemp();
        const n = node.properties.length;
        node.properties.forEach((p: { key: string; value: ASTNode }) => {
          const v = gen(p.value);
          emit('OBJ_PAIR', JSON.stringify(p.key), v, null, line);
        });
        emit('OBJ_NEW', String(n), null, temp, line);
        return temp;
      }

      case ASTNodeType.MemberExpression: {
        const obj = gen(node.object);
        const key = JSON.stringify(node.property.value);
        const temp = newTemp();
        emit('OBJ_GET', obj, key, temp, line);
        return temp;
      }
    }

    return null;
  }

  gen(ast);
  return ir;
}