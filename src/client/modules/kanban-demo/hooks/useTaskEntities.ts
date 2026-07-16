/**
 * Kanban demo — TanStack Query hooks against /api/entities.
 *
 * Models a `task` entity:
 *   - title           — used as the card label
 *   - fields.column   — 'todo' | 'doing' | 'done' (defaults to 'todo')
 *   - fields.position — fractional-index string, sort within column
 *                       (cards without one sort last; see ui/kanban.tsx)
 *   - fields.createdBy — 'agent' when created via the entity chat tools
 *                        (provenance badge on the card)
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'

export type TaskColumn = 'todo' | 'doing' | 'done'

export interface TaskEntity {
  id: string
  type: string
  title: string
  status: string
  externalId: string | null
  fields: {
    column?: TaskColumn
    position?: string
    createdBy?: string
    [k: string]: unknown
  }
  createdAt: number
  updatedAt: number
}

interface ListResponse {
  total: number
  entities: TaskEntity[]
}

const QUERY_KEY = ['entities', { type: 'task' }] as const

export function useTaskEntities() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () =>
      apiClient.get<ListResponse>('/api/entities', { params: { type: 'task', limit: 200 } }),
  })
}

interface MoveTaskInput {
  id: string
  column: TaskColumn
  position: string
}

interface MoveContext {
  prev?: ListResponse
}

export function useMoveTask() {
  const queryClient = useQueryClient()
  return useMutation<TaskEntity, Error, MoveTaskInput, MoveContext>({
    mutationFn: ({ id, column, position }) =>
      apiClient.patch<TaskEntity>(`/api/entities/${id}`, {
        fields: { column, position },
      }),
    onMutate: async ({ id, column, position }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY })
      const prev = queryClient.getQueryData<ListResponse>(QUERY_KEY)
      if (prev) {
        queryClient.setQueryData<ListResponse>(QUERY_KEY, {
          ...prev,
          entities: prev.entities.map((e) =>
            e.id === id ? { ...e, fields: { ...e.fields, column, position } } : e
          ),
        })
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(QUERY_KEY, ctx.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}

interface SeedTaskInput {
  title: string
  column: TaskColumn
  position: string
}

export function useSeedDemoTasks() {
  const queryClient = useQueryClient()
  return useMutation<unknown, Error, SeedTaskInput[]>({
    mutationFn: async (tasks) => {
      // Sequential to keep the demo simple — six requests is fine.
      for (const t of tasks) {
        await apiClient.post('/api/entities', {
          type: 'task',
          title: t.title,
          fields: { column: t.column, position: t.position },
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}
