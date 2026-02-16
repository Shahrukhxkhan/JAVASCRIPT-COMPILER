import { Quadruple, Instruction } from '../types';
import { OpCode } from '../constants';

export function generateBytecode(ir: Quadruple[]): Instruction[] {
  const instructions: Instruction[] = [];
  const labelMap = new Map<string, number>();
  const jumpsToFix: { index: number, label: string }[] = [];

  function pushOperand(operand: string | null) {
      if (operand === null) return;
      
      // Check if it is a string literal (starts with ")
      if (operand.startsWith('"')) {
          try {
              instructions.push({ op: OpCode.CONST, operand: JSON.parse(operand) });
          } catch (e) {
              instructions.push({ op: OpCode.CONST, operand: operand.slice(1, -1) });
          }
          return;
      }

      // Check if it is a number literal (starts with a digit)
      if (/^[0-9]/.test(operand)) {
          instructions.push({ op: OpCode.CONST, operand: parseFloat(operand) });
          return;
      }

      // Otherwise treat as variable/temporary lookup
      instructions.push({ op: OpCode.LOAD, operand: operand });
  }

  for (const q of ir) {
    switch (q.op) {
      case 'ADD': 
        pushOperand(q.arg1); 
        pushOperand(q.arg2); 
        instructions.push({ op: OpCode.ADD }); 
        instructions.push({ op: OpCode.STORE, operand: q.result }); 
        break;
      case 'SUB': 
        pushOperand(q.arg1); 
        pushOperand(q.arg2); 
        instructions.push({ op: OpCode.SUB }); 
        instructions.push({ op: OpCode.STORE, operand: q.result }); 
        break;
      case 'MUL': 
        pushOperand(q.arg1); 
        pushOperand(q.arg2); 
        instructions.push({ op: OpCode.MUL }); 
        instructions.push({ op: OpCode.STORE, operand: q.result }); 
        break;
      case 'DIV': 
        pushOperand(q.arg1); 
        pushOperand(q.arg2); 
        instructions.push({ op: OpCode.DIV }); 
        instructions.push({ op: OpCode.STORE, operand: q.result }); 
        break;
      case 'EQ': 
        pushOperand(q.arg1); 
        pushOperand(q.arg2); 
        instructions.push({ op: OpCode.EQ }); 
        instructions.push({ op: OpCode.STORE, operand: q.result }); 
        break;
      case 'GT': 
        pushOperand(q.arg1); 
        pushOperand(q.arg2); 
        instructions.push({ op: OpCode.GT }); 
        instructions.push({ op: OpCode.STORE, operand: q.result }); 
        break;
      case 'LT': 
        pushOperand(q.arg1); 
        pushOperand(q.arg2); 
        instructions.push({ op: OpCode.LT }); 
        instructions.push({ op: OpCode.STORE, operand: q.result }); 
        break;
      
      case 'ASSIGN':
        pushOperand(q.arg1);
        instructions.push({ op: OpCode.STORE, operand: q.result });
        break;

      case 'LABEL':
        if(q.result) labelMap.set(q.result, instructions.length);
        break;
      
      case 'FUNC_START':
        if(q.result) labelMap.set(q.result, instructions.length);
        break;

      case 'GOTO':
        instructions.push({ op: OpCode.JMP, operand: -1 }); // Placeholder
        if(q.result) jumpsToFix.push({ index: instructions.length - 1, label: q.result });
        break;

      case 'IF_FALSE_GOTO':
        pushOperand(q.arg1);
        instructions.push({ op: OpCode.JMP_FALSE, operand: -1 }); // Placeholder
        if(q.result) jumpsToFix.push({ index: instructions.length - 1, label: q.result });
        break;

      case 'PARAM':
        pushOperand(q.arg1);
        break;

      case 'CALL':
        if(q.arg1 === 'print') {
            instructions.push({ op: OpCode.PRINT });
        } else {
            instructions.push({ op: OpCode.CALL, operand: -1 });
            if(q.arg1) jumpsToFix.push({ index: instructions.length - 1, label: q.arg1 });
            if(q.result) instructions.push({ op: OpCode.STORE, operand: q.result });
        }
        break;
      
      case 'ARG':
        if(q.result) instructions.push({ op: OpCode.STORE, operand: q.result });
        break;

      case 'RETURN':
        pushOperand(q.arg1);
        instructions.push({ op: OpCode.RET });
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
  return instructions;
}