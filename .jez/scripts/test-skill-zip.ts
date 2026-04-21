/**
 * Smoke test for the skill zip parser. Verifies fflate-based unzipSync
 * picks up SKILL.md at the root AND inside a single wrapping folder.
 *
 * Run: pnpm tsx .jez/scripts/test-skill-zip.ts
 */
import { zipSync, strToU8, unzipSync, strFromU8 } from 'fflate'

const skillMd = `---\nname: test-skill\ndescription: Example used by test-skill-zip.ts — verifies unzip + frontmatter pipeline.\n---\n\n# Test\nbody`

function buildFlat() {
  return zipSync({
    'SKILL.md': strToU8(skillMd),
    'scripts/extract.py': strToU8('print("hi")\n'),
    'references/notes.md': strToU8('# notes\n'),
  })
}

function buildWrapped() {
  return zipSync({
    'test-skill/SKILL.md': strToU8(skillMd),
    'test-skill/scripts/extract.py': strToU8('print("hi")\n'),
  })
}

function expectPresent(label: string, zip: Uint8Array) {
  const entries = unzipSync(zip)
  const firstSegs = new Set(Object.keys(entries).map((p) => p.split('/')[0]))
  const wrapper = firstSegs.size === 1 ? `${[...firstSegs][0]}/` : ''
  const rebuilt: Record<string, Uint8Array> = {}
  for (const [p, buf] of Object.entries(entries)) {
    if (p.endsWith('/')) continue
    const rel = wrapper && p.startsWith(wrapper) ? p.slice(wrapper.length) : p
    rebuilt[rel] = buf
  }
  const hasSkillMd = !!rebuilt['SKILL.md']
  const parsedOk = hasSkillMd && strFromU8(rebuilt['SKILL.md']!).includes('name: test-skill')
  console.log(`[${label}] wrapper="${wrapper}" hasSkillMd=${hasSkillMd} parsedOk=${parsedOk}`)
  if (!parsedOk) {
    console.error('FAIL — unzip/wrapper stripping broken')
    process.exit(1)
  }
}

expectPresent('flat', buildFlat())
expectPresent('wrapped', buildWrapped())
console.log('OK — both layouts parsed successfully')
