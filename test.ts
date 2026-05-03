import { tokenize } from './compiler/lexer';
import { Parser } from './compiler/parser';
import { analyze } from './compiler/semantic';
import { generateIR } from './compiler/ir';
import { optimize } from './compiler/optimizer';
import { generateBytecode } from './compiler/codegen';
import { VM } from './compiler/vm';

const code = `
let arr = [10, 20, 30];
for (let value of arr) {
    print(value);
}

const obj = { a: 1, b: 2 };
for (let key in obj) {
    print(key + ": " + obj[key]);
}

print(typeof 123);
print(typeof "hello");
print(typeof obj);
print(typeof Array);

print([] instanceof Object);
print("a" in obj);
print("c" in obj);
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
  const logs = await vm.runAsync();
  console.log("LOGS:");
  console.log(logs.join('\n'));
} catch (e) {
  console.error("ERROR:", e);
}
