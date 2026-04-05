import { Quadruple, Instruction } from '../types';
import { OpCode } from '../constants';

export function generateBytecode(ir: Quadruple[]): { instructions: Instruction[], labels: Map<string, number> } {
  const instructions: Instruction[] = [];
  const labelMap = new Map<string, number>();
  const jumpsToFix: { index: number, label: string }[] = [];

  function pushOperand(operand: string | null, q: Quadruple) {
      if (operand === null) return;
      
      if (operand === 'true') {
          instructions.push({ line: q.line, column: q.column, op: OpCode.CONST, operand: true });
          return;
      }
      if (operand === 'false') {
          instructions.push({ line: q.line, column: q.column, op: OpCode.CONST, operand: false });
          return;
      }
      if (operand === 'null') {
          instructions.push({ line: q.line, column: q.column, op: OpCode.CONST, operand: null });
          return;
      }
      if (operand === 'undefined') {
          instructions.push({ line: q.line, column: q.column, op: OpCode.CONST, operand: undefined });
          return;
      }

      // Check if it is a string literal (starts with ")
      if (operand.startsWith('"')) {
          try {
              instructions.push({ line: q.line, column: q.column, op: OpCode.CONST, operand: JSON.parse(operand) });
          } catch (e) {
              instructions.push({ line: q.line, column: q.column, op: OpCode.CONST, operand: operand.slice(1, -1) });
          }
          return;
      }

      // Check if it is a number literal (starts with a digit)
      if (/^[0-9]/.test(operand)) {
          if (operand.endsWith('n')) {
              instructions.push({ line: q.line, column: q.column, op: OpCode.CONST, operand: BigInt(operand.slice(0, -1)) });
          } else {
              instructions.push({ line: q.line, column: q.column, op: OpCode.CONST, operand: parseFloat(operand) });
          }
          return;
      }

      // Otherwise treat as variable/temporary lookup
      instructions.push({ line: q.line, column: q.column, op: OpCode.LOAD, operand: operand });
  }

  for (const q of ir) {
    switch (q.op) {
      case 'ADD': 
        pushOperand(q.arg1, q); 
        pushOperand(q.arg2, q); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.ADD }); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result }); 
        break;
      case 'SUB': 
        pushOperand(q.arg1, q); 
        pushOperand(q.arg2, q); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.SUB }); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result }); 
        break;
      case 'MUL': 
        pushOperand(q.arg1, q); 
        pushOperand(q.arg2, q); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.MUL }); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result }); 
        break;
      case 'DIV': 
        pushOperand(q.arg1, q); 
        pushOperand(q.arg2, q); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.DIV }); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result }); 
        break;
      case 'EQ': 
        pushOperand(q.arg1, q); 
        pushOperand(q.arg2, q); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.EQ }); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result }); 
        break;
      case 'GT': 
        pushOperand(q.arg1, q); 
        pushOperand(q.arg2, q); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.GT }); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result }); 
        break;
      case 'LT': 
        pushOperand(q.arg1, q); 
        pushOperand(q.arg2, q); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.LT }); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result }); 
        break;
      
      case 'ARRAY': {
        const count = parseInt(q.arg1 || '0');
        const elements = (q.arg2 || '').split(',').filter(e => e !== '');
        elements.forEach(e => pushOperand(e, q));
        instructions.push({ line: q.line, column: q.column, op: OpCode.ARRAY, operand: count });
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result });
        break;
      }

      case 'OBJECT': {
        const count = parseInt(q.arg1 || '0');
        const pairs = (q.arg2 || '').split(',').filter(p => p !== '');
        pairs.forEach(p => {
          const [key, val] = p.split(':');
          instructions.push({ line: q.line, column: q.column, op: OpCode.CONST, operand: key });
          pushOperand(val, q);
        });
        instructions.push({ line: q.line, column: q.column, op: OpCode.OBJECT, operand: count });
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result });
        break;
      }

      case 'GET_PROP':
        pushOperand(q.arg1, q);
        pushOperand(q.arg2, q);
        instructions.push({ line: q.line, column: q.column, op: OpCode.GET_PROP });
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result });
        break;

      case 'SET_PROP':
        pushOperand(q.arg1, q);
        instructions.push({ line: q.line, column: q.column, op: OpCode.CONST, operand: q.arg2 });
        pushOperand(q.result, q); // result is the value to set
        instructions.push({ line: q.line, column: q.column, op: OpCode.SET_PROP });
        break;

      case 'TRY_START':
        instructions.push({ line: q.line, column: q.column, op: OpCode.TRY_START, operand: -1 });
        if(q.result) jumpsToFix.push({ index: instructions.length - 1, label: q.result });
        break;

      case 'TRY_END':
        instructions.push({ line: q.line, column: q.column, op: OpCode.TRY_END });
        break;

      case 'THROW':
        pushOperand(q.arg1, q);
        instructions.push({ line: q.line, column: q.column, op: OpCode.THROW });
        break;

      case 'AWAIT':
        pushOperand(q.arg1, q);
        instructions.push({ line: q.line, column: q.column, op: OpCode.AWAIT });
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result });
        break;

      case 'EXTENDS':
        pushOperand(q.arg1, q); // parent
        pushOperand(q.arg2, q); // child
        instructions.push({ line: q.line, column: q.column, op: OpCode.EXTENDS });
        break;

      case 'ASSIGN':
        pushOperand(q.arg1, q);
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result });
        break;

      case 'LABEL':
        if(q.result) labelMap.set(q.result, instructions.length);
        break;
      
      case 'FUNC_START':
        if(q.result) labelMap.set(q.result, instructions.length);
        break;

      case 'GOTO':
        instructions.push({ line: q.line, column: q.column, op: OpCode.JMP, operand: -1 }); // Placeholder
        if(q.result) jumpsToFix.push({ index: instructions.length - 1, label: q.result });
        break;

      case 'IF_FALSE_GOTO':
        pushOperand(q.arg1, q);
        instructions.push({ line: q.line, column: q.column, op: OpCode.JMP_FALSE, operand: -1 }); // Placeholder
        if(q.result) jumpsToFix.push({ index: instructions.length - 1, label: q.result });
        break;

      case 'PARAM':
        pushOperand(q.arg1, q);
        break;

      case 'CALL':
        if(q.arg1 === 'print') {
            instructions.push({ line: q.line, column: q.column, op: OpCode.PRINT, operand: parseInt(q.arg2 || '1', 10) });
        } else {
            // Store the function name as operand. If it's a label, it will be backpatched.
            // Also store the argument count so the VM knows how many arguments to pop.
            instructions.push({ line: q.line, column: q.column, op: OpCode.CALL, operand: q.arg1, argCount: parseInt(q.arg2 || '0', 10) });
            if(q.arg1) jumpsToFix.push({ index: instructions.length - 1, label: q.arg1 });
            if(q.result) instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result });
        }
        break;
      
      case 'ARG':
        if(q.result) instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result });
        break;

      case 'RETURN':
        pushOperand(q.arg1, q);
        instructions.push({ line: q.line, column: q.column, op: OpCode.RET });
        break;
    }
  }

  // Backpatch jumps
  for (const fix of jumpsToFix) {
      if (labelMap.has(fix.label)) {
          instructions[fix.index].operand = labelMap.get(fix.label);
      }
  }

  instructions.push({ op: OpCode.HALT });
  return { instructions, labels: labelMap };
}
