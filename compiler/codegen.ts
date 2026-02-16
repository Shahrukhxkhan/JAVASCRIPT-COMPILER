import { Quadruple, Instruction } from '../types';
import { OpCode } from '../constants';

export function generateBytecode(ir: Quadruple[]): Instruction[] {
  const instructions: Instruction[] = [];
  const labelMap = new Map<string, number>();
  const jumpsToFix: { index: number, label: string }[] = [];

  // To handle functions simply in this stack machine without complex frame pointers for the demo:
  // We will flatten the execution. 
  // 'FUNC_START' acts as a label.
  
  for (const q of ir) {
    switch (q.op) {
      case 'ADD': instructions.push({ op: OpCode.LOAD, operand: q.arg1 }, { op: OpCode.LOAD, operand: q.arg2 }, { op: OpCode.ADD }, { op: OpCode.STORE, operand: q.result }); break;
      case 'SUB': instructions.push({ op: OpCode.LOAD, operand: q.arg1 }, { op: OpCode.LOAD, operand: q.arg2 }, { op: OpCode.SUB }, { op: OpCode.STORE, operand: q.result }); break;
      case 'MUL': instructions.push({ op: OpCode.LOAD, operand: q.arg1 }, { op: OpCode.LOAD, operand: q.arg2 }, { op: OpCode.MUL }, { op: OpCode.STORE, operand: q.result }); break;
      case 'DIV': instructions.push({ op: OpCode.LOAD, operand: q.arg1 }, { op: OpCode.LOAD, operand: q.arg2 }, { op: OpCode.DIV }, { op: OpCode.STORE, operand: q.result }); break;
      case 'EQ': instructions.push({ op: OpCode.LOAD, operand: q.arg1 }, { op: OpCode.LOAD, operand: q.arg2 }, { op: OpCode.EQ }, { op: OpCode.STORE, operand: q.result }); break;
      case 'GT': instructions.push({ op: OpCode.LOAD, operand: q.arg1 }, { op: OpCode.LOAD, operand: q.arg2 }, { op: OpCode.GT }, { op: OpCode.STORE, operand: q.result }); break;
      case 'LT': instructions.push({ op: OpCode.LOAD, operand: q.arg1 }, { op: OpCode.LOAD, operand: q.arg2 }, { op: OpCode.LT }, { op: OpCode.STORE, operand: q.result }); break;
      
      case 'ASSIGN':
        // Direct assignment: result = arg1
        instructions.push({ op: OpCode.LOAD, operand: q.arg1 });
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
        instructions.push({ op: OpCode.LOAD, operand: q.arg1 });
        instructions.push({ op: OpCode.JMP_FALSE, operand: -1 }); // Placeholder
        if(q.result) jumpsToFix.push({ index: instructions.length - 1, label: q.result });
        break;

      case 'PARAM':
        instructions.push({ op: OpCode.LOAD, operand: q.arg1 });
        break;

      case 'CALL':
        if(q.arg1 === 'print') {
            instructions.push({ op: OpCode.PRINT });
        } else {
            // Function call logic
            // 1. Push return address (handled by VM in real implementations, here we simulate)
            // 2. Jump
            instructions.push({ op: OpCode.CALL, operand: -1 });
            if(q.arg1) jumpsToFix.push({ index: instructions.length - 1, label: q.arg1 });
            
            // Store result if needed
            if(q.result) instructions.push({ op: OpCode.STORE, operand: q.result });
        }
        break;
      
      case 'ARG':
        // In a real stack frame, args are already on stack. 
        // We just pop them into local variables (reverse order usually, but let's assume simplified)
        if(q.result) instructions.push({ op: OpCode.STORE, operand: q.result });
        break;

      case 'RETURN':
        if(q.arg1) instructions.push({ op: OpCode.LOAD, operand: q.arg1 });
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
