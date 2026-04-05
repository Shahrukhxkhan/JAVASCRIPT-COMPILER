export enum TokenType {
  Keyword = 'Keyword',
  Identifier = 'Identifier',
  Number = 'Number',
  String = 'String',
  TemplateHead = 'TemplateHead',
  TemplateMiddle = 'TemplateMiddle',
  TemplateTail = 'TemplateTail',
  TemplateNoSubstitution = 'TemplateNoSubstitution',
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
  WhileStatement = 'WhileStatement',
  ForStatement = 'ForStatement',
  ReturnStatement = 'ReturnStatement',
  ExpressionStatement = 'ExpressionStatement',
  BinaryExpression = 'BinaryExpression',
  Identifier = 'Identifier',
  Literal = 'Literal',
  CallExpression = 'CallExpression',
  AssignmentExpression = 'AssignmentExpression',
  MemberExpression = 'MemberExpression',
  ArrayExpression = 'ArrayExpression',
  ObjectExpression = 'ObjectExpression',
  ArrowFunctionExpression = 'ArrowFunctionExpression',
  TemplateLiteral = 'TemplateLiteral',
  TaggedTemplateExpression = 'TaggedTemplateExpression',
  ClassDeclaration = 'ClassDeclaration',
  TryStatement = 'TryStatement',
  ThrowStatement = 'ThrowStatement',
  AwaitExpression = 'AwaitExpression',
  ArrayPattern = 'ArrayPattern',
  ObjectPattern = 'ObjectPattern'
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
  GT = 'GT',
  ARRAY = 'ARRAY',   // Create array from N elements on stack
  OBJECT = 'OBJECT', // Create object from N key-value pairs on stack
  GET_PROP = 'GET_PROP', // Get property from object
  SET_PROP = 'SET_PROP', // Set property on object
  TRY_START = 'TRY_START', // Push exception handler to stack
  TRY_END = 'TRY_END',     // Pop exception handler
  THROW = 'THROW',         // Throw exception
  AWAIT = 'AWAIT',         // Yield execution (simulated)
  EXTENDS = 'EXTENDS'      // Basic inheritance
}
