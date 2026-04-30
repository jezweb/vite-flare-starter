/**
 * HelpPage — `/dashboard/help` (gh #47)
 *
 * In-app glossary. Each card explains one concept in plain English with
 * a "when to use" line and a deep-link to the relevant feature page.
 * Driven by `src/shared/config/glossary.ts` — to add an entry, edit
 * that file. Search filters client-side.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { GLOSSARY_ENTRIES, type GlossaryEntry } from '@/shared/config/glossary'
import { features } from '@/shared/config/features'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { SearchInput } from '@/components/ui/search-input'
import { Button } from '@/components/ui/button'

export function HelpPage() {
  const [search, setSearch] = useState('')

  const entries = useMemo(() => visibleEntries(), [])
  const filtered = useMemo(() => filterEntries(entries, search), [entries, search])

  return (
    <PageContainer type="catalog">
      <PageHeader
        title="Help"
        subtitle="Plain-English explanations of every major concept in the app — what each is, when to use it, and where to start."
      />

      <div className="mt-4 max-w-md">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search the glossary…"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          No entries match <span className="font-medium text-foreground">{search}</span>.
        </p>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((entry) => (
            <GlossaryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </PageContainer>
  )
}

function GlossaryCard({ entry }: { entry: GlossaryEntry }) {
  const Icon = entry.icon
  return (
    <article className="flex h-full flex-col gap-3 rounded-lg border border-border/60 bg-card p-4 shadow-sm transition-colors hover:border-border">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <h2 className="text-base font-semibold tracking-tight">{entry.name}</h2>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{entry.summary}</p>
      <p className="text-xs leading-relaxed text-muted-foreground/80">
        <span className="font-medium uppercase tracking-wide text-foreground/60">When to use </span>
        {entry.whenToUse}
      </p>
      {entry.action && (
        <div className="mt-auto pt-2">
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link to={entry.action.route}>
              {entry.action.label}
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      )}
    </article>
  )
}

function visibleEntries(): GlossaryEntry[] {
  return GLOSSARY_ENTRIES.filter((entry) => {
    if (!entry.feature) return true
    return Boolean(features[entry.feature])
  })
}

function filterEntries(entries: GlossaryEntry[], search: string): GlossaryEntry[] {
  const q = search.trim().toLowerCase()
  if (!q) return entries
  return entries.filter((entry) => {
    const haystack = `${entry.name} ${entry.summary} ${entry.whenToUse}`.toLowerCase()
    return haystack.includes(q)
  })
}
