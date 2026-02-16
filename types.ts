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
  start?: number;
  end?: number;
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

// --- IR (Intermediate Representation) ---
// We'll use a 3-Address Code (Quadruple) style for IR
export interface Quadruple {
  op: string;
  arg1: string | null;
  arg2: string | null;
  result: string | null;
}

// --- Bytecode / VM ---
export interface Instruction {
  op: OpCode;
  operand?: any;
}

export interface CompilerResult {
  tokens: Token[];
  ast: Program | null;
  semanticErrors: SemanticError[];
  ir: Quadruple[];
  optimizedIR: Quadruple[];
  bytecode: Instruction[];
  logs: string[];
}
