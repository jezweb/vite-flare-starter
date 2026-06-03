/**
 * MemorySection (settings) — user-scope memory editor.
 *
 * Wraps the project MemorySection component with scope='user' bound
 * to the current user's id. Shown on Settings → Memory tab.
 */
import { useSession } from '@/client/lib/auth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MemorySection as ProjectMemorySection } from '@/client/modules/projects/components/MemorySection'
import { apiClient } from '@/client/lib/api-client'
import { Brain } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'

export function MemorySection() {
  const { data: session, isPending } = useSession()
  const queryClient = useQueryClient()

  const { data: modeData } = useQuery({
    queryKey: ['memory-user-mode'],
    queryFn: () =>
      apiClient.get<{ memoryUpdateMode: 'ask' | 'auto' | 'never' }>('/api/memories/user-mode'),
    enabled: !!session?.user,
  })

  const updateMode = useMutation({
    mutationFn: (memoryUpdateMode: 'ask' | 'auto' | 'never') =>
      apiClient.patch<{ success: boolean; memoryUpdateMode: 'ask' | 'auto' | 'never' }>(
        '/api/memories/user-mode',
        { memoryUpdateMode }
      ),
    onSuccess: (_, mode) => {
      queryClient.setQueryData(['memory-user-mode'], { memoryUpdateMode: mode })
      toast.success('Memory mode updated')
    },
    onError: () => toast.error('Could not update mode'),
  })

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Spinner size="lg" className="mr-2" />
        Loading…
      </div>
    )
  }

  if (!session?.user) {
    return null
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Brain className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Personal memory</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Persistent memory the AI holds about you, across all conversations and projects. Use the
          privacy toggle for sensitive entries that should never auto-inject.
        </p>
      </div>

      <ProjectMemorySection
        scope="user"
        scopeId={session.user.id}
        emptyHint="No personal memories yet. The AI can add them as you chat (via the memory_add tool), or you can create them manually here."
        privacyLabel="Only you"
        mode={modeData?.memoryUpdateMode ?? 'ask'}
        onModeChange={(next) => updateMode.mutate(next)}
      />
    </div>
  )
}
