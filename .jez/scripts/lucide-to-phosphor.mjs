/**
 * Codemod: migrate lucide-react imports to @phosphor-icons/react.
 *
 * - Rewrites import specifiers via the validated mapping files
 *   (.jez/data/lucide-phosphor-map-2026-07-16.txt + supplement);
 *   names not in the maps are verbatim Phosphor exports.
 * - Collapses duplicate specifiers when two lucide names map to one
 *   Phosphor name, and renames all identifier usages in the file body
 *   (TS AST-driven — strings/comments/JSX-attribute names untouched).
 * - `LucideIcon` type -> Phosphor `Icon` type.
 * - Namespace imports (`import * as LucideIcons`) -> PhosphorIcons.
 * - Aliased specifiers (`X as Y`) keep the local alias; only the
 *   imported name is remapped.
 *
 * Run from repo root: node .jez/scripts/lucide-to-phosphor.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
const ROOT = process.cwd()

// ---------- load + validate mapping ----------
const map = {}
for (const file of [
  '.jez/data/lucide-phosphor-map-2026-07-16.txt',
  '.jez/data/lucide-phosphor-map-supplement-2026-07-16.txt',
]) {
  for (const line of fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n')) {
    const m = line.match(/^(\w+)=(\w+)$/)
    if (m) map[m[1]] = m[2]
  }
}

const phosphorExports = new Set(['Icon', 'IconProps', 'IconWeight', 'IconContext', 'IconBase'])
// NOTE: don't require.resolve this — the package's exports map rewrites
// dist/index.d.ts to index.cjs.js. Read the real typings file directly.
const dts = fs.readFileSync(
  path.join(ROOT, 'node_modules/@phosphor-icons/react/dist/index.d.ts'),
  'utf8'
)
for (const line of dts.split('\n')) {
  const m = line.match(/export \* from '\.\/csr\/(\w+)'/)
  if (m) {
    phosphorExports.add(m[1])
    phosphorExports.add(m[1] + 'Icon')
  }
}

function targetName(lucideName) {
  if (lucideName === 'LucideIcon') return 'Icon'
  return map[lucideName] ?? lucideName
}

// ---------- collect files ----------
const files = []
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(p)
  }
}
for (const d of ['src', 'tests', 'scripts']) {
  if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d))
}

const warnings = []
const dedupes = []
let changed = 0

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  if (!text.includes('lucide-react')) continue

  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )

  /** @type {{stmt: ts.ImportDeclaration, newText: string}[]} */
  const importEdits = []
  /** old local name -> new local name (body renames) */
  const renames = new Map()

  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue
    if (stmt.moduleSpecifier.text !== 'lucide-react') continue
    const clause = stmt.importClause
    if (!clause) continue

    const nb = clause.namedBindings
    if (nb && ts.isNamespaceImport(nb)) {
      const oldLocal = nb.name.text
      const newLocal = oldLocal === 'LucideIcons' ? 'PhosphorIcons' : oldLocal
      if (oldLocal !== newLocal) renames.set(oldLocal, newLocal)
      importEdits.push({
        stmt,
        newText: `import * as ${newLocal} from '@phosphor-icons/react'`,
      })
      continue
    }

    if (nb && ts.isNamedImports(nb)) {
      // ordered specifiers: { local, imported, isType }
      const seen = new Map() // imported target -> spec entry
      const out = []
      for (const el of nb.elements) {
        const imported = (el.propertyName ?? el.name).text
        const local = el.name.text
        const isType = clause.isTypeOnly || el.isTypeOnly
        const target = targetName(imported)
        if (!phosphorExports.has(target)) {
          warnings.push(`${file}: no Phosphor export for '${imported}' -> '${target}'`)
        }
        const hasAlias = !!el.propertyName
        if (hasAlias) {
          // keep local alias; remap imported name only
          const key = `${target} as ${local}`
          if (!seen.has(key)) {
            const spec = { text: target === local ? target : `${target} as ${local}`, isType }
            seen.set(key, spec)
            out.push(spec)
          }
          continue
        }
        // unaliased: local becomes the phosphor name
        if (local !== target) renames.set(local, target)
        if (seen.has(target)) {
          dedupes.push(`${file}: ${local} merged into ${target}`)
          // widen type-ness: if any occurrence is a value import, keep value
          if (!isType) seen.get(target).isType = false
          continue
        }
        const spec = { text: target, isType }
        seen.set(target, spec)
        out.push(spec)
      }
      const allType = out.length > 0 && out.every((s) => s.isType)
      const specText = out
        .map((s) => (!allType && s.isType ? `type ${s.text}` : s.text))
        .join(', ')
      importEdits.push({
        stmt,
        newText: `import ${allType ? 'type ' : ''}{ ${specText} } from '@phosphor-icons/react'`,
      })
    }
  }

  if (importEdits.length === 0) continue

  // ---------- body renames ----------
  /** @type {{start: number, end: number, text: string}[]} */
  const edits = []
  const importRanges = importEdits.map(({ stmt }) => [stmt.getStart(sf), stmt.end])

  function inImport(pos) {
    return importRanges.some(([s, e]) => pos >= s && pos < e)
  }

  function visit(node) {
    if (ts.isIdentifier(node) && renames.has(node.text) && !inImport(node.getStart(sf))) {
      const parent = node.parent
      const skip =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isPropertySignature(parent) && parent.name === node) ||
        (ts.isPropertyDeclaration(parent) && parent.name === node) ||
        (ts.isMethodDeclaration(parent) && parent.name === node) ||
        (ts.isMethodSignature(parent) && parent.name === node) ||
        (ts.isJsxAttribute(parent) && parent.name === node) ||
        (ts.isQualifiedName(parent) && parent.right === node) ||
        ts.isImportSpecifier(parent) ||
        ts.isNamespaceImport(parent) ||
        ts.isImportClause(parent) ||
        (ts.isBindingElement(parent) && parent.propertyName === node) ||
        (ts.isEnumMember(parent) && parent.name === node)
      // declarations shadowing an icon name — warn, don't rename
      const isDecl =
        (ts.isVariableDeclaration(parent) && parent.name === node) ||
        (ts.isParameter(parent) && parent.name === node) ||
        (ts.isFunctionDeclaration(parent) && parent.name === node) ||
        (ts.isClassDeclaration(parent) && parent.name === node) ||
        (ts.isBindingElement(parent) && parent.name === node && !parent.propertyName)
      if (isDecl) {
        warnings.push(
          `${file}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}: '${node.text}' shadowed by local declaration — review manually`
        )
      } else if (ts.isExportSpecifier(parent)) {
        warnings.push(
          `${file}: '${node.text}' appears in an export specifier — review manually`
        )
      } else if (!skip) {
        if (ts.isShorthandPropertyAssignment(parent) && parent.name === node) {
          // preserve the object key, point it at the renamed identifier
          edits.push({
            start: node.getStart(sf),
            end: node.end,
            text: `${node.text}: ${renames.get(node.text)}`,
          })
        } else {
          edits.push({ start: node.getStart(sf), end: node.end, text: renames.get(node.text) })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  for (const { stmt, newText } of importEdits) {
    edits.push({ start: stmt.getStart(sf), end: stmt.end, text: newText })
  }

  edits.sort((a, b) => b.start - a.start)
  let output = text
  for (const e of edits) {
    output = output.slice(0, e.start) + e.text + output.slice(e.end)
  }
  fs.writeFileSync(file, output)
  changed++
}

console.log(`Rewrote ${changed} files.`)
if (dedupes.length) {
  console.log(`\nDedupe merges (${dedupes.length}):`)
  for (const d of dedupes) console.log('  ' + d)
}
if (warnings.length) {
  console.log(`\nWARNINGS (${warnings.length}):`)
  for (const w of warnings) console.log('  ' + w)
}
