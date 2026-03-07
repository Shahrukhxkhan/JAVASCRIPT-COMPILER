import { TokenType, ASTNodeType, OpCode } from './constants';

// --- Lexer Types ---
export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

// --- AST Types ---
export interface ASTNode {
  type: ASTNodeType;
  line?: number;   // Source line (for source maps)
  col?: number;    // Source column (for source maps)
  [key: string]: any;
}

export interface Program extends ASTNode {
  type: ASTNodeType.Program;
  body: ASTNode[];
}

// --- Semantic Analysis ---
export interface SymbolInfo {
  name: string;
  type: string; // 'var' | 'function'
  scopeLevel: number;
}

export interface SemanticError {
  message: string;
  line?: number;
}

// --- Parse Errors (Error Recovery) ---
export interface ParseError {
  message: string;
  line: number;
  col: number;
  recovered: boolean;
}

// --- IR (Intermediate Representation) ---
// 3-Address Code (Quadruple) style
export interface Quadruple {
  op: string;
  arg1: string | null;
  arg2: string | null;
  result: string | null;
  sourceLine?: number;  // Source map: original source line
}

// --- Bytecode / VM ---
export interface Instruction {
  op: OpCode;
  operand?: any;
  sourceLine?: number;  // Source map: original source line
}

export interface CompilerResult {
  tokens: Token[];
  ast: Program | null;
  parseErrors: ParseError[];
  semanticErrors: SemanticError[];
  ir: Quadruple[];
  optimizedIR: Quadruple[];
  bytecode: Instruction[];
  logs: string[];
}
