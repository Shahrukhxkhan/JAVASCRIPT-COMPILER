import { tokenize } from './compiler/lexer';
import { Parser } from './compiler/parser';
import { analyze } from './compiler/semantic';
import { generateIR } from './compiler/ir';
import { optimize } from './compiler/optimizer';
import { generateBytecode } from './compiler/codegen';
import { VM } from './compiler/vm';

const code = `
// 1. if, else if, else
let x = 15;
if (x < 10) {
  print("x is less than 10");
} else if (x == 15) {
  print("x is exactly 15");
} else {
  print("x is something else");
}

// 2. while loop
let count = 0;
while (count < 3) {
  print("while loop count: " + count);
  count = count + 1;
}

// 3. do...while loop
let dCount = 0;
do {
  print("do-while loop count: " + dCount);
  dCount = dCount + 1;
} while (dCount < 2);

// 4. for loop with break and continue
for (let i = 0; i < 5; i = i + 1) {
  if (i == 1) {
    continue;
  }
  if (i == 3) {
    break;
  }
  print("for loop i: " + i);
}

// 5. switch statement
let fruit = "apple";
switch (fruit) {
  case "banana":
    print("It's a banana");
    break;
  case "apple":
    print("It's an apple");
    break;
  default:
    print("Unknown fruit");
}

// 6. Ternary operator
let age = 20;
let status = age >= 18 ? "Adult" : "Minor";
print("Status: " + status);

// 7. try, catch, finally, throw
try {
  print("Inside try block");
  throw "Custom Error!";
  print("This should not print");
} catch (e) {
  print("Caught error: " + e);
} finally {
  print("Inside finally block");
}
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
