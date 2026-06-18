import { useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useFiles, useFolders, formatFileSize } from '../hooks/useFiles'
import { FileUploader } from '../components/FileUploader'
import { FileList } from '../components/FileList'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { StatGrid } from '@/components/ui/stat-grid'

export function FilesPage() {
  const [currentFolder, setCurrentFolder] = useState<string>('all')
  const [uploadOpen, setUploadOpen] = useState(false)

  const { data, isLoading, refetch } = useFiles({
    folder: currentFolder === 'all' ? undefined : currentFolder,
  })
  const { data: foldersData } = useFolders()

  const folders = foldersData?.folders || ['/']
  const files = data?.files || []

  // Calculate storage usage
  const totalSize = files.reduce((acc, f) => acc + f.size, 0)

  return (
    <PageContainer type="queue">
      <div data-tour="files-list">
        <PageHeader
          title="Files"
          subtitle="PDFs, images, docs and more — your AI can read them and use them in answers."
          trailing={
            <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Upload
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Upload files</DialogTitle>
                  <DialogDescription>
                    Drag and drop files or click to browse. Max 10MB per file.
                  </DialogDescription>
                </DialogHeader>
                <FileUploader
                  folder={currentFolder === 'all' ? '/' : currentFolder}
                  onUploadComplete={() => {
                    refetch()
                    setUploadOpen(false)
                  }}
                />
              </DialogContent>
            </Dialog>
          }
        />
      </div>

      <StatGrid
        items={[
          { label: 'Files', value: files.length },
          { label: 'Storage', value: formatFileSize(totalSize) },
          { label: 'Folders', value: folders.length },
        ]}
      />

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Your Files</CardTitle>
              <CardDescription>View and manage uploaded files</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={currentFolder} onValueChange={setCurrentFolder}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Select folder" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Folders</SelectItem>
                  {folders.map((folder) => (
                    <SelectItem key={folder} value={folder}>
                      {folder === '/' ? 'Root' : folder}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <FileList
            files={files}
            isLoading={isLoading}
            folder={currentFolder}
            onUploadClick={() => setUploadOpen(true)}
          />
        </CardContent>
      </Card>
    </PageContainer>
  )
}
