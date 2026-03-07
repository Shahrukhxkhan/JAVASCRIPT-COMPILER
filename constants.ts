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
  WhileStatement = 'WhileStatement',
  ForStatement = 'ForStatement',
  BreakStatement = 'BreakStatement',
  ContinueStatement = 'ContinueStatement',
  ReturnStatement = 'ReturnStatement',
  ExpressionStatement = 'ExpressionStatement',
  BinaryExpression = 'BinaryExpression',
  Identifier = 'Identifier',
  Literal = 'Literal',
  CallExpression = 'CallExpression',
  AssignmentExpression = 'AssignmentExpression',
  MemberExpression = 'MemberExpression',
  IndexExpression = 'IndexExpression',
  ArrayExpression = 'ArrayExpression',
  ObjectExpression = 'ObjectExpression',
  UpdateExpression = 'UpdateExpression',
}

export enum OpCode {
  HALT = 'HALT',
  CONST = 'CONST',       // Push constant to stack
  ADD = 'ADD',           // Pop 2, Add, Push result
  SUB = 'SUB',
  MUL = 'MUL',
  DIV = 'DIV',
  NEQ = 'NEQ',           // Not equal
  LTE = 'LTE',           // Less than or equal
  GTE = 'GTE',           // Greater than or equal
  LOAD = 'LOAD',         // Load variable from current scope chain
  STORE = 'STORE',       // Store variable in current scope
  STORE_OUTER = 'STORE_OUTER', // Assign into already-defined outer scope var
  JMP = 'JMP',           // Jump unconditionally
  JMP_FALSE = 'JMP_FALSE', // Jump if top of stack is falsey
  PRINT = 'PRINT',       // Pop and print
  CALL = 'CALL',
  RET = 'RET',
  EQ = 'EQ',             // Equality check
  LT = 'LT',
  GT = 'GT',
  ENTER_SCOPE = 'ENTER_SCOPE', // Push new environment frame
  EXIT_SCOPE = 'EXIT_SCOPE',   // Pop environment frame
  ARRAY_NEW = 'ARRAY_NEW',     // Create array with n elements from stack
  ARRAY_GET = 'ARRAY_GET',     // arr[index]
  ARRAY_SET = 'ARRAY_SET',     // arr[index] = value
  OBJ_NEW = 'OBJ_NEW',         // Create object with n key/value pairs from stack
  OBJ_GET = 'OBJ_GET',         // obj.key
  OBJ_SET = 'OBJ_SET',         // obj.key = value
}