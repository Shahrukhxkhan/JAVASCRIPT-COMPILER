import { tokenize } from './compiler/lexer';
import { Parser } from './compiler/parser';
import { analyze } from './compiler/semantic';
import { generateIR } from './compiler/ir';
import { optimize } from './compiler/optimizer';
import { generateBytecode } from './compiler/codegen';
import { VM } from './compiler/vm';

const code = `
// Basic Arithmetic
let a = 10;
let b = 20;
let sum = a + b;
print("The sum of a and b is: " + sum);

// Function Definition and Call
function greet(name) {
  print("Hello, " + name + "!");
}
greet("World");

// Testing Division
function divide(x, y) {
  return x / y;
}
print("10 / 2 = " + divide(10, 2));

// Triggering a Runtime Error (Division by Zero)
print("Triggering a division by zero error...");
print(divide(10, 0));
`;

try {
  const tokens = tokenize(code);
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const semanticErrors = analyze(ast);
  if (semanticErrors.length > 0) {
    console.log("Semantic Errors:", semanticErrors);
    process.exit(1);
  }
  const ir = generateIR(ast);
  const optimizedIR = optimize(ir);
  const { instructions: bytecode, labels } = generateBytecode(optimizedIR);
  const vm = new VM(bytecode, labels);
  const logs = vm.run();
  console.log("LOGS:");
  console.log(logs.join('\n'));
} catch (e) {
  console.error("ERROR:", e);
}
