const fs = require('fs');
let code = fs.readFileSync('compiler/semantic.ts', 'utf8');
code = code.replace(/errors\.push\(\{ message: `Variable '\$\{node\.name\}' declared twice\.` \}\);/g, "errors.push({ message: `Variable '${node.name}' declared twice.`, line: node.line, column: node.column });");
code = code.replace(/errors\.push\(\{ message: `Assignment to constant variable '\$\{node\.left\.value\}'\.` \}\);/g, "errors.push({ message: `Assignment to constant variable '${node.left.value}'.`, line: node.left.line, column: node.left.column });");
code = code.replace(/errors\.push\(\{ message: `Function '\$\{node\.name\}' declared twice\.` \}\);/g, "errors.push({ message: `Function '${node.name}' declared twice.`, line: node.line, column: node.column });");
code = code.replace(/errors\.push\(\{ message: `Class '\$\{node\.name\}' declared twice\.` \}\);/g, "errors.push({ message: `Class '${node.name}' declared twice.`, line: node.line, column: node.column });");
code = code.replace(/errors\.push\(\{ message: `Undeclared identifier '\$\{node\.value\}'\.` \}\);/g, "errors.push({ message: `Undeclared identifier '${node.value}'.`, line: node.line, column: node.column });");
fs.writeFileSync('compiler/semantic.ts', code);
