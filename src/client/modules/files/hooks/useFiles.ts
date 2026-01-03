import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/client/lib/api-client'

export interface FileItem {
  id: string
  userId: string
  name: string
  key: string
  mimeType: string
  size: number
  folder: string
  isPublic: boolean
  publicUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface FilesResponse {
  files: FileItem[]
  total: number
  limit: number
  offset: number
}

interface ListFilesParams {
  folder?: string
  limit?: number
  offset?: number
}

interface UpdateFileParams {
  id: string
  name?: string
  folder?: string
  isPublic?: boolean
}

/**
 * Hook to list files for the current user
 */
export function useFiles(params: ListFilesParams = {}) {
  const { folder, limit = 50, offset = 0 } = params

  return useQuery({
    queryKey: ['files', { folder, limit, offset }],
    queryFn: async () => {
      return apiClient.get<FilesResponse>('/api/files', {
        params: { folder, limit, offset },
      })
    },
  })
}

/**
 * Hook to get folders list
 */
export function useFolders() {
  return useQuery({
    queryKey: ['files', 'folders'],
    queryFn: async () => {
      return apiClient.get<{ folders: string[] }>('/api/files/folders/list')
    },
  })
}

/**
 * Hook to upload a file
 */
export function useUploadFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      file,
      folder = '/',
      isPublic = false,
    }: {
      file: File
      folder?: string
      isPublic?: boolean
    }) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', folder)
      formData.append('isPublic', isPublic.toString())

      return apiClient.upload<{ file: FileItem }>('/api/files', formData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] })
    },
  })
}

/**
 * Hook to update file metadata
 */
export function useUpdateFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdateFileParams) => {
      return apiClient.patch<{ file: FileItem }>(`/api/files/${id}`, updates)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] })
    },
  })
}

/**
 * Hook to delete a file
 */
export function useDeleteFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/files/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] })
    },
  })
}

/**
 * Utility function to format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

/**
 * Get icon type based on MIME type
 */
export function getFileIcon(mimeType: string): 'image' | 'document' | 'code' | 'archive' | 'file' {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf') return 'document'
  if (mimeType === 'application/json' || mimeType.includes('text/')) return 'code'
  if (mimeType.includes('zip')) return 'archive'
  return 'file'
}
