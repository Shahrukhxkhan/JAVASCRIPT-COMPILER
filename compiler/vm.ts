import { Instruction } from '../types';
import { OpCode } from '../constants';

export class VM {
  private stack: any[] = [];
  private env: Map<string, any> = new Map();
  private ip: number = 0; // Instruction Pointer
  private instructions: Instruction[] = [];
  private outputLog: string[] = [];
  private callStack: number[] = []; // Stores return IPs

  private labels: Map<string, number> = new Map();

  constructor(instructions: Instruction[], labels?: Map<string, number>) {
    this.instructions = instructions;
    this.labels = labels || new Map();
    this.reset();
  }

  private exceptionStack: number[] = [];

  reset() {
    this.stack = [];
    this.env = new Map();
    this.ip = 0;
    this.outputLog = [];
    this.callStack = [];
    this.exceptionStack = [];

    // Built-ins
    this.env.set('print', (...args: any[]) => {
      this.outputLog.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    });
    this.env.set('console', {
      log: (...args: any[]) => {
        this.outputLog.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
      }
    });
    this.env.set('Symbol', Symbol);
  }

  private throwRuntimeError(inst: Instruction | undefined, message: string): never {
    let loc = '';
    if (inst && inst.line !== undefined) {
      loc = `[Line ${inst.line}`;
      if (inst.column !== undefined) {
        loc += `:${inst.column}`;
      }
      loc += `] `;
    }
    throw new Error(`${loc}Runtime Error: ${message}`);
  }

  private safePop(inst: Instruction | undefined, context: string): any {
    if (this.stack.length === 0) {
      this.throwRuntimeError(inst, `Stack Underflow during ${context}. The stack is empty.`);
    }
    return this.stack.pop();
  }

  run(): string[] {
    const MAX_STEPS = 15000;
    let steps = 0;

    try {
      while (this.ip < this.instructions.length) {
        if (steps++ > MAX_STEPS) {
          this.throwRuntimeError(undefined, "Execution limit exceeded. Possible infinite loop detected.");
        }

        const inst = this.instructions[this.ip];
        
        switch (inst.op) {
          case OpCode.HALT:
            return this.outputLog;

          case OpCode.CONST:
            this.stack.push(inst.operand);
            break;

          case OpCode.LOAD:
            if (this.env.has(inst.operand)) {
                this.stack.push(this.env.get(inst.operand));
            } else {
                this.throwRuntimeError(inst, `Reference Error - Identifier '${inst.operand}' is not defined.`);
            }
            break;

          case OpCode.STORE:
            const val = this.safePop(inst, 'assignment (STORE)');
            this.env.set(inst.operand, val);
            break;

          case OpCode.ADD: {
            const b = this.safePop(inst, 'addition (ADD)');
            const a = this.safePop(inst, 'addition (ADD)');
            this.stack.push(a + b);
            break;
          }
          case OpCode.SUB: {
            const b = this.safePop(inst, 'subtraction (SUB)');
            const a = this.safePop(inst, 'subtraction (SUB)');
            this.stack.push(a - b);
            break;
          }
          case OpCode.MUL: {
            const b = this.safePop(inst, 'multiplication (MUL)');
            const a = this.safePop(inst, 'multiplication (MUL)');
            this.stack.push(a * b);
            break;
          }
          case OpCode.DIV: {
            const b = this.safePop(inst, 'division (DIV)');
            const a = this.safePop(inst, 'division (DIV)');
            if (b === 0) this.throwRuntimeError(inst, "Division by zero.");
            this.stack.push(a / b);
            break;
          }
          case OpCode.EQ: {
              const b = this.safePop(inst, 'equality check (EQ)');
              const a = this.safePop(inst, 'equality check (EQ)');
              this.stack.push(a == b);
              break;
          }
          case OpCode.NEQ: {
              const b = this.safePop(inst, 'inequality check (NEQ)');
              const a = this.safePop(inst, 'inequality check (NEQ)');
              this.stack.push(a != b);
              break;
          }
          case OpCode.EQ_STRICT: {
              const b = this.safePop(inst, 'strict equality check (EQ_STRICT)');
              const a = this.safePop(inst, 'strict equality check (EQ_STRICT)');
              this.stack.push(a === b);
              break;
          }
          case OpCode.NEQ_STRICT: {
              const b = this.safePop(inst, 'strict inequality check (NEQ_STRICT)');
              const a = this.safePop(inst, 'strict inequality check (NEQ_STRICT)');
              this.stack.push(a !== b);
              break;
          }
          case OpCode.LT: {
              const b = this.safePop(inst, 'less-than check (LT)');
              const a = this.safePop(inst, 'less-than check (LT)');
              this.stack.push(a < b);
              break;
          }
          case OpCode.GT: {
              const b = this.safePop(inst, 'greater-than check (GT)');
              const a = this.safePop(inst, 'greater-than check (GT)');
              this.stack.push(a > b);
              break;
          }
          case OpCode.LTE: {
              const b = this.safePop(inst, 'less-than-or-equal check (LTE)');
              const a = this.safePop(inst, 'less-than-or-equal check (LTE)');
              this.stack.push(a <= b);
              break;
          }
          case OpCode.GTE: {
              const b = this.safePop(inst, 'greater-than-or-equal check (GTE)');
              const a = this.safePop(inst, 'greater-than-or-equal check (GTE)');
              this.stack.push(a >= b);
              break;
          }
          case OpCode.AND: {
              const b = this.safePop(inst, 'logical AND (AND)');
              const a = this.safePop(inst, 'logical AND (AND)');
              this.stack.push(a && b);
              break;
          }
          case OpCode.OR: {
              const b = this.safePop(inst, 'logical OR (OR)');
              const a = this.safePop(inst, 'logical OR (OR)');
              this.stack.push(a || b);
              break;
          }

          case OpCode.ARRAY: {
            const count = inst.operand;
            const arr = [];
            for (let i = 0; i < count; i++) {
              arr.unshift(this.safePop(inst, 'array creation'));
            }
            this.stack.push(arr);
            break;
          }

          case OpCode.OBJECT: {
            const count = inst.operand;
            const obj: any = {};
            for (let i = 0; i < count; i++) {
              const value = this.safePop(inst, 'object creation (value)');
              const key = this.safePop(inst, 'object creation (key)');
              obj[key] = value;
            }
            this.stack.push(obj);
            break;
          }

          case OpCode.GET_PROP: {
            const key = this.safePop(inst, 'property access (key)');
            const obj = this.safePop(inst, 'property access (obj)');
            if (obj === null || obj === undefined) this.throwRuntimeError(inst, `Cannot read property '${key}' of ${obj}`);
            this.stack.push(obj[key]);
            break;
          }

          case OpCode.SET_PROP: {
            const value = this.safePop(inst, 'property assignment (value)');
            const key = this.safePop(inst, 'property assignment (key)');
            const obj = this.safePop(inst, 'property assignment (obj)');
            if (obj === null || obj === undefined) this.throwRuntimeError(inst, `Cannot set property '${key}' of ${obj}`);
            obj[key] = value;
            break;
          }

          case OpCode.TRY_START:
            this.exceptionStack.push(inst.operand);
            break;

          case OpCode.TRY_END:
            this.exceptionStack.pop();
            break;

          case OpCode.THROW: {
            const error = this.safePop(inst, 'throw');
            if (this.exceptionStack.length === 0) {
              this.throwRuntimeError(inst, `Uncaught Exception: ${error}`);
            }
            this.ip = this.exceptionStack.pop()!;
            this.stack.push(error); // Pass error to catch block
            continue;
          }

          case OpCode.AWAIT:
            // Simulated await
            const promise = this.safePop(inst, 'await');
            this.stack.push(promise); 
            break;

          case OpCode.EXTENDS: {
            const parent = this.safePop(inst, 'extends (parent)');
            const child = this.safePop(inst, 'extends (child)');
            if (typeof parent === 'object' && parent !== null && typeof child === 'object' && child !== null) {
              Object.assign(child, parent);
            }
            break;
          }

          case OpCode.PRINT: {
            const argCount = inst.operand !== undefined ? inst.operand : 1;
            const outputs = [];
            for (let i = 0; i < argCount; i++) {
              outputs.unshift(this.safePop(inst, 'print (PRINT)'));
            }
            const formatted = outputs.map(o => typeof o === 'object' ? JSON.stringify(o) : String(o)).join(' ');
            this.outputLog.push(formatted);
            break;
          }

          case OpCode.JMP:
            this.ip = inst.operand;
            continue;

          case OpCode.JMP_FALSE:
            const conditionFalse = this.safePop(inst, 'conditional jump (JMP_FALSE)');
            if (!conditionFalse) {
              this.ip = inst.operand;
              continue;
            }
            break;

          case OpCode.JMP_TRUE:
            const conditionTrue = this.safePop(inst, 'conditional jump (JMP_TRUE)');
            if (conditionTrue) {
              this.ip = inst.operand;
              continue;
            }
            break;

          case OpCode.CALL: {
            this.callStack.push(this.ip + 1);
            let target = inst.operand;
            
            // Resolve target
            if (typeof target === 'string') {
              if (this.env.has(target)) {
                target = this.env.get(target);
              }
            }
            
            if (typeof target === 'string') {
              if (this.labels.has(target)) {
                target = this.labels.get(target);
              }
            }

            if (typeof target === 'function') {
                // It's a JS built-in function
                const argCount = inst.argCount || 0;
                const args = [];
                for (let i = 0; i < argCount; i++) {
                    args.unshift(this.safePop(inst, 'function call arguments'));
                }
                const result = target(...args);
                this.stack.push(result);
                // Pop the return address since we didn't actually jump
                this.callStack.pop();
                break;
            }

            if (typeof target !== 'number') {
              this.throwRuntimeError(inst, `'${inst.operand}' is not a callable function (resolved to ${target}).`);
            }
            
            this.ip = target;
            continue;
          }

          case OpCode.RET:
              if (this.callStack.length === 0) {
                  return this.outputLog;
              }
              this.ip = this.callStack.pop()!;
              continue;

          default:
            this.throwRuntimeError(inst, `Illegal OpCode '${inst.op}' at address ${this.ip}`);
        }

        this.ip++;
      }
    } catch (e: any) {
      if (this.exceptionStack.length > 0) {
        this.ip = this.exceptionStack.pop()!;
        this.stack.push(e.message);
        return this.run(); // Continue from catch
      }
      this.outputLog.push(e.message);
    }

    return this.outputLog;
  }
}