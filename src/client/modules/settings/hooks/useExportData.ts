/**
 * Hook for exporting user data
 *
 * Downloads all user data as a JSON file.
 */
import { useMutation } from '@tanstack/react-query'

/**
 * Export user data and trigger download
 */
async function exportData(): Promise<void> {
  const response = await fetch('/api/settings/export', {
    method: 'GET',
    credentials: 'include',
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Export failed' })) as { error?: string }
    throw new Error(errorData.error || 'Failed to export data')
  }

  // Get the filename from Content-Disposition header or use default
  const contentDisposition = response.headers.get('Content-Disposition')
  let filename = `user-data-export-${new Date().toISOString().split('T')[0]}.json`

  if (contentDisposition) {
    const match = contentDisposition.match(/filename="(.+)"/)
    if (match && match[1]) {
      filename = match[1]
    }
  }

  // Get the JSON data
  const data = await response.json()

  // Create a blob and trigger download
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // Clean up the URL
  URL.revokeObjectURL(url)
}

/**
 * Hook for exporting user data
 */
export function useExportData() {
  return useMutation({
    mutationFn: exportData,
  })
}
