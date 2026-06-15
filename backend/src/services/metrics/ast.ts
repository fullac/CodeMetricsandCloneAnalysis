import type Parser from "tree-sitter";

export function walkAst(node: Parser.SyntaxNode, visit: (node: Parser.SyntaxNode) => void): void {
  visit(node);
  for (const child of node.namedChildren) {
    walkAst(child, visit);
  }
}

export function findFirstDescendant(node: Parser.SyntaxNode, predicate: (node: Parser.SyntaxNode) => boolean): Parser.SyntaxNode | null {
  if (predicate(node)) {
    return node;
  }
  for (const child of node.namedChildren) {
    const result = findFirstDescendant(child, predicate);
    if (result) {
      return result;
    }
  }
  return null;
}

export function countDescendants(node: Parser.SyntaxNode, predicate: (node: Parser.SyntaxNode) => boolean): number {
  let count = 0;
  walkAst(node, (item) => {
    if (item !== node && predicate(item)) {
      count += 1;
    }
  });
  return count;
}
