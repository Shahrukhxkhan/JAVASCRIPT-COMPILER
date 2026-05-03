import { Instruction } from '../types';
import { OpCode } from '../constants';

class Environment {
  public vars = new Map<string, any>();
  public consts = new Set<string>();
  constructor(public parent: Environment | null = null) {}

  get(name: string): any {
    if (this.vars.has(name)) return this.vars.get(name);
    if (this.parent) return this.parent.get(name);
    throw new Error(`ReferenceError: ${name} is not defined`);
  }

  set(name: string, value: any) {
    if (this.vars.has(name)) {
      if (this.consts.has(name)) throw new Error(`TypeError: Assignment to constant variable`);
      this.vars.set(name, value);
      return;
    }
    if (/^t[0-9]+(_inline_[0-9]+)?$/.test(name)) {
      this.define(name, value);
      return;
    }
    if (this.parent) {
      this.parent.set(name, value);
      return;
    }
    
    throw new Error(`ReferenceError: ${name} is not defined`);
  }

  define(name: string, value: any, isConst: boolean = false) {
    this.vars.set(name, value);
    if (isConst) this.consts.add(name);
  }
  
  has(name: string): boolean {
    if (this.vars.has(name)) return true;
    if (this.parent) return this.parent.has(name);
    return false;
  }
}

export class VM {
  private stack: any[] = [];
  private env: Environment = new Environment();
  private ip: number = 0; // Instruction Pointer
  private instructions: Instruction[] = [];
  private outputLog: string[] = [];
  private callStack: number[] = []; // Stores return IPs
  private envStack: Environment[] = []; // Stores environments for calls
  private argCountStack: number[] = []; // Stores number of arguments passed in current call
  private currentArgCount: number = 0;

  private labels: Map<string, number> = new Map();

  constructor(instructions: Instruction[], labels?: Map<string, number>) {
    this.instructions = instructions;
    this.labels = labels || new Map();
    this.reset();
  }

  private exceptionStack: { catchIp: number | null, finallyIp: number | null, isUnwinding?: boolean, error?: any }[] = [];

  reset() {
    this.stack = [];
    this.env = new Environment();
    this.ip = 0;
    this.outputLog = [];
    this.callStack = [];
    this.envStack = [];
    this.argCountStack = [];
    this.currentArgCount = 0;
    this.exceptionStack = [];

    // Built-ins
    this.env.define('print', (...args: any[]) => {
      this.outputLog.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    });
    this.env.define('console', {
      log: (...args: any[]) => {
        this.outputLog.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
      }
    });
    this.env.define('Object', Object, true);
    this.env.define('Array', Array, true);
    this.env.define('String', String, true);
    this.env.define('Number', Number, true);
    this.env.define('Boolean', Boolean, true);
    this.env.define('Symbol', Symbol);
    this.env.define('Error', Error, true);
    this.env.define('TypeError', TypeError, true);
    this.env.define('ReferenceError', ReferenceError, true);
    this.env.define('SyntaxError', SyntaxError, true);
    this.env.define('RangeError', RangeError, true);
    this.env.define('URIError', URIError, true);
    this.env.define('EvalError', EvalError, true);
  }

  private buildStackTrace(inst: Instruction | undefined): string {
    const trace: string[] = [];
    // Current instruction (we don't have func names in VM, so fallback to anonymous)
    const getFuncForIp = (targetIp: number) => {
        return 'anonymous';
    };
    
    // Format a single frame
    const formatFrame = (targetIp: number, instruction: Instruction | undefined) => {
        const funcName = targetIp === this.instructions.length ? 'main' : getFuncForIp(targetIp);
        let loc = 'unknown';
        if (instruction && instruction.line !== undefined) {
             loc = `main.js:${instruction.line}`;
             // if (instruction.column) loc += `:${instruction.column}`;
        }
        return `    at ${funcName === 'anonymous' ? 'main' : funcName} (${loc})`;
    };

    trace.push(formatFrame(this.ip, inst));
    
    // Add call stack frames
    for (let i = this.callStack.length - 1; i >= 0; i--) {
        const retIp = this.callStack[i];
        if (retIp >= 0) {
            const callInst = this.instructions[retIp - 1]; // The CALL instruction
            trace.push(formatFrame(retIp - 1, callInst));
        }
    }
    
    return trace.join('\n');
  }

  private throwRuntimeError(inst: Instruction | undefined, message: string): never {
    let ErrorClass: any = Error;
    let actualMessage = message;
    
    const colonIndex = message.indexOf(':');
    if (colonIndex > -1) {
        const prefix = message.slice(0, colonIndex).trim();
        if (prefix === 'TypeError') ErrorClass = TypeError;
        else if (prefix === 'ReferenceError' || prefix === 'Reference Error') ErrorClass = ReferenceError;
        else if (prefix === 'SyntaxError') ErrorClass = SyntaxError;
        else if (prefix === 'RangeError') ErrorClass = RangeError;
        else if (prefix === 'URIError') ErrorClass = URIError;
        else if (prefix === 'EvalError') ErrorClass = EvalError;
        
        if (ErrorClass !== Error) {
            actualMessage = message.slice(colonIndex + 1).trim();
        }
    }

    const err = new ErrorClass(actualMessage);
    err.stack = `${err.name}: ${actualMessage}\n${this.buildStackTrace(inst)}`;
    throw err;
  }

  private safePop(inst: Instruction | undefined, context: string): any {
    if (this.stack.length === 0) {
      this.throwRuntimeError(inst, `Stack Underflow during ${context}. The stack is empty.`);
    }
    return this.stack.pop();
  }

  runSync(): string[] {
    const gen = this.runGen();
    let res;
    try {
        res = gen.next();
        while (!res.done) {
            if (res.value && typeof res.value.then === 'function') {
                throw new Error("SyntaxError: await is only valid in async functions");
            }
            res = gen.next(res.value);
        }
    } catch (e) {
        return this.handleRunError(e, () => this.runSync());
    }
    return res.value;
  }

  async runAsync(): Promise<string[]> {
    const gen = this.runGen();
    let res;
    try {
        res = gen.next();
        while (!res.done) {
            try {
                const val = await res.value;
                res = gen.next(val);
            } catch (innerE) {
                res = gen.throw(innerE);
            }
        }
    } catch (e) {
        return this.handleRunError(e, () => this.runAsync());
    }
    return res.value;
  }

  private handleRunError(e: any, retryFn: () => any): any {
      if (this.exceptionStack.length > 0) {
        const handler = this.exceptionStack.pop()!;
        
        if (handler.catchIp !== null) {
            this.ip = handler.catchIp;
            this.exceptionStack.push({ catchIp: null, finallyIp: handler.finallyIp, isUnwinding: false });
            this.stack.push(e); 
            return retryFn();
        } else if (handler.finallyIp !== null) {
            this.ip = handler.finallyIp;
            this.exceptionStack.push({ catchIp: null, finallyIp: null, isUnwinding: true, error: e });
            return retryFn();
        } else {
            throw e;
        }
      }
      
      const errMessage = e && e.stack ? e.stack : (e && e.message ? e.message : String(e));
      
      // If we are executing inside a sub-VM (callStack has -1), we must re-throw to reject 
      // the returned Promise (if async) or propagate the JS error to the caller hook!
      if (this.callStack.length > 0 && this.callStack[0] === -1) {
          throw e;
      }
      
      this.outputLog.push(`Uncaught ${errMessage}`);
      return this.outputLog;
  }

  *runGen(): IterableIterator<any> {
    const MAX_STEPS = 15000;
    let steps = 0;

    // We no longer try/catch here, it's handled by outer runners
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
            if (inst.operand === 'super' && !this.env.has('super')) {
                this.throwRuntimeError(inst, `SyntaxError: 'super' keyword unexpected here`);
            }
            if (this.env.has(inst.operand)) {
                this.stack.push(this.env.get(inst.operand));
            } else {
                this.throwRuntimeError(inst, `ReferenceError: ${inst.operand} is not defined`);
            }
            break;

          case OpCode.STORE:
            try {
                const val = this.safePop(inst, 'assignment (STORE)');
                this.env.set(inst.operand, val);
            } catch (e: any) {
                this.throwRuntimeError(inst, e.message);
            }
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
          case OpCode.NULLISH: {
              const b = this.safePop(inst, 'nullish coalescing (NULLISH)');
              const a = this.safePop(inst, 'nullish coalescing (NULLISH)');
              this.stack.push(a ?? b);
              break;
          }
          case OpCode.IN: {
              const b = this.safePop(inst, 'in (IN RHS)');
              const a = this.safePop(inst, 'in (IN LHS)');
              if (typeof b !== 'object' || b === null) this.throwRuntimeError(inst, 'TypeError: right-hand side of in should be an object');
              this.stack.push(a in b);
              break;
          }
          case OpCode.INSTANCEOF: {
              const b = this.safePop(inst, 'instanceof (INSTANCEOF RHS)');
              const a = this.safePop(inst, 'instanceof (INSTANCEOF LHS)');
              if (typeof b !== 'function') this.throwRuntimeError(inst, 'TypeError: Right-hand side of instanceof is not callable');
              this.stack.push(a instanceof b);
              break;
          }
          case OpCode.TYPEOF: {
              const a = this.safePop(inst, 'typeof (TYPEOF)');
              // need to unwrap closure to report 'function'
              if (a && typeof a === 'object' && a.type === 'closure') {
                 this.stack.push('function');
              } else {
                 this.stack.push(typeof a);
              }
              break;
          }
          case OpCode.NOT: {
              const a = this.safePop(inst, 'logical NOT (NOT)');
              this.stack.push(!a);
              break;
          }
          case OpCode.NEG: {
              const a = this.safePop(inst, 'unary negation (NEG)');
              this.stack.push(-a);
              break;
          }

          case OpCode.ITER_KEYS: {
              const a = this.safePop(inst, 'iter keys target');
              if (a === null || a === undefined) {
                  this.stack.push([]);
              } else {
                  const keys = [];
                  for (let k in a) {
                      keys.push(k);
                  }
                  this.stack.push(keys);
              }
              break;
          }
          case OpCode.ITER_VALUES: {
              const a = this.safePop(inst, 'iter values target');
              if (a === null || a === undefined) {
                  this.stack.push([]);
              } else if (typeof a[Symbol.iterator] === 'function') {
                  this.stack.push(Array.from(a));
              } else {
                  this.throwRuntimeError(inst, 'TypeError: Target is not iterable');
              }
              break;
          }

          case OpCode.ARRAY: {
            const typesStr = (inst.operand as string) || '';
            const types = typesStr.split(',').filter(t => t !== '');
            const arr = [];
            for (let i = types.length - 1; i >= 0; i--) {
              const val = this.safePop(inst, 'array creation');
              if (types[i] === 'spread') {
                  if (Array.isArray(val)) {
                      arr.unshift(...val);
                  } else {
                      this.throwRuntimeError(inst, 'TypeError: Spread element is not iterable');
                  }
              } else {
                  arr.unshift(val);
              }
            }
            this.stack.push(arr);
            break;
          }

          case OpCode.OBJECT: {
            const typesStr = (inst.operand as string) || '';
            const types = typesStr.split(',').filter(t => t !== '');
            // We pop them backwards since they were pushed sequentially
            const poppedPairs = [];
            for (let i = types.length - 1; i >= 0; i--) {
              const value = this.safePop(inst, 'object creation (value)');
              let key = null;
              if (types[i] !== 'spread') {
                  key = this.safePop(inst, 'object creation (key)');
              }
              poppedPairs.unshift({ type: types[i], key, value });
            }
            
            const obj: any = {};
            for (const pair of poppedPairs) {
                if (pair.type === 'spread') {
                    if (pair.value !== null && pair.value !== undefined) {
                        for (const k in pair.value) {
                            if (Object.prototype.hasOwnProperty.call(pair.value, k)) {
                                obj[k] = pair.value[k];
                            }
                        }
                    }
                } else {
                    obj[pair.key] = pair.value;
                }
            }
            this.stack.push(obj);
            break;
          }

          case OpCode.ARRAY_REST: {
            const index = this.safePop(inst, 'array rest index');
            const arr = this.safePop(inst, 'array rest source');
            if (!Array.isArray(arr)) this.throwRuntimeError(inst, 'TypeError: Target is not iterable');
            this.stack.push(arr.slice(index));
            break;
          }

          case OpCode.OBJECT_REST: {
            const keysToExcludeStr = this.safePop(inst, 'object rest excluded keys');
            const obj = this.safePop(inst, 'object rest source');
            if (obj === null || obj === undefined) this.throwRuntimeError(inst, 'TypeError: Cannot destructure undefined');
            const keysToExclude = new Set(keysToExcludeStr ? keysToExcludeStr.split(',') : []);
            const restObj: any = {};
            for (const k in obj) {
              if (Object.prototype.hasOwnProperty.call(obj, k) && !keysToExclude.has(k)) {
                restObj[k] = obj[k];
              }
            }
            this.stack.push(restObj);
            break;
          }

          case OpCode.GET_PROP: {
            const key = this.safePop(inst, 'property access (key)');
            const obj = this.safePop(inst, 'property access (obj)');
            if (obj === null || obj === undefined) this.throwRuntimeError(inst, `TypeError: Cannot read properties of ${obj} (reading '${key}')`);
            let val = obj[key];
            if (typeof val === 'function') {
                val = val.bind(obj);
            }
            this.stack.push(val);
            break;
          }

          case OpCode.GET_PROP_OPTIONAL: {
            const key = this.safePop(inst, 'optional property access (key)');
            const obj = this.safePop(inst, 'optional property access (obj)');
            
            if (obj === null || obj === undefined) {
                this.stack.push(undefined);
            } else {
                let val = obj[key];
                if (typeof val === 'function') {
                    val = val.bind(obj);
                }
                this.stack.push(val);
            }
            break;
          }

          case OpCode.SET_PROP: {
            const value = this.safePop(inst, 'property assignment (value)');
            const key = this.safePop(inst, 'property assignment (key)');
            const obj = this.safePop(inst, 'property assignment (obj)');
            if (obj === null || obj === undefined) this.throwRuntimeError(inst, `TypeError: Cannot set properties of ${obj} (setting '${key}')`);
            obj[key] = value;
            break;
          }

          case OpCode.TRY_START: {
            const handlers = inst.operand as { catchLabel: number | null, finallyLabel: number | null };
            this.exceptionStack.push({ catchIp: handlers.catchLabel, finallyIp: handlers.finallyLabel });
            break;
          }

          case OpCode.TRY_END:
            this.exceptionStack.pop();
            break;

          case OpCode.THROW: {
            const error = this.safePop(inst, 'throw');
            // We throw the error internally so the VM catch block handles it
            throw error;
          }

          case OpCode.FINALLY_END: {
            if (this.exceptionStack.length > 0) {
              const currentHandler = this.exceptionStack[this.exceptionStack.length - 1];
              if (currentHandler.isUnwinding) {
                const error = currentHandler.error;
                this.exceptionStack.pop();
                throw error; // Let the VM catch block handle propagating it further
              }
            }
            break;
          }

          case OpCode.AWAIT: {
            const promise = this.safePop(inst, 'await');
            if (promise && typeof promise.then === 'function') {
                const result = yield promise;
                this.stack.push(result);
            } else {
                this.stack.push(promise);
            }
            break;
          }

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

          case OpCode.DECLARE: {
            const val = this.safePop(inst, 'declare');
            const { name, kind } = inst.operand;
            this.env.define(name, val, kind === 'const');
            break;
          }

          case OpCode.CLOSURE: {
            const { label, isArrow, isAsync, isGenerator } = inst.operand as any;
            this.stack.push({ type: 'closure', label, env: this.env, isArrow, isAsync, isGenerator });
            break;
          }

          case OpCode.TEMPLATE: {
            const count = typeof inst.operand === 'number' ? inst.operand : parseInt(inst.operand || '0');
            const parts = [];
            for (let i = 0; i < count; i++) {
              parts.push(this.safePop(inst, 'template literal part'));
            }
            parts.reverse();
            this.stack.push(parts.join(''));
            break;
          }

          case OpCode.REST_ARG: {
            // arg1 = original parameter index
            // arg2 = total named parameters
            // currentArgCount is the total provided arguments
            const paramIndex = parseInt(inst.operand.index || '0');
            const totalParams = parseInt(inst.operand.total || '0');
            
            const expectedArgsBeforeRest = paramIndex;
            const restArgsCount = Math.max(0, this.currentArgCount - expectedArgsBeforeRest);
            
            const restArr = [];
            for (let i = 0; i < restArgsCount; i++) {
              restArr.push(this.safePop(inst, 'rest arg'));
            }
            // The rest array should be in the correct order
            // If they were popped from stack, they were popped in reverse order of them being pushed,
            // so we'd normally unshift if the last parameter was at the top.
            // Wait, top of stack is the LAST argument passed.
            // So popping them yields: argN, argN-1, etc.
            // Pushing them to restArr makes [argN, argN-1]
            // Reversing makes it [argN-1, argN], which is correct.
            restArr.reverse();
            this.env.define(inst.operand.name, restArr);
            break;
          }

          case OpCode.NEW: {
            const classObj = this.safePop(inst, 'new class target');
            
            const typesStr = (inst.argCount as string) || '';
            const types = typesStr.split(',').filter(t => t !== '');
            const poppedArgs = [];
            for (let i = types.length - 1; i >= 0; i--) {
                const val = this.safePop(inst, 'new expression arguments');
                poppedArgs.unshift({ type: types[i], val });
            }
            
            const args: any[] = [];
            for (const item of poppedArgs) {
                if (item.type === 'spread') {
                    if (Array.isArray(item.val)) {
                        args.push(...item.val);
                    }
                } else {
                    args.push(item.val);
                }
            }

            if (typeof classObj === 'function') {
                const result = new classObj(...args);
                this.stack.push(result);
                break;
            }

            if (typeof classObj !== 'object' || classObj === null) {
                this.throwRuntimeError(inst, 'TypeError: Target is not a constructor');
            }

            const instance = Object.create(classObj);
            
            // If classObj has a constructor method, call it!
            if (typeof classObj.constructor === 'function') {
                classObj.constructor.apply(instance, args);
            } else if (typeof classObj.constructor === 'object' && classObj.constructor.type === 'closure') {
                // Execute VM closure as constructor
                const target = classObj.constructor;
                const finalArgCount = args.length;
                if (this.callStack.length >= 1000) {
                  this.throwRuntimeError(inst, `RangeError: Maximum call stack size exceeded`);
                }
                this.callStack.push(this.ip + 1);
                for (const a of args) {
                  this.stack.push(a);
                }
                this.envStack.push(this.env);
                this.argCountStack.push(this.currentArgCount);
                this.currentArgCount = finalArgCount;
                this.env = new Environment(target.env); 
                this.env.define('this', instance, false);
                this.ip = this.labels.get(target.label)!;
                // VM stack expects constructors to implicitly/explicitly return this if object,
                // but since our compiler isn't rewriting returns yet, 
                // we'll push instance to stack right now, and let `new` evaluate to instance
                // Wait, if it jumps to constructor, the `NEW` instruction finishes and we jump.
                // Upon RET, it returns a value.
                // This means 'new' acts exactly like a CALL except it returns `instance`.
                // Actually, if we push it to callstack, when the constructor RETs, it pushes the returned value.
                // We'd have to intercept the RET to ensure `instance` is kept, or just inject instructions.
                // It's easier to run it synchronously on a new VM instance!
                const cbVm = new VM(this.instructions, this.labels);
                cbVm.env = new Environment(target.env);
                cbVm.env.define('this', instance, false);
                cbVm.outputLog = this.outputLog; 
                cbVm.ip = this.labels.get(target.label)!;
                cbVm.callStack = [-1]; 
                cbVm.currentArgCount = args.length;
                for (let j = 0; j < args.length; j++) {
                    cbVm.stack.push(args[j]);
                }
                cbVm.runSync();
                this.callStack.pop(); // Remove the +1 injected
            }
            this.stack.push(instance);
            break;
          }

          case OpCode.CALL: {
            if (this.callStack.length >= 1000) {
              this.throwRuntimeError(inst, `RangeError: Maximum call stack size exceeded`);
            }
            this.callStack.push(this.ip + 1);
            let target = inst.operand;
            
            const ctx = this.safePop(inst, 'call context (this)');
            
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
            
            const typesStr = (inst.argCount as string) || '';
            const types = typesStr.split(',').filter(t => t !== '');
            const poppedArgs = [];
            for (let i = types.length - 1; i >= 0; i--) {
                const val = this.safePop(inst, 'function call arguments');
                poppedArgs.unshift({ type: types[i], val });
            }
            
            let finalArgCount = 0;
            // Push arguments back to stack properly expanded for internal functions
            // Or just collect them for native functions
            const args: any[] = [];
            for (const item of poppedArgs) {
                if (item.type === 'spread') {
                    if (Array.isArray(item.val)) {
                        args.push(...item.val);
                        finalArgCount += item.val.length;
                    } else {
                        this.throwRuntimeError(inst, 'TypeError: Spread element is not iterable');
                    }
                } else {
                    args.push(item.val);
                    finalArgCount += 1;
                }
            }

            if (target && typeof target === 'object' && target.type === 'closure') {
              if (target.isAsync) {
                  const cbVm = new VM(this.instructions, this.labels);
                  cbVm.env = new Environment(target.env);
                  if (!target.isArrow) cbVm.env.define('this', ctx, false);
                  cbVm.outputLog = this.outputLog;
                  cbVm.ip = this.labels.get(target.label)!;
                  cbVm.callStack = [-1];
                  cbVm.currentArgCount = finalArgCount;
                  for (const a of args) cbVm.stack.push(a);
                  
                  // Wait for runAsync to finish logging and handling unwinding, then return the stack's top value
                  const promise = cbVm.runAsync().then(() => cbVm.stack.pop());
                  this.stack.push(promise);
                  this.callStack.pop(); // Remove the +1 from CALL
                  break;
              }

              // Push expanded arguments to stack
              for (const a of args) {
                  this.stack.push(a);
              }
              this.envStack.push(this.env);
              this.argCountStack.push(this.currentArgCount);
              this.currentArgCount = finalArgCount;
              this.env = new Environment(target.env); // Create new scope explicitly chained to closure env
              if (!target.isArrow) {
                  this.env.define('this', ctx, false);
              }
              this.ip = this.labels.get(target.label)!;
              continue;
            }

            if (typeof target === 'function') {
                // It's a JS built-in function
                const finalArgs = [];
                for (let i = 0; i < args.length; i++) {
                    let arg = args[i];
                    if (arg && typeof arg === 'object' && arg.type === 'closure') {
                        const closure = arg;
                        arg = (...cbArgs: any[]) => {
                            const cbVm = new VM(this.instructions, this.labels);
                            cbVm.env = new Environment(closure.env);
                            cbVm.outputLog = this.outputLog; 
                            cbVm.ip = this.labels.get(closure.label)!;
                            cbVm.callStack = [-1]; 
                            cbVm.currentArgCount = cbArgs.length;
                            for (let j = 0; j < cbArgs.length; j++) {
                                cbVm.stack.push(cbArgs[j]);
                            }
                            if (closure.isAsync) {
                                return cbVm.runAsync().then(() => cbVm.stack.pop());
                            } else {
                                cbVm.runSync();
                                return cbVm.stack.pop();
                            }
                        };
                    } else if (typeof arg === 'string' && this.labels.has(arg)) {
                        const label = arg;
                        arg = (...cbArgs: any[]) => {
                            const cbVm = new VM(this.instructions, this.labels);
                            cbVm.env = new Environment(this.env);
                            cbVm.outputLog = this.outputLog;
                            cbVm.ip = this.labels.get(label)!;
                            cbVm.callStack = [-1];
                            cbVm.currentArgCount = cbArgs.length;
                            for (let j = 0; j < cbArgs.length; j++) {
                                cbVm.stack.push(cbArgs[j]);
                            }
                            // label hooks are sync
                            cbVm.runSync();
                            return cbVm.stack.pop();
                        };
                    }
                    finalArgs.push(arg);
                }
                const result = target.apply(ctx, finalArgs);
                this.stack.push(result);
                // Pop the return address since we didn't actually jump
                this.callStack.pop();
                break;
            }

            if (typeof target !== 'number') {
              this.throwRuntimeError(inst, `TypeError: ${inst.operand} is not a function`);
            }
            
            // Standard function call (no closure data available)
            // Push expanded arguments to stack
            for (const a of args) {
                this.stack.push(a);
            }
            this.envStack.push(this.env);
            this.argCountStack.push(this.currentArgCount);
            this.env = new Environment(this.env);
            this.currentArgCount = finalArgCount;
            
            this.ip = target;
            continue;
          }

          case OpCode.RET:
              if (this.callStack.length === 0 || this.callStack[this.callStack.length - 1] === -1) {
                  return this.outputLog;
              }
              this.ip = this.callStack.pop()!;
              this.env = this.envStack.pop()!;
              this.currentArgCount = this.argCountStack.pop()!;
              continue;

          default:
            this.throwRuntimeError(inst, `Illegal OpCode '${inst.op}' at address ${this.ip}`);
        }

        this.ip++;
      }
      return this.outputLog;
  }
}