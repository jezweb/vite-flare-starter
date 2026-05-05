/**
 * SkillDetailPage — `/dashboard/skills/:slug`
 *
 * Full-width editor for one skill. Replaces the inline-editor-below-
 * grid pattern that didn't scale past ~10 skills (gh #61): the
 * scroll-up-click-scroll-down loop on every edit was a real ergonomic
 * cost on fork-builder volumes after porting an existing skill library.
 *
 * Pairs with `SkillsPage` (the list / catalog). Deep-linkable URL,
 * browser back works, no scroll dance.
 *
 * Delete + revert-to-bundled lives here too — moved out of the list
 * page so the detail surface owns its own destructive actions.
 */
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { PageLoading } from '@/client/components/PageState'
import { EmptyState } from '@/client/components/EmptyState'
import { Zap } from 'lucide-react'

import { useSkillsList, useDeleteSkill } from '../hooks/useSkills'
import { SkillEditor } from '../components/SkillEditor'
import { formatSkillName, formatSkillSlash } from '@/shared/format/skill'

export function SkillDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { data, isLoading } = useSkillsList()
  const remove = useDeleteSkill()
  const [deleteOpen, setDeleteOpen] = useState(false)

  const skill = data?.skills.find((s) => s.name === slug) ?? null

  if (isLoading) {
    return (
      <PageContainer type="detail">
        <PageLoading variant="detail" />
      </PageContainer>
    )
  }

  if (!skill) {
    return (
      <PageContainer type="detail">
        <PageHeader
          title="Skill not found"
          subtitle={`No skill named ${slug ? `"${slug}"` : 'that'} exists, or it was deleted.`}
          trailing={
            <Button asChild variant="outline">
              <Link to="/dashboard/skills">
                <ArrowLeft className="mr-1.5 size-4" />
                Back to skills
              </Link>
            </Button>
          }
        />
        <EmptyState
          icon={Zap}
          title="Skill not found"
          description="The skill may have been deleted or renamed. Head back to the skills list to find what's available."
          action={{
            label: 'Back to skills',
            onClick: () => navigate('/dashboard/skills'),
          }}
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer type="detail">
      <div className="-mb-2 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/dashboard/skills">
            <ArrowLeft className="mr-1 size-4" />
            Back to skills
          </Link>
        </Button>
        {skill.isPersonal && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-1 size-3.5 text-destructive" />
            Revert to bundled
          </Button>
        )}
      </div>

      <PageHeader
        title={formatSkillName(skill.name)}
        docTitle={formatSkillName(skill.name)}
        trailing={
          <code className="rounded bg-muted px-2 py-1 text-xs font-mono text-muted-foreground">
            {formatSkillSlash(skill.name)}
          </code>
        }
      />

      <SkillEditor key={skill.name} name={skill.name} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert "{skill.name}" to the bundled version?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes your personal override from R2. The bundled version (shipped with the starter) takes back over. Cannot be undone — but you can re-edit afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                remove.mutate(skill.name, {
                  onSuccess: () => {
                    toast.success(`Reverted "${skill.name}" to bundled`)
                    setDeleteOpen(false)
                    navigate('/dashboard/skills')
                  },
                  onError: (err) =>
                    toast.error(err instanceof Error ? err.message : 'Revert failed'),
                })
              }}
            >
              Revert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  )
}

export default SkillDetailPage
