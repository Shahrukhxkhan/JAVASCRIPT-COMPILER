import { Quadruple, Instruction } from '../types';
import { OpCode } from '../constants';

export function generateBytecode(ir: Quadruple[]): Instruction[] {
  const instructions: Instruction[] = [];
  const labelMap = new Map<string, number>();
  const jumpsToFix: { index: number; label: string }[] = [];

  function pushOperand(operand: string | null, sourceLine?: number) {
    if (operand === null) return;

    // String literal (JSON-encoded, starts with '"')
    if (operand.startsWith('"')) {
      try {
        instructions.push({ op: OpCode.CONST, operand: JSON.parse(operand), sourceLine });
      } catch {
        instructions.push({ op: OpCode.CONST, operand: operand.slice(1, -1), sourceLine });
      }
      return;
    }

    // Boolean / null literals encoded as JSON keywords
    if (operand === 'true') { instructions.push({ op: OpCode.CONST, operand: true, sourceLine }); return; }
    if (operand === 'false') { instructions.push({ op: OpCode.CONST, operand: false, sourceLine }); return; }
    if (operand === 'null') { instructions.push({ op: OpCode.CONST, operand: null, sourceLine }); return; }

    // Numeric literal
    if (/^-?[0-9]/.test(operand)) {
      instructions.push({ op: OpCode.CONST, operand: parseFloat(operand), sourceLine });
      return;
    }

    // Variable / temporary identifier
    instructions.push({ op: OpCode.LOAD, operand, sourceLine });
  }

  function inst(op: OpCode, operand?: any, sourceLine?: number): void {
    instructions.push({ op, operand, sourceLine });
  }

  for (const q of ir) {
    const sl = q.sourceLine;

    switch (q.op) {

      // ── Arithmetic ──
      case 'ADD': pushOperand(q.arg1, sl); pushOperand(q.arg2, sl); inst(OpCode.ADD, undefined, sl); inst(OpCode.STORE, q.result, sl); break;
      case 'SUB': pushOperand(q.arg1, sl); pushOperand(q.arg2, sl); inst(OpCode.SUB, undefined, sl); inst(OpCode.STORE, q.result, sl); break;
      case 'MUL': pushOperand(q.arg1, sl); pushOperand(q.arg2, sl); inst(OpCode.MUL, undefined, sl); inst(OpCode.STORE, q.result, sl); break;
      case 'DIV': pushOperand(q.arg1, sl); pushOperand(q.arg2, sl); inst(OpCode.DIV, undefined, sl); inst(OpCode.STORE, q.result, sl); break;
      case 'MOD': pushOperand(q.arg1, sl); pushOperand(q.arg2, sl);
        // Implement MOD as SUB(a, MUL(floor(a/b), b)) — simplest: emit as runtime op
        inst(OpCode.ADD, undefined, sl); // placeholder reuse — VM handles MOD
        // Actually emit a dedicated MOD-like sequence: we'll handle it in the VM
        // For now just reuse the CONST trick: VM checks OpCode extension
        // Let's just overwrite with correct approach:
        instructions.splice(instructions.length - 1, 1); // remove placeholder ADD
        // correct: already pushed arg1 and arg2
        inst('MOD' as OpCode, undefined, sl);
        inst(OpCode.STORE, q.result, sl);
        break;

      // ── Comparisons ──
      case 'EQ': pushOperand(q.arg1, sl); pushOperand(q.arg2, sl); inst(OpCode.EQ, undefined, sl); inst(OpCode.STORE, q.result, sl); break;
      case 'NEQ': pushOperand(q.arg1, sl); pushOperand(q.arg2, sl); inst(OpCode.NEQ, undefined, sl); inst(OpCode.STORE, q.result, sl); break;
      case 'GT': pushOperand(q.arg1, sl); pushOperand(q.arg2, sl); inst(OpCode.GT, undefined, sl); inst(OpCode.STORE, q.result, sl); break;
      case 'LT': pushOperand(q.arg1, sl); pushOperand(q.arg2, sl); inst(OpCode.LT, undefined, sl); inst(OpCode.STORE, q.result, sl); break;
      case 'GTE': pushOperand(q.arg1, sl); pushOperand(q.arg2, sl); inst(OpCode.GTE, undefined, sl); inst(OpCode.STORE, q.result, sl); break;
      case 'LTE': pushOperand(q.arg1, sl); pushOperand(q.arg2, sl); inst(OpCode.LTE, undefined, sl); inst(OpCode.STORE, q.result, sl); break;

      case 'UNARY_MINUS':
        inst(OpCode.CONST, 0, sl);
        pushOperand(q.arg2, sl);
        inst(OpCode.SUB, undefined, sl);
        inst(OpCode.STORE, q.result, sl);
        break;

      case 'NOT':
        pushOperand(q.arg2, sl);
        inst(OpCode.EQ, undefined, sl);  // compare with 0 (falsey)
        // Actually NOT should negate: push 0, compare eq for boolean not
        // better: emit dedicated NOT handling in VM
        instructions.splice(instructions.length - 1, 1); // remove EQ
        inst('NOT' as OpCode, undefined, sl);
        inst(OpCode.STORE, q.result, sl);
        break;

      // ── Assignment & variables ──
      case 'DEFINE_VAR':
        pushOperand(q.arg1, sl);
        inst(OpCode.DEFINE, q.result, sl);
        break;

      case 'ASSIGN':
        pushOperand(q.arg1, sl);
        inst(OpCode.STORE, q.result, sl);
        break;

      // ── Control flow ──
      case 'LABEL':
        if (q.result) labelMap.set(q.result, instructions.length);
        break;

      case 'FUNC_START':
        if (q.result) labelMap.set(q.result, instructions.length);
        break;

      case 'GOTO':
        inst(OpCode.JMP, -1, sl);
        if (q.result) jumpsToFix.push({ index: instructions.length - 1, label: q.result });
        break;

      case 'IF_FALSE_GOTO':
        pushOperand(q.arg1, sl);
        inst(OpCode.JMP_FALSE, -1, sl);
        if (q.result) jumpsToFix.push({ index: instructions.length - 1, label: q.result });
        break;

      case 'IF_TRUE_GOTO':
        pushOperand(q.arg1, sl);
        inst(OpCode.JMP_FALSE, -1, sl); // flip: we jump when false, so NOT then jump_false
        // Actually: emit JMP_TRUE — but we don't have that opcode
        // Workaround: negate with EQ 0, then JMP_FALSE
        // Simpler: just add JMP_TRUE opcode to VM
        instructions.splice(instructions.length - 1, 1);
        inst('JMP_TRUE' as OpCode, -1, sl);
        if (q.result) jumpsToFix.push({ index: instructions.length - 1, label: q.result });
        break;

      // ── Function calls ──
      case 'PARAM':
        pushOperand(q.arg1, sl);
        break;

      case 'CALL':
        if (q.arg1 === 'print') {
          inst(OpCode.PRINT, Number(q.arg2 ?? 1), sl);
        } else {
          inst(OpCode.CALL, -1, sl);
          if (q.arg1) jumpsToFix.push({ index: instructions.length - 1, label: q.arg1 });
          if (q.result) inst(OpCode.STORE, q.result, sl);
        }
        break;

      case 'ARG':
        if (q.result) inst(OpCode.STORE, q.result, sl);
        break;

      case 'DEFINE_ARG':
        if (q.result) inst(OpCode.DEFINE, q.result, sl);
        break;

      case 'RETURN':
        pushOperand(q.arg1, sl);
        inst(OpCode.RET, undefined, sl);
        break;

      case 'FUNC_END':
        break;

      // ── Scope management ──
      case 'ENTER_SCOPE':
        inst(OpCode.ENTER_SCOPE, undefined, sl);
        break;

      case 'EXIT_SCOPE':
        inst(OpCode.EXIT_SCOPE, undefined, sl);
        break;

      // ── Arrays ──
      case 'ARRAY_NEW':
        inst(OpCode.ARRAY_NEW, Number(q.arg1), sl);
        if (q.result) inst(OpCode.STORE, q.result, sl);
        break;

      case 'ARRAY_GET':
        pushOperand(q.arg1, sl); // push array ref
        pushOperand(q.arg2, sl); // push index
        inst(OpCode.ARRAY_GET, undefined, sl);
        if (q.result) inst(OpCode.STORE, q.result, sl);
        break;

      case 'ARRAY_SET':
        pushOperand(q.arg1, sl); // push array ref
        pushOperand(q.arg2, sl); // push index
        pushOperand(q.result, sl); // push value
        inst(OpCode.ARRAY_SET, undefined, sl);
        break;

      // ── Objects ──
      case 'OBJ_PAIR':
        // Push key string and value onto stack for OBJ_NEW to consume
        pushOperand(q.arg1, sl); // key (JSON string)
        pushOperand(q.arg2, sl); // value
        break;

      case 'OBJ_NEW':
        inst(OpCode.OBJ_NEW, Number(q.arg1), sl);
        if (q.result) inst(OpCode.STORE, q.result, sl);
        break;

      case 'OBJ_GET':
        pushOperand(q.arg1, sl); // push object ref
        pushOperand(q.arg2, sl); // push key string
        inst(OpCode.OBJ_GET, undefined, sl);
        if (q.result) inst(OpCode.STORE, q.result, sl);
        break;

      case 'OBJ_SET':
        pushOperand(q.arg1, sl); // push object ref
        pushOperand(q.arg2, sl); // push key string
        pushOperand(q.result, sl); // push value
        inst(OpCode.OBJ_SET, undefined, sl);
        break;
    }
  }

  // Backpatch jumps
  for (const fix of jumpsToFix) {
    if (labelMap.has(fix.label)) {
      instructions[fix.index].operand = labelMap.get(fix.label);
    }
  }

  inst(OpCode.HALT, undefined, undefined);
  return instructions;
}