import React, { useState } from 'react';
import Editor from './components/Editor';
import OutputPanel from './components/OutputPanel';
import GitHubSync from './components/GitHubSync';
import { tokenize } from './compiler/lexer';
import { Parser } from './compiler/parser';
import { analyze } from './compiler/semantic';
import { generateIR } from './compiler/ir';
import { optimize } from './compiler/optimizer';
import { generateBytecode } from './compiler/codegen';
import { VM } from './compiler/vm';
import { CompilerResult } from './types';

const INITIAL_CODE = `
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
`.trim();

const App: React.FC = () => {
  const [code, setCode] = useState(INITIAL_CODE);
  const [activeTab, setActiveTab] = useState<'tokens'|'ast'|'ir'|'opt'|'bytecode'|'console'>('console');
  const [result, setResult] = useState<CompilerResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCompile = () => {
    setError(null);
    try {
      // 1. Lexer
      const tokens = tokenize(code);
      
      // 2. Parser
      const parser = new Parser(tokens);
      const ast = parser.parse();

      // 3. Semantic Analysis
      const semanticErrors = analyze(ast);
      if (semanticErrors.length > 0) {
        const err = semanticErrors[0];
        const loc = err.line ? `[Line ${err.line}:${err.column}] ` : '';
        throw new Error(`${loc}Semantic Error: ${err.message}`);
      }

      // 4. IR Generation
      const ir = generateIR(ast);

      // 5. Optimization
      const optimizedIR = optimize(ir);

      // 6. Code Gen
      const { instructions: bytecode, labels } = generateBytecode(optimizedIR);

      // 7. Execution (VM)
      const vm = new VM(bytecode, labels);
      const logs = vm.run();

      setResult({
        tokens,
        ast,
        semanticErrors,
        ir,
        optimizedIR,
        bytecode,
        logs
      });
      setActiveTab('console');

    } catch (err: any) {
      setError(err.message);
      setResult(null);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
      {/* Header */}
      <header className="h-14 bg-gray-800 border-b border-gray-700 flex items-center px-6 justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-blue-500"></div>
          <h1 className="font-bold text-lg tracking-tight">JS Compiler <span className="text-gray-500 font-normal">from scratch</span></h1>
        </div>
        <div className="flex items-center gap-4">
          <GitHubSync currentCode={code} />
          <button 
            onClick={handleCompile}
            className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-md font-semibold transition-colors flex items-center gap-2"
          >
            <span>▶</span> Compile & Run
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Editor */}
        <div className="w-1/2 p-4 flex flex-col gap-2">
          <div className="text-gray-400 text-sm font-semibold uppercase">Source Code</div>
          <Editor value={code} onChange={setCode} />
        </div>

        {/* Right: Output Tabs */}
        <div className="w-1/2 p-4 flex flex-col gap-2 bg-gray-900 border-l border-gray-800">
          
          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-700 pb-2 overflow-x-auto">
            {[
              { id: 'console', label: 'Console' },
              { id: 'tokens', label: 'Tokens' },
              { id: 'ast', label: 'AST' },
              { id: 'ir', label: 'IR' },
              { id: 'opt', label: 'Optimized' },
              { id: 'bytecode', label: 'Bytecode' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.id 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-hidden relative">
            {error && (
              <div className="absolute inset-0 bg-red-900/20 backdrop-blur-sm flex items-center justify-center p-8 z-10">
                <div className="bg-red-900 border border-red-500 text-white p-6 rounded-lg shadow-xl max-w-lg">
                  <h3 className="text-xl font-bold mb-2">Compilation Failed</h3>
                  <p className="font-mono whitespace-pre-wrap">{error}</p>
                </div>
              </div>
            )}

            {!result && !error && (
              <div className="h-full flex items-center justify-center text-gray-600">
                Press "Compile & Run" to see output
              </div>
            )}

            {result && (
              <>
                {activeTab === 'console' && (
                  <OutputPanel title="Output Log" data={result.logs.join('\n')} type="text" />
                )}
                {activeTab === 'tokens' && (
                  <OutputPanel title="Lexer Tokens" data={result.tokens} type="json" />
                )}
                {activeTab === 'ast' && (
                  <OutputPanel title="Abstract Syntax Tree" data={result.ast} type="json" />
                )}
                {activeTab === 'ir' && (
                  <OutputPanel title="Intermediate Representation (Quadruples)" data={result.ir} type="list" />
                )}
                {activeTab === 'opt' && (
                  <OutputPanel title="Optimized IR" data={result.optimizedIR} type="list" />
                )}
                {activeTab === 'bytecode' && (
                  <OutputPanel title="VM Bytecode" data={result.bytecode} type="list" />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
