import { tokenize } from './compiler/lexer';
import { Parser } from './compiler/parser';
import { analyze } from './compiler/semantic';
import { generateIR } from './compiler/ir';
import { optimize } from './compiler/optimizer';
import { generateBytecode } from './compiler/codegen';
import { VM } from './compiler/vm';

const code = `
// 1. Booleans and logical operators
let isTrue = true;
let isFalse = false;
print("true && false: " + (isTrue && isFalse));
print("true || false: " + (isTrue || isFalse));

// 2. Strings and escape sequences
let str1 = "Hello";
let str2 = 'World';
let str3 = "Line 1\\nLine 2\\tTabbed";
print(str1 + " " + str2);
print(str3);

// 3. Null and Undefined
let n = null;
let u = undefined;
print("null == undefined: " + (n == u));
print("null === undefined: " + (n === u));

// 4. Arrays and methods
let arr = [1, 2, 3];
print("Array: " + arr);
print("arr[0]: " + arr[0]);
arr.push(4);
print("After push(4): " + arr);
let popped = arr.pop();
print("Popped: " + popped);
print("Length: " + arr.length);

// Array map and filter
let mapped = arr.map(function(x) { return x * 2; });
print("Mapped (x * 2): " + mapped);
let filtered = arr.filter(function(x) { return x > 1; });
print("Filtered (x > 1): " + filtered);

// 5. Objects and nested objects
let obj = {
  name: "Alice",
  age: 30,
  address: {
    city: "Wonderland"
  }
};
print("obj.name: " + obj.name);
print("obj['age']: " + obj["age"]);
print("obj.address.city: " + obj.address.city);
obj.name = "Bob";
print("Modified obj.name: " + obj.name);

// 6. Type coercion
print('"5" + 1 = ' + ("5" + 1));
print('"5" - 1 = ' + ("5" - 1));
if ("") {
  print("Empty string is truthy");
} else {
  print("Empty string is falsy");
}
if ("hello") {
  print("Non-empty string is truthy");
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
