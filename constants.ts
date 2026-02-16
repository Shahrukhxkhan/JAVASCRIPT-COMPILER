export enum TokenType {
  Keyword = 'Keyword',
  Identifier = 'Identifier',
  Number = 'Number',
  String = 'String',
  Operator = 'Operator',
  Punctuation = 'Punctuation',
  EOF = 'EOF'
}

export enum ASTNodeType {
  Program = 'Program',
  VariableDeclaration = 'VariableDeclaration',
  FunctionDeclaration = 'FunctionDeclaration',
  BlockStatement = 'BlockStatement',
  IfStatement = 'IfStatement',
  ReturnStatement = 'ReturnStatement',
  ExpressionStatement = 'ExpressionStatement',
  BinaryExpression = 'BinaryExpression',
  Identifier = 'Identifier',
  Literal = 'Literal',
  CallExpression = 'CallExpression',
  AssignmentExpression = 'AssignmentExpression',
  MemberExpression = 'MemberExpression'
}

export enum OpCode {
  HALT = 'HALT',
  CONST = 'CONST',   // Push constant to stack
  ADD = 'ADD',       // Pop 2, Add, Push result
  SUB = 'SUB',
  MUL = 'MUL',
  DIV = 'DIV',
  LOAD = 'LOAD',     // Load variable from env
  STORE = 'STORE',   // Store variable to env
  JMP = 'JMP',       // Jump unconditionally
  JMP_FALSE = 'JMP_FALSE', // Jump if top of stack is falsey
  PRINT = 'PRINT',    // Pop and print (for demo purposes)
  CALL = 'CALL',
  RET = 'RET',
  EQ = 'EQ',         // Equality check
  LT = 'LT',
  GT = 'GT'
}