const fs = require('fs');
let code = fs.readFileSync('compiler/parser.ts', 'utf8');
code = code.replace(/\{\s*type:\s*ASTNodeType\./g, '{ line: this.previous()?.line || 1, column: this.previous()?.column || 1, type: ASTNodeType.');
fs.writeFileSync('compiler/parser.ts', code);
