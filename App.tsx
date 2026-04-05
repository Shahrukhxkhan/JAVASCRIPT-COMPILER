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
// Basic Arithmetic
let a = 10;
let b = 20;
let sum = a + b;
print("The sum of a and b is: " + sum);

// Function call
function greet(name) {
  print("Hello, " + name + "!");
}
greet("World");

// Let's test the new runtime error tracking!
function divide(x, y) {
  return x / y;
}

print("10 / 2 = " + divide(10, 2));
print("Triggering a division by zero error...");
print(divide(10, 0)); // This will throw an error with line and column numbers!
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
