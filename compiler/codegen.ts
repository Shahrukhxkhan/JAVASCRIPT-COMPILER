import { Quadruple, Instruction } from '../types';
import { OpCode } from '../constants';

export function generateBytecode(ir: Quadruple[]): { instructions: Instruction[], labels: Map<string, number> } {
  const instructions: Instruction[] = [];
  const labelMap = new Map<string, number>();
  const jumpsToFix: { index: number, label: string, property?: string }[] = [];

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
      case 'NEQ': 
        pushOperand(q.arg1, q); 
        pushOperand(q.arg2, q); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.NEQ }); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result }); 
        break;
      case 'EQ_STRICT': 
        pushOperand(q.arg1, q); 
        pushOperand(q.arg2, q); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.EQ_STRICT }); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result }); 
        break;
      case 'NEQ_STRICT': 
        pushOperand(q.arg1, q); 
        pushOperand(q.arg2, q); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.NEQ_STRICT }); 
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
      case 'GTE': 
        pushOperand(q.arg1, q); 
        pushOperand(q.arg2, q); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.GTE }); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result }); 
        break;
      case 'LTE': 
        pushOperand(q.arg1, q); 
        pushOperand(q.arg2, q); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.LTE }); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result }); 
        break;
      case 'AND': 
        pushOperand(q.arg1, q); 
        pushOperand(q.arg2, q); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.AND }); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result }); 
        break;
      case 'OR': 
        pushOperand(q.arg1, q); 
        pushOperand(q.arg2, q); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.OR }); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result }); 
        break;
      case 'NULLISH':
        pushOperand(q.arg1, q); 
        pushOperand(q.arg2, q); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.NULLISH }); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result }); 
        break;
      case 'IN':
        pushOperand(q.arg1, q); 
        pushOperand(q.arg2, q); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.IN }); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result }); 
        break;
      case 'INSTANCEOF':
        pushOperand(q.arg1, q); 
        pushOperand(q.arg2, q); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.INSTANCEOF }); 
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result }); 
        break;
      case 'TYPEOF':
        pushOperand(q.arg1, q);
        instructions.push({ line: q.line, column: q.column, op: OpCode.TYPEOF });
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result });
        break;
      case 'NOT':
        pushOperand(q.arg1, q);
        instructions.push({ line: q.line, column: q.column, op: OpCode.NOT });
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result });
        break;
      case 'NEG':
        pushOperand(q.arg1, q);
        instructions.push({ line: q.line, column: q.column, op: OpCode.NEG });
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result });
        break;
      
      case 'ITER_KEYS':
        pushOperand(q.arg1, q);
        instructions.push({ line: q.line, column: q.column, op: OpCode.ITER_KEYS });
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result });
        break;
      case 'ITER_VALUES':
        pushOperand(q.arg1, q);
        instructions.push({ line: q.line, column: q.column, op: OpCode.ITER_VALUES });
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result });
        break;
      case 'ARRAY': {
        const typesStr = q.arg1 || '';
        const elements = (q.arg2 || '').split(',').filter(e => e !== '');
        elements.forEach(e => pushOperand(e, q));
        instructions.push({ line: q.line, column: q.column, op: OpCode.ARRAY, operand: typesStr });
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result });
        break;
      }

      case 'OBJECT': {
        const typesStr = q.arg1 || '';
        const pairs = (q.arg2 || '').split(',').filter(p => p !== '');
        pairs.forEach(p => {
          const [key, ...valParts] = p.split(':');
          const val = valParts.join(':');
          if (key !== 'null') {
             instructions.push({ line: q.line, column: q.column, op: OpCode.CONST, operand: key });
          }
          pushOperand(val, q);
        });
        instructions.push({ line: q.line, column: q.column, op: OpCode.OBJECT, operand: typesStr });
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result });
        break;
      }

      case 'GET_PROP':
        pushOperand(q.arg1, q);
        pushOperand(q.arg2, q);
        instructions.push({ line: q.line, column: q.column, op: OpCode.GET_PROP });
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result });
        break;

      case 'GET_PROP_OPTIONAL':
        pushOperand(q.arg1, q);
        pushOperand(q.arg2, q);
        instructions.push({ line: q.line, column: q.column, op: OpCode.GET_PROP_OPTIONAL });
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result });
        break;

      case 'SET_PROP':
        pushOperand(q.arg1, q);
        pushOperand(q.arg2, q);
        pushOperand(q.result, q); // result is the value to set
        instructions.push({ line: q.line, column: q.column, op: OpCode.SET_PROP });
        break;

      case 'TRY_START':
        if(q.arg1) jumpsToFix.push({ index: instructions.length, label: q.arg1.slice(1, -1), property: 'catchLabel' });
        if(q.arg2) jumpsToFix.push({ index: instructions.length, label: q.arg2.slice(1, -1), property: 'finallyLabel' });
        instructions.push({ line: q.line, column: q.column, op: OpCode.TRY_START, operand: { catchLabel: null, finallyLabel: null } });
        break;

      case 'TRY_END':
        instructions.push({ line: q.line, column: q.column, op: OpCode.TRY_END });
        break;

      case 'THROW':
        pushOperand(q.arg1, q);
        instructions.push({ line: q.line, column: q.column, op: OpCode.THROW });
        break;

      case 'FINALLY_END':
        instructions.push({ line: q.line, column: q.column, op: OpCode.FINALLY_END });
        break;

      case 'TEMPLATE': {
        const quasis = q.arg1 ? q.arg1.split('|::|') : [];
        const exprs = q.arg2 ? q.arg2.split(',') : [];
        
        // Push quasis and expressions alternatingly
        for (let i = 0; i < quasis.length; i++) {
          instructions.push({ line: q.line, column: q.column, op: OpCode.CONST, operand: quasis[i] });
          if (i < exprs.length) {
            pushOperand(exprs[i], q);
          }
        }
        
        instructions.push({ line: q.line, column: q.column, op: OpCode.TEMPLATE, operand: quasis.length + exprs.length });
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result });
        break;
      }

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

      case 'DECLARE':
        pushOperand(q.arg1, q);
        instructions.push({ line: q.line, column: q.column, op: OpCode.DECLARE, operand: { name: q.result, kind: q.arg2 } });
        break;

      case 'ARRAY_REST':
        pushOperand(q.arg1, q);
        pushOperand(q.arg2, q);
        instructions.push({ line: q.line, column: q.column, op: OpCode.ARRAY_REST });
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result });
        break;
        
      case 'OBJECT_REST':
        pushOperand(q.arg1, q);
        instructions.push({ line: q.line, column: q.column, op: OpCode.CONST, operand: q.arg2 });
        instructions.push({ line: q.line, column: q.column, op: OpCode.OBJECT_REST });
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result });
        break;

      case 'CLOSURE': {
        const flags = q.arg2 ? q.arg2.split(',') : ['false'];
        const isArrow = flags[0] === 'true';
        const isAsync = flags[1] === 'true';
        const isGenerator = flags[2] === 'true';
        instructions.push({ line: q.line, column: q.column, op: OpCode.CLOSURE, operand: { label: q.arg1?.replace(/^"|"$/g, ''), isArrow, isAsync, isGenerator } });
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result });
        break;
      }

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

      case 'IF_TRUE_GOTO':
        pushOperand(q.arg1, q);
        instructions.push({ line: q.line, column: q.column, op: OpCode.JMP_TRUE, operand: -1 }); // Placeholder
        if(q.result) jumpsToFix.push({ index: instructions.length - 1, label: q.result });
        break;

      case 'PARAM':
        pushOperand(q.arg1, q);
        break;

      case 'CALL':
        if(q.arg1 === 'print') {
            instructions.push({ line: q.line, column: q.column, op: OpCode.PRINT, operand: parseInt(q.arg2 || '1', 10) });
        } else {
            const [typesStr, ctxStr] = (q.arg2 || '').split('|::|');
            pushOperand(ctxStr || 'null', q);
            // Store the function name as operand. If it's a label, it will be backpatched.
            // Also store the argument types string so the VM knows how to spread arguments.
            instructions.push({ line: q.line, column: q.column, op: OpCode.CALL, operand: q.arg1, argCount: typesStr });
            if(q.arg1) jumpsToFix.push({ index: instructions.length - 1, label: q.arg1 });
            if(q.result) instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result });
        }
        break;

      case 'NEW':
        pushOperand(q.arg1, q);
        instructions.push({ line: q.line, column: q.column, op: OpCode.NEW, argCount: q.arg2 });
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result });
        break;
      
      case 'REST_ARG':
        instructions.push({ line: q.line, column: q.column, op: OpCode.REST_ARG, operand: { index: q.arg1, total: q.arg2, name: q.result } });
        break;

      case 'ARG':
        if(q.result) instructions.push({ line: q.line, column: q.column, op: OpCode.DECLARE, operand: { name: q.result, kind: 'let' } });
        break;

      case 'YIELD':
        pushOperand(q.arg1, q);
        instructions.push({ line: q.line, column: q.column, op: OpCode.YIELD });
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result });
        break;
      case 'YIELD_STAR':
        pushOperand(q.arg1, q);
        instructions.push({ line: q.line, column: q.column, op: OpCode.YIELD_STAR });
        instructions.push({ line: q.line, column: q.column, op: OpCode.STORE, operand: q.result });
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
          if (fix.property) {
              instructions[fix.index].operand[fix.property] = labelMap.get(fix.label);
          } else {
              instructions[fix.index].operand = labelMap.get(fix.label);
          }
      }
  }

  instructions.push({ op: OpCode.HALT });
  return { instructions, labels: labelMap };
}
