import type Parser from "tree-sitter";
import type { StaticAnalysisLanguage } from "../../types/index.js";

export const MINHASH_SIZE = 128;
export const LSH_BANDS = 16;
export const LSH_ROWS = MINHASH_SIZE / LSH_BANDS;
export const DEFAULT_K_GRAM_SIZE = 12;

export interface CloneFingerprint {
  file: string;
  language: StaticAnalysisLanguage;
  tokenCount: number;
  kGramSize: number;
  kGramHashes: number[];
  signature: number[];
  ncloc: number;
}

function hashString(input: string, seed = 2166136261): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mixHash(value: number, seed: number): number {
  let hash = (value ^ Math.imul(seed + 1, 0x9e3779b1)) >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function isCommentNode(node: Parser.SyntaxNode): boolean {
  return node.type.toLowerCase().includes("comment");
}

function normalizeLeafToken(node: Parser.SyntaxNode): string | null {
  const type = node.type.toLowerCase();
  if (type.includes("comment")) {
    return null;
  }
  if (type.includes("identifier") || type.endsWith("_name") || type === "field_identifier") {
    return "ID";
  }
  if (type.includes("string") || type.includes("template") || type.includes("char_literal")) {
    return "STR";
  }
  if (type.includes("number") || type.includes("integer") || type.includes("float") || type.includes("decimal") || type.includes("hex")) {
    return "NUM";
  }
  return node.type;
}

export function normalizeAstTokens(root: Parser.SyntaxNode): string[] {
  const tokens: string[] = [];

  function walk(node: Parser.SyntaxNode): void {
    if (isCommentNode(node)) {
      return;
    }
    if (node.childCount === 0) {
      const token = normalizeLeafToken(node);
      if (token) {
        tokens.push(token);
      }
      return;
    }
    for (const child of node.children) {
      walk(child);
    }
  }

  walk(root);
  return tokens;
}

export function createKGramHashes(tokens: string[], kGramSize = DEFAULT_K_GRAM_SIZE): number[] {
  if (tokens.length < kGramSize) {
    return [];
  }

  const hashes: number[] = [];
  for (let i = 0; i <= tokens.length - kGramSize; i += 1) {
    hashes.push(hashString(tokens.slice(i, i + kGramSize).join("\u0001")));
  }
  return Array.from(new Set(hashes));
}

export function createMinHashSignature(kGramHashes: number[], signatureSize = MINHASH_SIZE): number[] {
  if (kGramHashes.length === 0) {
    return [];
  }

  const signature = Array.from({ length: signatureSize }, () => Number.MAX_SAFE_INTEGER);
  for (const kGramHash of kGramHashes) {
    for (let seed = 0; seed < signatureSize; seed += 1) {
      const mixed = mixHash(kGramHash, seed);
      if (mixed < signature[seed]) {
        signature[seed] = mixed;
      }
    }
  }
  return signature;
}

export function createFingerprint(input: {
  file: string;
  language: StaticAnalysisLanguage;
  root: Parser.SyntaxNode;
  ncloc: number;
  kGramSize?: number;
}): CloneFingerprint {
  const tokens = normalizeAstTokens(input.root);
  const kGramSize = input.kGramSize ?? DEFAULT_K_GRAM_SIZE;
  const kGramHashes = createKGramHashes(tokens, kGramSize);
  return {
    file: input.file,
    language: input.language,
    tokenCount: tokens.length,
    kGramSize,
    kGramHashes,
    signature: createMinHashSignature(kGramHashes),
    ncloc: input.ncloc,
  };
}

export function jaccardFromHashes(a: number[], b: number[]): { similarity: number; intersectionSize: number } {
  if (a.length === 0 || b.length === 0) {
    return { similarity: 0, intersectionSize: 0 };
  }

  const setA = new Set(a);
  const setB = new Set(b);
  let intersectionSize = 0;

  for (const item of setA) {
    if (setB.has(item)) {
      intersectionSize += 1;
    }
  }

  return {
    similarity: intersectionSize / (setA.size + setB.size - intersectionSize),
    intersectionSize,
  };
}
