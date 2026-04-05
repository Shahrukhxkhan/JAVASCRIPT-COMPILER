import React, { useState } from 'react';
import Editor from './components/Editor';
import OutputPanel from './components/OutputPanel';
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

  const [isCompiling, setIsCompiling] = useState(false);
  const [compileSuccess, setCompileSuccess] = useState(false);

  const handleCompile = () => {
    setIsCompiling(true);
    setCompileSuccess(false);
    setError(null);
    
    // Simulate a slight delay for the loading animation
    setTimeout(() => {
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
        setCompileSuccess(true);
        setTimeout(() => setCompileSuccess(false), 2000);

      } catch (err: any) {
        setError(err.message);
        setResult(null);
      } finally {
        setIsCompiling(false);
      }
    }, 300);
  };

  return (
    <div className="flex flex-col h-screen bg-transparent text-text-primary overflow-hidden animate-fade-in">
      {/* Header */}
      <header className="h-16 bg-background/90 backdrop-blur-md border-b border-gold-borderDark flex items-center px-8 justify-between shrink-0 shadow-md z-20">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-sm bg-gradient-to-br from-gold to-gold-dark shadow-[0_0_10px_rgba(255,215,0,0.3)] flex items-center justify-center">
            <span className="text-background font-bold text-xs font-mono">JS</span>
          </div>
          <h1 className="font-bold text-xl tracking-wide text-gold">JS Compiler <span className="text-gold-muted font-normal text-sm ml-2">from scratch</span></h1>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleCompile}
            disabled={isCompiling}
            className={`relative overflow-hidden bg-gold hover:bg-gold-warm text-background px-8 py-2.5 rounded-md font-bold transition-all duration-300 flex items-center gap-2 shadow-[0_0_15px_rgba(255,215,0,0.2)] hover:shadow-[0_0_25px_rgba(255,215,0,0.4)] ${isCompiling ? 'opacity-80 cursor-not-allowed' : ''} ${compileSuccess ? 'bg-success text-white shadow-[0_0_15px_rgba(76,175,80,0.4)]' : ''}`}
          >
            {isCompiling ? (
              <>
                <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin"></div>
                <span>Compiling...</span>
              </>
            ) : compileSuccess ? (
              <>
                <span>✓</span>
                <span>Success!</span>
              </>
            ) : (
              <>
                <span>▶</span>
                <span>Compile & Run</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden p-4 gap-4 z-10">
        
        {/* Left: Editor */}
        <div className="w-1/2 flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <span className="text-gold-muted text-sm font-semibold uppercase tracking-wider">Source Code</span>
            <div className="h-px flex-1 bg-gradient-to-r from-gold-borderDark to-transparent"></div>
          </div>
          <div className="flex-1 relative rounded-md overflow-hidden shadow-lg border-t-2 border-gold-dark">
            <Editor value={code} onChange={setCode} />
          </div>
        </div>

        {/* Right: Output Tabs */}
        <div className="w-1/2 flex flex-col gap-3">
          
          {/* Tabs */}
          <div className="flex gap-2 border-b border-gold-borderDark pb-2 overflow-x-auto custom-scrollbar">
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
                className={`px-5 py-2 rounded-t-md text-sm font-semibold transition-all duration-300 relative ${
                  activeTab === tab.id 
                    ? 'bg-panel text-gold border-t-2 border-gold shadow-[0_-4px_10px_rgba(255,215,0,0.1)]' 
                    : 'bg-background text-text-secondary hover:text-gold-muted hover:bg-panel/50'
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gold shadow-[0_0_8px_rgba(255,215,0,0.8)]"></div>
                )}
              </button>
            ))}
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-hidden relative rounded-md shadow-lg">
            {error && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center p-8 z-10 animate-fade-in">
                <div className="bg-panel border-2 border-error text-text-primary p-8 rounded-lg shadow-[0_0_30px_rgba(255,68,68,0.2)] max-w-lg w-full">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-error/20 flex items-center justify-center text-error text-xl">⚠️</div>
                    <h3 className="text-2xl font-bold text-error">Compilation Failed</h3>
                  </div>
                  <div className="bg-background p-4 rounded border border-error/30">
                    <p className="font-mono text-sm whitespace-pre-wrap text-error/90">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {!result && !error && (
              <div className="h-full flex flex-col items-center justify-center text-gold-muted bg-panel border border-gold-border rounded-md">
                <div className="w-16 h-16 mb-4 opacity-20">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 18 22 12 16 6"></polyline>
                    <polyline points="8 6 2 12 8 18"></polyline>
                  </svg>
                </div>
                <p className="text-lg tracking-wide">Press <span className="text-gold font-semibold">Compile & Run</span> to see output</p>
              </div>
            )}

            {result && (
              <div className="h-full animate-slide-up">
                {activeTab === 'console' && (
                  <OutputPanel title="Console Output" data={result.logs.join('\n')} type="text" />
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
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
