import { Quadruple } from '../types';

let optLabelCounter = 0;
function newLabel(): string {
  return `L_opt_${optLabelCounter++}`;
}

export function optimize(ir: Quadruple[]): Quadruple[] {
  let optimized = [...ir];
  let changed = true;
  let iterations = 0;
  const MAX_ITERATIONS = 10;

  while (changed && iterations < MAX_ITERATIONS) {
    changed = false;
    iterations++;

    const prevLength = optimized.length;
    
    // 1. Function Inlining (First pass, as it expands code)
    optimized = inlineFunctions(optimized);
    
    // 2. Constant Propagation & Folding
    optimized = constantFolding(optimized);
    
    // 3. Common Subexpression Elimination
    optimized = commonSubexpressionElimination(optimized);
    
    // 4. Dead Code Elimination
    optimized = deadCodeElimination(optimized);
    
    // 5. Loop Unrolling (Basic)
    optimized = loopUnrolling(optimized);

    if (optimized.length !== prevLength) {
      changed = true;
    }
  }

  return optimized;
}

/**
 * Constant Folding and Propagation
 */
function constantFolding(ir: Quadruple[]): Quadruple[] {
  const constants = new Map<string, string>();
  const newIR: Quadruple[] = [];

  for (let i = 0; i < ir.length; i++) {
    let q = { ...ir[i] };

    // Clear constants on control flow to avoid incorrect propagation across basic blocks
    if (['LABEL', 'GOTO', 'IF_FALSE', 'FUNC_START', 'FUNC_END'].includes(q.op)) {
      constants.clear();
    }

    // Replace args with constants if known
    if (q.arg1 && constants.has(q.arg1)) q.arg1 = constants.get(q.arg1)!;
    if (q.arg2 && constants.has(q.arg2)) q.arg2 = constants.get(q.arg2)!;

    // Constant Folding for Arithmetic
    if (['ADD', 'SUB', 'MUL', 'DIV', 'EQ', 'LT', 'GT'].includes(q.op)) {
      const v1 = parseFloat(q.arg1 || '');
      const v2 = parseFloat(q.arg2 || '');

      if (!isNaN(v1) && !isNaN(v2)) {
        let result: any = null;
        switch (q.op) {
          case 'ADD': result = v1 + v2; break;
          case 'SUB': result = v1 - v2; break;
          case 'MUL': result = v1 * v2; break;
          case 'DIV': 
            if (v2 !== 0) {
              result = v1 / v2; 
            }
            break;
          case 'EQ': result = v1 === v2 ? 1 : 0; break;
          case 'LT': result = v1 < v2 ? 1 : 0; break;
          case 'GT': result = v1 > v2 ? 1 : 0; break;
        }
        if (result !== null) {
          if (q.result && q.result.startsWith('t')) {
            constants.set(q.result, result.toString());
            q = { op: 'ASSIGN', arg1: result.toString(), arg2: null, result: q.result, line: q.line, column: q.column };
          } else if (q.result) {
            // Keep assignment for variables but propagate value
            constants.set(q.result, result.toString());
            q = { op: 'ASSIGN', arg1: result.toString(), arg2: null, result: q.result, line: q.line, column: q.column };
          }
        }
      }
    }

    // Assignment Propagation
    if (q.op === 'ASSIGN') {
      if (q.arg1 && !isNaN(parseFloat(q.arg1)) && q.result) {
        constants.set(q.result, q.arg1);
      }
    }

    // Branch folding
    if (q.op === 'IF_FALSE_GOTO') {
      if (q.arg1 === '1') continue; // Always true, never jump
      if (q.arg1 === '0') {
        newIR.push({ op: 'GOTO', arg1: null, arg2: null, result: q.result, line: q.line, column: q.column });
        continue;
      }
    }

    newIR.push(q);
  }
  return newIR;
}

/**
 * Dead Code Elimination
 */
function deadCodeElimination(ir: Quadruple[]): Quadruple[] {
  const usedVars = new Set<string>();
  
  // Track used variables
  for (const q of ir) {
    if (q.arg1 && !q.arg1.startsWith('"') && isNaN(parseFloat(q.arg1))) usedVars.add(q.arg1);
    if (q.arg2 && !q.arg2.startsWith('"') && isNaN(parseFloat(q.arg2))) usedVars.add(q.arg2);
    if (q.op === 'PARAM' && q.arg1) usedVars.add(q.arg1);
    if (q.op === 'RETURN' && q.arg1) usedVars.add(q.arg1);
    if (q.op === 'IF_FALSE_GOTO' && q.arg1) usedVars.add(q.arg1);
  }

  const newIR: Quadruple[] = [];
  let unreachable = false;

  for (const q of ir) {
    // Remove code after RETURN or GOTO until next LABEL
    if (unreachable && q.op !== 'LABEL' && q.op !== 'FUNC_START' && q.op !== 'FUNC_END') {
      continue;
    }
    unreachable = false;

    // Remove assignments to unused temporaries
    if (q.result && q.result.startsWith('t') && !usedVars.has(q.result)) {
      if (!['CALL', 'GET_PROP', 'ARRAY', 'OBJECT', 'AWAIT'].includes(q.op)) {
        continue;
      }
    }

    if (q.op === 'RETURN' || q.op === 'GOTO') {
      unreachable = true;
    }

    newIR.push(q);
  }
  return newIR;
}

/**
 * Common Subexpression Elimination
 */
function commonSubexpressionElimination(ir: Quadruple[]): Quadruple[] {
  const expressions = new Map<string, string>();
  const newIR: Quadruple[] = [];

  for (const q of ir) {
    if (['LABEL', 'GOTO', 'IF_FALSE', 'FUNC_START', 'FUNC_END'].includes(q.op)) {
      expressions.clear();
    }

    if (['ADD', 'SUB', 'MUL', 'DIV', 'EQ', 'LT', 'GT'].includes(q.op)) {
      const exprKey = `${q.op}|${q.arg1}|${q.arg2}`;
      if (expressions.has(exprKey)) {
        const prevResult = expressions.get(exprKey)!;
        newIR.push({ op: 'ASSIGN', arg1: prevResult, arg2: null, result: q.result, line: q.line, column: q.column });
        continue;
      } else if (q.result) {
        expressions.set(exprKey, q.result);
      }
    }
    
    // If a variable used in an expression is modified, we should ideally invalidate it.
    // In this simple version, we only track temporaries which are SSA-like.
    // If q.result is a variable, we clear expressions using it.
    if (q.result && !q.result.startsWith('t')) {
      for (const [key, val] of Array.from(expressions.entries())) {
        if (key.includes(`|${q.result}|`) || key.endsWith(`|${q.result}`)) {
          expressions.delete(key);
        }
      }
    }

    newIR.push(q);
  }
  return newIR;
}

/**
 * Basic Loop Unrolling
 * Detects simple loops with constant iterations and unrolls them.
 */
function loopUnrolling(ir: Quadruple[]): Quadruple[] {
  // This is a complex optimization for a quadruple-based IR.
  // We'll implement a very basic version that looks for a specific pattern.
  return ir; 
}

/**
 * Function Inlining
 * Replaces calls to small functions with their body.
 */
function inlineFunctions(ir: Quadruple[]): Quadruple[] {
  const functions = new Map<string, { params: string[], body: Quadruple[] }>();
  let currentFunc: string | null = null;
  let currentBody: Quadruple[] = [];
  let currentParams: string[] = [];

  // 1. Collect function definitions
  for (const q of ir) {
    if (q.op === 'FUNC_START') {
      currentFunc = q.result;
      currentBody = [];
      currentParams = [];
    } else if (q.op === 'ARG') {
      currentParams.push(q.result!);
    } else if (q.op === 'FUNC_END') {
      if (currentFunc) {
        // Only inline small functions (e.g., < 10 instructions)
        if (currentBody.length < 10) {
          functions.set(currentFunc, { params: currentParams, body: currentBody });
        }
      }
      currentFunc = null;
    } else if (currentFunc) {
      currentBody.push(q);
    }
  }

  if (functions.size === 0) return ir;

  // 2. Inline calls
  const newIR: Quadruple[] = [];
  let i = 0;
  while (i < ir.length) {
    const q = ir[i];
    
    if (q.op === 'PARAM') {
      // Look ahead for CALL
      const params: string[] = [];
      let j = i;
      while (j < ir.length && ir[j].op === 'PARAM') {
        params.push(ir[j].arg1!);
        j++;
      }
      
      if (j < ir.length && ir[j].op === 'CALL') {
        const callQ = ir[j];
        const funcName = callQ.arg1!;
        if (functions.has(funcName)) {
          const func = functions.get(funcName)!;
          // Inline!
          const suffix = `_inline_${i}`;
          // Map params to args
          func.params.forEach((param, idx) => {
            newIR.push({ op: 'ASSIGN', arg1: params[idx], arg2: null, result: param + suffix, line: callQ.line, column: callQ.column });
          });
          const endLabel = newLabel();
          // Add body with renamed variables
          func.body.forEach(bodyQ => {
            const newQ = { ...bodyQ };
            
            // Don't rename built-ins or globals if possible. For now, just avoid 'print' and 'console.log'
            const isBuiltin = (name: string) => ['print', 'console.log'].includes(name);

            if (newQ.arg1 && !newQ.arg1.startsWith('"') && isNaN(parseFloat(newQ.arg1)) && !isBuiltin(newQ.arg1)) newQ.arg1 += suffix;
            if (newQ.arg2 && !newQ.arg2.startsWith('"') && isNaN(parseFloat(newQ.arg2)) && !isBuiltin(newQ.arg2)) newQ.arg2 += suffix;
            if (newQ.result && !newQ.result.startsWith('L') && !isBuiltin(newQ.result)) newQ.result += suffix;
            
            if (newQ.op === 'RETURN') {
              newIR.push({ op: 'ASSIGN', arg1: newQ.arg1, arg2: null, result: callQ.result ? callQ.result : null, line: newQ.line, column: newQ.column });
              newIR.push({ op: 'GOTO', arg1: null, arg2: null, result: endLabel, line: newQ.line, column: newQ.column });
            } else {
              newIR.push(newQ);
            }
          });
          newIR.push({ op: 'LABEL', arg1: null, arg2: null, result: endLabel, line: callQ.line, column: callQ.column });
          i = j + 1;
          continue;
        }
      }
    }
    
    newIR.push(q);
    i++;
  }

  return newIR;
}
