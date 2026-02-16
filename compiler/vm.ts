import { Instruction } from '../types';
import { OpCode } from '../constants';

export class VM {
  private stack: any[] = [];
  private env: Map<string, any> = new Map();
  private ip: number = 0; // Instruction Pointer
  private instructions: Instruction[] = [];
  private outputLog: string[] = [];
  private callStack: number[] = []; // Stores return IPs

  constructor(instructions: Instruction[]) {
    this.instructions = instructions;
    this.reset();
  }

  reset() {
    this.stack = [];
    this.env = new Map();
    this.ip = 0;
    this.outputLog = [];
    this.callStack = [];
  }

  private safePop(context: string): any {
    if (this.stack.length === 0) {
      throw new Error(`Runtime Error: Stack Underflow during ${context}. The stack is empty.`);
    }
    return this.stack.pop();
  }

  run(): string[] {
    const MAX_STEPS = 15000;
    let steps = 0;

    try {
      while (this.ip < this.instructions.length) {
        if (steps++ > MAX_STEPS) {
          throw new Error("Runtime Error: Execution limit exceeded. Possible infinite loop detected.");
        }

        const inst = this.instructions[this.ip];
        
        switch (inst.op) {
          case OpCode.HALT:
            return this.outputLog;

          case OpCode.CONST:
            // Operand is already pre-parsed (number or string) in the codegen phase
            this.stack.push(inst.operand);
            break;

          case OpCode.LOAD:
            // LOAD now only looks up identifiers in the environment
            if (this.env.has(inst.operand)) {
                this.stack.push(this.env.get(inst.operand));
            } else {
                throw new Error(`Runtime Error: Reference Error - Identifier '${inst.operand}' is not defined.`);
            }
            break;

          case OpCode.STORE:
            const val = this.safePop('assignment (STORE)');
            this.env.set(inst.operand, val);
            break;

          case OpCode.ADD: {
            const b = this.safePop('addition (ADD)');
            const a = this.safePop('addition (ADD)');
            this.stack.push(a + b);
            break;
          }
          case OpCode.SUB: {
            const b = this.safePop('subtraction (SUB)');
            const a = this.safePop('subtraction (SUB)');
            this.stack.push(a - b);
            break;
          }
          case OpCode.MUL: {
            const b = this.safePop('multiplication (MUL)');
            const a = this.safePop('multiplication (MUL)');
            this.stack.push(a * b);
            break;
          }
          case OpCode.DIV: {
            const b = this.safePop('division (DIV)');
            const a = this.safePop('division (DIV)');
            if (b === 0) {
              throw new Error("Runtime Error: Division by zero.");
            }
            this.stack.push(a / b);
            break;
          }
          case OpCode.EQ: {
              const b = this.safePop('equality check (EQ)');
              const a = this.safePop('equality check (EQ)');
              this.stack.push(a === b ? 1 : 0);
              break;
          }
          case OpCode.LT: {
              const b = this.safePop('less-than check (LT)');
              const a = this.safePop('less-than check (LT)');
              this.stack.push(a < b ? 1 : 0);
              break;
          }
          case OpCode.GT: {
              const b = this.safePop('greater-than check (GT)');
              const a = this.safePop('greater-than check (GT)');
              this.stack.push(a > b ? 1 : 0);
              break;
          }

          case OpCode.PRINT:
            const output = this.safePop('print (PRINT)');
            this.outputLog.push(String(output));
            break;

          case OpCode.JMP:
            this.ip = inst.operand;
            continue;

          case OpCode.JMP_FALSE:
            const condition = this.safePop('conditional jump (JMP_FALSE)');
            if (!condition) {
              this.ip = inst.operand;
              continue;
            }
            break;

          case OpCode.CALL:
            this.callStack.push(this.ip + 1);
            this.ip = inst.operand;
            continue;

          case OpCode.RET:
              if (this.callStack.length === 0) {
                  return this.outputLog;
              }
              this.ip = this.callStack.pop()!;
              continue;

          default:
            throw new Error(`Runtime Error: Illegal OpCode '${inst.op}' at address ${this.ip}`);
        }

        this.ip++;
      }
    } catch (e: any) {
      this.outputLog.push(e.message);
    }

    return this.outputLog;
  }
}