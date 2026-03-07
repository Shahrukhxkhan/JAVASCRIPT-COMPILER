import { Instruction } from '../types';
import { OpCode } from '../constants';

type JsValue = any;

export class VM {
  private stack: JsValue[] = [];
  // Scope chain: array of Maps, innermost last.
  private envStack: Map<string, JsValue>[] = [];
  private ip: number = 0;
  private instructions: Instruction[] = [];
  private outputLog: string[] = [];

  // Call stack stores { returnIP, envStackDepth } so we can restore scope on RET
  private callStack: { returnIp: number; envDepth: number }[] = [];

  constructor(instructions: Instruction[]) {
    this.instructions = instructions;
    this.reset();
  }

  reset() {
    this.stack = [];
    this.envStack = [new Map()]; // global scope
    this.ip = 0;
    this.outputLog = [];
    this.callStack = [];
  }

  // ── Scope helpers ────────────────────────────────────────────

  private load(name: string): JsValue {
    for (let i = this.envStack.length - 1; i >= 0; i--) {
      if (this.envStack[i].has(name)) return this.envStack[i].get(name)!;
    }
    throw new Error(`Reference Error: '${name}' is not defined.`);
  }

  private store(name: string, value: JsValue): void {
    // If the variable exists in any outer scope, update it there (closure semantics)
    for (let i = this.envStack.length - 1; i >= 0; i--) {
      if (this.envStack[i].has(name)) {
        this.envStack[i].set(name, value);
        return;
      }
    }
    // Otherwise define in current scope
    this.envStack[this.envStack.length - 1].set(name, value);
  }

  private safePop(ctx: string): JsValue {
    if (this.stack.length === 0)
      throw new Error(`Stack Underflow in ${ctx}.`);
    return this.stack.pop()!;
  }

  private fmt(v: JsValue): string {
    if (v === null) return 'null';
    if (Array.isArray(v)) return '[' + v.map(this.fmt.bind(this)).join(', ') + ']';
    if (typeof v === 'object') return '{' + Object.entries(v).map(([k, val]) => `${k}: ${this.fmt(val)}`).join(', ') + '}';
    return String(v);
  }

  // ── Main execution loop ───────────────────────────────────────

  run(): string[] {
    const MAX_STEPS = 50000;
    let steps = 0;

    try {
      while (this.ip < this.instructions.length) {
        if (steps++ > MAX_STEPS)
          throw new Error('Execution limit exceeded (possible infinite loop).');

        const inst = this.instructions[this.ip];
        // Source line prefix for error messages
        const linePrefix = inst.sourceLine != null ? ` at line ${inst.sourceLine}` : '';

        switch (inst.op) {

          case OpCode.HALT:
            return this.outputLog;

          case OpCode.CONST:
            this.stack.push(inst.operand);
            break;

          case OpCode.LOAD:
            this.stack.push(this.load(inst.operand));
            break;

          case OpCode.DEFINE: {
            const val = this.safePop('DEFINE');
            this.envStack[this.envStack.length - 1].set(inst.operand, val);
            break;
          }

          case OpCode.STORE: {
            const val = this.safePop('STORE');
            this.store(inst.operand, val);
            break;
          }

          // ── Arithmetic ──

          case OpCode.ADD: {
            const b = this.safePop('ADD'); const a = this.safePop('ADD');
            this.stack.push((a as any) + (b as any));
            break;
          }
          case OpCode.SUB: {
            const b = this.safePop('SUB'); const a = this.safePop('SUB');
            this.stack.push((a as number) - (b as number));
            break;
          }
          case OpCode.MUL: {
            const b = this.safePop('MUL'); const a = this.safePop('MUL');
            this.stack.push((a as number) * (b as number));
            break;
          }
          case OpCode.DIV: {
            const b = this.safePop('DIV'); const a = this.safePop('DIV');
            if (b === 0) throw new Error(`Division by zero${linePrefix}.`);
            this.stack.push((a as number) / (b as number));
            break;
          }
          case 'MOD' as OpCode: {
            const b = this.safePop('MOD'); const a = this.safePop('MOD');
            this.stack.push((a as number) % (b as number));
            break;
          }

          // ── Comparisons ──

          case OpCode.EQ: {
            const b = this.safePop('EQ'); const a = this.safePop('EQ');
            this.stack.push(a == b ? 1 : 0); // eslint-disable-line
            break;
          }
          case OpCode.NEQ: {
            const b = this.safePop('NEQ'); const a = this.safePop('NEQ');
            this.stack.push(a != b ? 1 : 0); // eslint-disable-line
            break;
          }
          case OpCode.LT: {
            const b = this.safePop('LT'); const a = this.safePop('LT');
            this.stack.push((a as number) < (b as number) ? 1 : 0);
            break;
          }
          case OpCode.GT: {
            const b = this.safePop('GT'); const a = this.safePop('GT');
            this.stack.push((a as number) > (b as number) ? 1 : 0);
            break;
          }
          case OpCode.LTE: {
            const b = this.safePop('LTE'); const a = this.safePop('LTE');
            this.stack.push((a as number) <= (b as number) ? 1 : 0);
            break;
          }
          case OpCode.GTE: {
            const b = this.safePop('GTE'); const a = this.safePop('GTE');
            this.stack.push((a as number) >= (b as number) ? 1 : 0);
            break;
          }
          case 'NOT' as OpCode: {
            const a = this.safePop('NOT');
            this.stack.push(!a ? 1 : 0);
            break;
          }

          // ── I/O ──

          case OpCode.PRINT: {
            const count = typeof inst.operand === 'number' ? inst.operand : 1;
            const values: JsValue[] = [];
            for (let i = 0; i < count; i++) values.unshift(this.safePop('PRINT'));
            this.outputLog.push(values.map(this.fmt.bind(this)).join(' '));
            break;
          }

          // ── Control flow ──

          case OpCode.JMP:
            this.ip = inst.operand;
            continue;

          case OpCode.JMP_FALSE: {
            const cond = this.safePop('JMP_FALSE');
            if (!cond) { this.ip = inst.operand; continue; }
            break;
          }

          case 'JMP_TRUE' as OpCode: {
            const cond = this.safePop('JMP_TRUE');
            if (cond) { this.ip = inst.operand; continue; }
            break;
          }

          // ── Functions & scopes ──

          case OpCode.ENTER_SCOPE:
            this.envStack.push(new Map());
            break;

          case OpCode.EXIT_SCOPE:
            if (this.envStack.length > 1) this.envStack.pop();
            break;

          case OpCode.CALL:
            this.callStack.push({ returnIp: this.ip + 1, envDepth: this.envStack.length });
            // Push a new scope for the callee
            this.envStack.push(new Map());
            this.ip = inst.operand;
            continue;

          case OpCode.RET: {
            const retVal = this.safePop('RET');
            if (this.callStack.length === 0) {
              this.stack.push(retVal);
              return this.outputLog;
            }
            const frame = this.callStack.pop()!;
            // Restore scope to the depth it was before the call
            while (this.envStack.length > frame.envDepth) this.envStack.pop();
            this.stack.push(retVal);
            this.ip = frame.returnIp;
            continue;
          }

          // ── Arrays ──

          case OpCode.ARRAY_NEW: {
            const n = inst.operand as number;
            const arr: JsValue[] = new Array(n);
            for (let i = n - 1; i >= 0; i--) arr[i] = this.safePop('ARRAY_NEW');
            this.stack.push(arr);
            break;
          }

          case OpCode.ARRAY_GET: {
            const idx = this.safePop('ARRAY_GET') as number;
            const arr = this.safePop('ARRAY_GET');
            if (Array.isArray(arr)) {
              const v = arr[idx];
              this.stack.push(v !== undefined ? v : null);
            } else if (arr !== null && typeof arr === 'object') {
              // Allow numeric index on objects too
              const v = (arr as Record<string, JsValue>)[String(idx)];
              this.stack.push(v !== undefined ? v : null);
            } else {
              throw new Error(`Cannot index into non-array/object value${linePrefix}.`);
            }
            break;
          }

          case OpCode.ARRAY_SET: {
            const value = this.safePop('ARRAY_SET');
            const idx = this.safePop('ARRAY_SET') as number;
            const arr = this.safePop('ARRAY_SET');
            if (Array.isArray(arr)) {
              arr[idx] = value;
            } else {
              throw new Error(`Cannot set index on non-array value${linePrefix}.`);
            }
            break;
          }

          // ── Objects ──

          case OpCode.OBJ_NEW: {
            const n = inst.operand as number;
            const pairs: [string, JsValue][] = [];
            for (let i = 0; i < n; i++) {
              const val = this.safePop('OBJ_NEW');
              const key = this.safePop('OBJ_NEW') as string;
              pairs.unshift([key, val]);
            }
            const obj: Record<string, JsValue> = {};
            for (const [k, v] of pairs) obj[k] = v;
            this.stack.push(obj);
            break;
          }

          case OpCode.OBJ_GET: {
            const key = this.safePop('OBJ_GET') as string;
            const obj = this.safePop('OBJ_GET');

            if (obj !== null && typeof obj === 'object') {
              if (Array.isArray(obj) && key === 'length') {
                this.stack.push(obj.length);
              } else if (!Array.isArray(obj)) {
                const v = (obj as Record<string, JsValue>)[key];
                this.stack.push(v !== undefined ? v : null);
              } else {
                throw new Error(`Cannot read property '${key}' of array${linePrefix}.`);
              }
            } else if (typeof obj === 'string' && key === 'length') {
              this.stack.push(obj.length);
            } else {
              throw new Error(`Cannot read property '${key}' of ${this.fmt(obj)}${linePrefix}.`);
            }
            break;
          }

          case OpCode.OBJ_SET: {
            const value = this.safePop('OBJ_SET');
            const key = this.safePop('OBJ_SET') as string;
            const obj = this.safePop('OBJ_SET');
            if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
              (obj as Record<string, JsValue>)[key] = value;
            } else {
              throw new Error(`Cannot set property '${key}' on non-object${linePrefix}.`);
            }
            break;
          }

          default:
            throw new Error(`Illegal OpCode '${inst.op}'${linePrefix}`);
        }

        this.ip++;
      }
    } catch (e: any) {
      const inst = this.instructions[this.ip];
      const lineInfo = inst?.sourceLine != null ? ` [line ${inst.sourceLine}]` : '';
      this.outputLog.push(`❌ Runtime Error${lineInfo}: ${e.message}`);
    }

    return this.outputLog;
  }
}