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
// ── 1. While Loop ──────────────────────────
let i = 1;
let sum = 0;
while (i <= 5) {
  sum = sum + i;
  i = i + 1;
}
print(sum); // 15

// ── 2. For Loop ────────────────────────────
let factorial = 1;
for (let k = 1; k <= 5; k = k + 1) {
  factorial = factorial * k;
}
print(factorial); // 120

// ── 3. Nested Functions / Closures ─────────
function makeAdder(x) {
  function add(y) {
    return x + y;
  }
  return add(10);
}
print(makeAdder(5)); // 15

// ── 4. Arrays ──────────────────────────────
let nums = [10, 20, 30, 40, 50];
nums[2] = 99;
print(nums[2]); // 99

let total = 0;
for (let j = 0; j < 5; j = j + 1) {
  total = total + nums[j];
}
print(total); // 219

// ── 5. Objects ─────────────────────────────
let person = { name: "Alice", age: 30, score: 95 };
print(person.name);  // Alice
print(person.score); // 95
`.trim();

const App: React.FC = () => {
  const [code, setCode] = useState(INITIAL_CODE);
  const [activeTab, setActiveTab] = useState<'tokens' | 'ast' | 'ir' | 'opt' | 'bytecode' | 'console' | 'errors'>('console');
  const [result, setResult] = useState<CompilerResult | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const handleCompile = () => {
    setFatalError(null);
    try {
      // 1. Lexer
      const tokens = tokenize(code);

      // 2. Parser (with error recovery)
      const parser = new Parser(tokens);
      const ast = parser.parse();
      const parseErrors = parser.parseErrors;

      // 3. Semantic Analysis
      const semanticErrors = analyze(ast);

      // 4. IR Generation
      const ir = generateIR(ast);

      // 5. Optimization
      const optimizedIR = optimize(ir);

      // 6. Code Gen
      const bytecode = generateBytecode(optimizedIR);

      // 7. Execution (VM)
      const vm = new VM(bytecode);
      const logs = vm.run();

      const compiled: CompilerResult = {
        tokens,
        ast,
        parseErrors,
        semanticErrors,
        ir,
        optimizedIR,
        bytecode,
        logs
      };

      setResult(compiled);

      // Auto-switch to errors tab if there are parse/semantic errors
      const hasErrors = parseErrors.length > 0 || semanticErrors.length > 0;
      setActiveTab(hasErrors ? 'errors' : 'console');

    } catch (err: any) {
      setFatalError(err.message);
      setResult(null);
    }
  };

  const TABS = [
    { id: 'console', label: '▶ Console' },
    {
      id: 'errors', label: '⚠ Errors',
      badge: (result?.parseErrors.length ?? 0) + (result?.semanticErrors.length ?? 0) || undefined
    },
    { id: 'tokens', label: 'Tokens' },
    { id: 'ast', label: 'AST' },
    { id: 'ir', label: 'IR' },
    { id: 'opt', label: 'Optimized' },
    { id: 'bytecode', label: 'Bytecode' },
  ] as const;

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
      {/* Header */}
      <header className="h-14 bg-gray-800 border-b border-gray-700 flex items-center px-6 justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full bg-blue-500 shadow-lg shadow-blue-500/50"></div>
          <h1 className="font-bold text-lg tracking-tight">
            JS Compiler <span className="text-gray-500 font-normal text-sm">from scratch</span>
          </h1>
          <div className="flex gap-1 ml-3 text-xs">
            {['loops', 'closures', 'arrays', 'objects', 'error-recovery', 'source-maps'].map(f => (
              <span key={f} className="bg-blue-900/40 text-blue-300 border border-blue-700/50 px-2 py-0.5 rounded-full">{f}</span>
            ))}
          </div>
        </div>
        <button
          onClick={handleCompile}
          className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-md font-semibold transition-colors flex items-center gap-2 shadow-lg"
        >
          <span>▶</span> Compile &amp; Run
        </button>
      </header>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">

        {/* Editor panel */}
        <div className="w-1/2 p-4 flex flex-col gap-2">
          <div className="text-gray-400 text-xs font-semibold uppercase tracking-widest">Source Code</div>
          <Editor value={code} onChange={setCode} />
        </div>

        {/* Output panel */}
        <div className="w-1/2 p-4 flex flex-col gap-2 bg-gray-900 border-l border-gray-800">

          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-700 pb-2 overflow-x-auto flex-wrap">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${activeTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
              >
                {tab.label}
                {'badge' in tab && tab.badge ? (
                  <span className="bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {/* Panel body */}
          <div className="flex-1 overflow-hidden relative">

            {/* Fatal compile error */}
            {fatalError && (
              <div className="absolute inset-0 bg-red-900/20 backdrop-blur-sm flex items-center justify-center p-8 z-10">
                <div className="bg-red-900 border border-red-500 text-white p-6 rounded-lg shadow-xl max-w-lg w-full">
                  <h3 className="text-lg font-bold mb-2">❌ Fatal Error</h3>
                  <p className="font-mono text-sm whitespace-pre-wrap">{fatalError}</p>
                </div>
              </div>
            )}

            {!result && !fatalError && (
              <div className="h-full flex items-center justify-center text-gray-600 text-sm">
                Press "Compile &amp; Run" to see output
              </div>
            )}

            {result && (
              <>
                {activeTab === 'console' && (
                  <OutputPanel
                    title="Console Output"
                    data={result.logs.length > 0 ? result.logs.join('\n') : '(no output)'}
                    type="text"
                  />
                )}
                {activeTab === 'errors' && (
                  <div className="h-full overflow-auto p-2 space-y-2 font-mono text-sm">
                    {result.parseErrors.length === 0 && result.semanticErrors.length === 0 ? (
                      <div className="text-green-400 p-3">✅ No errors found</div>
                    ) : (
                      <>
                        {result.parseErrors.map((e, i) => (
                          <div key={i} className="bg-orange-900/30 border border-orange-600 rounded p-3">
                            <span className="text-orange-400 font-bold">Parse Error (line {e.line}:{e.col}) </span>
                            <span className="text-gray-300">{e.message}</span>
                            {e.recovered && <span className="ml-2 text-gray-500 text-xs italic">[recovered]</span>}
                          </div>
                        ))}
                        {result.semanticErrors.map((e, i) => (
                          <div key={i} className="bg-red-900/30 border border-red-600 rounded p-3">
                            <span className="text-red-400 font-bold">Semantic Error{e.line ? ` (line ${e.line})` : ''}: </span>
                            <span className="text-gray-300">{e.message}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
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
                  <OutputPanel title="VM Bytecode (with source lines)" data={result.bytecode} type="list" />
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
