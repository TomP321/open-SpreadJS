import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const compatRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = path.resolve(compatRoot, '../..');
export const officialDeclaration = path.join(compatRoot, 'node_modules/@mescius/spread-sheets/dist/gc.spread.sheets.d.ts');
export interface Member {
  name: string;
  kind: 'method' | 'property' | 'static' | 'ctor' | 'call' | 'index';
  declarationKind: string;
  signatures: string[];
}
export interface Entry {
  path: string;
  namespace: string;
  kind: string;
  signatures: string[];
  members: Member[];
  values?: Record<string, string | number>;
}
export interface Inventory { version: string; entries: Entry[] }

export function extract(file = officialDeclaration): Inventory {
  const program = ts.createProgram([file], { skipLibCheck: true });
  const source = program.getSourceFile(file)!;
  const checker = program.getTypeChecker();
  const printer = ts.createPrinter({ removeComments: true });
  const entries = new Map<string, Entry>();
  const print = (node: ts.Node) => printer.printNode(ts.EmitHint.Unspecified, node, source).trim();
  function record(node: ts.Node, scope: string[]) {
    if (ts.isModuleDeclaration(node)) {
      const name = node.name.text;
      add([...scope, name], 'namespace', node, []);
      if (node.body) {
        if (ts.isModuleBlock(node.body)) node.body.statements.forEach(n => record(n, [...scope, name]));
        else record(node.body, [...scope, name]);
      }
      return;
    }
    if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
      if (!node.name) return;
      const members: Member[] = node.members.map(m => {
        const ctor = ts.isConstructorDeclaration(m) || ts.isConstructSignatureDeclaration(m);
        const isStatic = ts.canHaveModifiers(m) && ts.getModifiers(m)?.some(x => x.kind === ts.SyntaxKind.StaticKeyword);
        const kind = ctor ? 'ctor' : isStatic ? 'static' : ts.isMethodDeclaration(m) || ts.isMethodSignature(m) ? 'method' : ts.isCallSignatureDeclaration(m) ? 'call' : ts.isIndexSignatureDeclaration(m) ? 'index' : 'property';
        const name = ctor ? 'constructor' : m.name ? (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name) || ts.isNumericLiteral(m.name) ? m.name.text : print(m.name)) : kind;
        return { name, kind, declarationKind: ts.SyntaxKind[m.kind], signatures: [print(m)] };
      });
      add([...scope, node.name.text], ts.isClassDeclaration(node) ? 'class' : 'interface', node, members);
    } else if (ts.isEnumDeclaration(node)) {
      const entry = add([...scope, node.name.text], 'enum', node, []);
      entry.members = node.members.map(member => ({ name: ts.isIdentifier(member.name) || ts.isStringLiteral(member.name) ? member.name.text : print(member.name), kind: 'property', declarationKind: 'EnumMember', signatures: [print(member)] }));
      entry.values = Object.fromEntries(node.members.map(member => {
        const value = checker.getConstantValue(member);
        if (value === undefined) throw new Error(`Cannot evaluate enum ${node.name.text}.${print(member.name)}`);
        return [ts.isIdentifier(member.name) || ts.isStringLiteral(member.name) ? member.name.text : print(member.name), value];
      }));
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      add([...scope, node.name.text], 'function', node, []);
    } else if (ts.isTypeAliasDeclaration(node)) {
      add([...scope, node.name.text], 'type', node, []);
    } else if (ts.isVariableStatement(node)) {
      node.declarationList.declarations.forEach(d => add([...scope, print(d.name)], 'variable', d, []));
    }
  }
  function add(parts: string[], kind: string, node: ts.Node, members: Member[]): Entry {
    const key = `${kind}:${parts.join('.')}`;
    const existing = entries.get(key);
    // Containers carry their own members; avoid repeatedly embedding entire namespaces/classes.
    const container = ts.isClassDeclaration(node) ? ts.factory.updateClassDeclaration(node, node.modifiers, node.name, node.typeParameters, node.heritageClauses, []) : ts.isInterfaceDeclaration(node) ? ts.factory.updateInterfaceDeclaration(node, node.modifiers, node.name, node.typeParameters, node.heritageClauses, []) : undefined;
    const signature = kind === 'namespace' ? `namespace ${parts.join('.')}` : container ? print(container).replace(/\s*\{\s*\}\s*$/, '') : print(node);
    if (existing) { existing.signatures.push(signature); existing.members.push(...members); return existing; }
    const entry = { path: parts.join('.'), namespace: parts.slice(0, -1).join('.'), kind, signatures: [signature], members };
    entries.set(key, entry);
    return entry;
  }
  source.statements.forEach(n => record(n, []));
  return { version: '19.2.5', entries: [...entries.values()].sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind)) };
}
export function writeInventory() {
  const inventory = extract();
  fs.writeFileSync(path.join(compatRoot, 'api-inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
  return inventory;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inventory = writeInventory();
  console.log(`Inventoried ${inventory.entries.length} public declarations (no JSDoc).`);
}
