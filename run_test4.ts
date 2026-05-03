import { tokenize } from './compiler/lexer';
import { Parser } from './compiler/parser';
import { analyze } from './compiler/semantic';
import { generateIR } from './compiler/ir';
import { optimize } from './compiler/optimizer';
import { generateBytecode } from './compiler/codegen';
import { VM } from './compiler/vm';

async function test() {
  const code = `
// 1. Functions & Closures
function makeCounter(start) {
  let count = start;
  return function() {
    count = count + 1;
    return count;
  };
}

let counter = makeCounter(10);
print("Counter: " + counter()); // 11
print("Counter: " + counter()); // 12

// 2. Classes
class Animal {
  constructor(name) {
    this.name = name;
  }
  speak() {
    print(this.name + " makes a noise.");
  }
}

class Dog extends Animal {
  speak() {
    print(this.name + " barks!");
  }
}

let d = new Dog("Rex");
d.speak();

// 3. Arrays and Objects
let testArr = [1, 2, 3];
for (let i of testArr) {
  print("Array item: " + i);
}

let person = {
  name: "Alice",
  age: 25
};
print("Person name: " + person.name);

// 4. Try-catch
try {
  throw "Oops!";
} catch (e) {
  print("Caught: " + e);
} finally {
  print("Finally block ran");
}
  `;
  try {
    const tokens = tokenize(code);
    const parser = new Parser(tokens);
    const ast = parser.parse();
    const semanticErrors = analyze(ast);
    if (semanticErrors.length > 0) throw new Error(semanticErrors[0].message);
    const ir = generateIR(ast);
    const opt = optimize(ir);
    const { instructions, labels } = generateBytecode(opt);
    const vm = new VM(instructions, labels);
    const logs = await vm.runAsync();
    console.log('Logs:', logs);
  } catch (e: any) {
    console.error('Compilation error:', e?.stack || e);
  }
}

test();
