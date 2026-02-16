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

  run(): string[] {
    const MAX_STEPS = 10000; // Prevent infinite loops
    let steps = 0;

    while (this.ip < this.instructions.length) {
      if (steps++ > MAX_STEPS) {
        this.outputLog.push("Runtime Error: Stack Overflow / Infinite Loop protection.");
        break;
      }

      const inst = this.instructions[this.ip];
      
      switch (inst.op) {
        case OpCode.HALT:
          return this.outputLog;

        case OpCode.CONST:
          this.stack.push(inst.operand);
          break;

        case OpCode.LOAD:
          if (typeof inst.operand === 'number') {
              this.stack.push(inst.operand); // It was a number literal
          } else if (!isNaN(parseFloat(inst.operand))) {
              this.stack.push(parseFloat(inst.operand)); // Parse number string
          } else {
              // Variable lookup
              if (this.env.has(inst.operand)) {
                  this.stack.push(this.env.get(inst.operand));
              } else {
                  this.outputLog.push(`Runtime Error: Undefined variable ${inst.operand}`);
                  return this.outputLog;
              }
          }
          break;

        case OpCode.STORE:
          const val = this.stack.pop();
          this.env.set(inst.operand, val);
          break;

        case OpCode.ADD: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(a + b);
          break;
        }
        case OpCode.SUB: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(a - b);
          break;
        }
        case OpCode.MUL: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(a * b);
          break;
        }
        case OpCode.DIV: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(a / b);
          break;
        }
        case OpCode.EQ: {
            const b = this.stack.pop();
            const a = this.stack.pop();
            this.stack.push(a === b ? 1 : 0);
            break;
        }
        case OpCode.LT: {
            const b = this.stack.pop();
            const a = this.stack.pop();
            this.stack.push(a < b ? 1 : 0);
            break;
        }
        case OpCode.GT: {
            const b = this.stack.pop();
            const a = this.stack.pop();
            this.stack.push(a > b ? 1 : 0);
            break;
        }

        case OpCode.PRINT:
          const output = this.stack.pop();
          this.outputLog.push(String(output));
          break;

        case OpCode.JMP:
          this.ip = inst.operand;
          continue; // Skip ip++

        case OpCode.JMP_FALSE:
          const condition = this.stack.pop();
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
            if(this.callStack.length === 0) {
                // Return from main (treat as halt)
                return this.outputLog;
            }
            this.ip = this.callStack.pop()!;
            continue;
      }

      this.ip++;
    }

    return this.outputLog;
  }
}
