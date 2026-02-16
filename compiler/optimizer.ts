import { Quadruple } from '../types';

export function optimize(ir: Quadruple[]): Quadruple[] {
  let optimized = [...ir];
  let changed = true;

  while (changed) {
    changed = false;
    const constants = new Map<string, string>();
    const newIR: Quadruple[] = [];
    const skipIndices = new Set<number>();

    // Pass 1: Constant Propagation & Folding
    for (let i = 0; i < optimized.length; i++) {
        if(skipIndices.has(i)) continue;

        let q = optimized[i];

        // Replace args with constants if known
        if (q.arg1 && constants.has(q.arg1)) q = { ...q, arg1: constants.get(q.arg1)! };
        if (q.arg2 && constants.has(q.arg2)) q = { ...q, arg2: constants.get(q.arg2)! };

        // Constant Folding
        if (['ADD', 'SUB', 'MUL', 'DIV'].includes(q.op)) {
            const v1 = parseFloat(q.arg1 || '');
            const v2 = parseFloat(q.arg2 || '');
            
            if (!isNaN(v1) && !isNaN(v2)) {
                let result = 0;
                switch(q.op) {
                    case 'ADD': result = v1 + v2; break;
                    case 'SUB': result = v1 - v2; break;
                    case 'MUL': result = v1 * v2; break;
                    case 'DIV': result = v1 / v2; break;
                }
                if (q.result) {
                    constants.set(q.result, result.toString());
                    changed = true;
                    // Eliminate this instruction
                    continue; 
                }
            }
        }
        
        // Simple Assignment Propagation (t0 = 5)
        if (q.op === 'ASSIGN') {
            const val = parseFloat(q.arg1 || '');
            if(!isNaN(val) && q.result) {
                constants.set(q.result, q.arg1!);
                // We keep assignment if it's a variable, but if it's a temp we might remove it.
                // For safety in this simple optimizer, we keep variable assignments.
                if(q.result.startsWith('t')) {
                     changed = true;
                     continue; // Remove temp assignment
                }
            }
        }

        newIR.push(q);
    }
    optimized = newIR;
  }

  return optimized;
}
