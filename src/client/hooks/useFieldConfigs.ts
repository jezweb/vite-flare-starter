/**
 * useFieldConfigs — TanStack Query hooks for /api/field-configs (#62(2)).
 *
 * Pairs with <DynamicFieldRenderer>: fetch a type's configs, render the
 * form, PATCH the entity's `fields` blob. See the kanban-demo card
 * sheet for the worked example.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'
import type { FieldConfigLike } from '@/client/components/DynamicFieldRenderer'

export interface FieldConfigDto extends FieldConfigLike {
  entityType: string
  sortOrder: number
  createdAt: number
  updatedAt: number
}

const keyFor = (entityType?: string) => ['field-configs', entityType ?? 'all'] as const

export function useFieldConfigs(entityType?: string) {
  return useQuery({
    queryKey: keyFor(entityType),
    queryFn: () =>
      apiClient.get<{ configs: FieldConfigDto[] }>('/api/field-configs', {
        params: entityType ? { entityType } : undefined,
      }),
  })
}

export interface CreateFieldConfigInput {
  entityType: string
  fieldName: string
  label: string
  fieldType: FieldConfigLike['fieldType']
  options?: string[]
  required?: boolean
  placeholder?: string
  helpText?: string
  sortOrder?: number
}

export function useCreateFieldConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateFieldConfigInput) =>
      apiClient.post<FieldConfigDto>('/api/field-configs', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['field-configs'] }),
  })
}

export function useUpdateFieldConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<CreateFieldConfigInput>) =>
      apiClient.patch<FieldConfigDto>(`/api/field-configs/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['field-configs'] }),
  })
}

export function useDeleteFieldConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/field-configs/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['field-configs'] }),
  })
}
