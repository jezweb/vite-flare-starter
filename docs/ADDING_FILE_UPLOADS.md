# Adding File Uploads with R2

Guide for extending vite-flare-starter's avatar upload pattern to general file uploads using Cloudflare R2.

**Time estimate**: 2-3 hours for basic uploads, 4-6 hours with presigned URLs and processing

---

## Current State

The starter already has:
- R2 bucket configured (`AVATARS` binding)
- Avatar upload endpoint (`/api/avatar`)
- Avatar serving (`/api/avatar/:userId`)

This guide extends that pattern to general file uploads.

---

## What You'll Build

| Feature | Description |
|---------|-------------|
| **File Upload API** | Upload any file type with validation |
| **Presigned URLs** | Direct browser-to-R2 uploads |
| **File Management** | List, delete, get signed download URLs |
| **Image Processing** | Optional: resize, thumbnails via Workers |

---

## Setup

### 1. Create Files Bucket

```bash
npx wrangler r2 bucket create vite-flare-starter-files
```

### 2. Add Binding

```jsonc
// wrangler.jsonc
{
  "r2_buckets": [
    { "binding": "AVATARS", "bucket_name": "vite-flare-starter-avatars" },
    { "binding": "FILES", "bucket_name": "vite-flare-starter-files" }
  ]
}
```

### 3. Update Types

```typescript
// Add to your Env interface
interface Env {
  FILES: R2Bucket
}
```

---

## Database Schema

Track uploaded files:

```typescript
// src/server/modules/files/db/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { user } from '@/server/modules/auth/db/schema'

export const files = sqliteTable('files', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),

  // Optional: for organization-scoped files
  // organizationId: text('organizationId').references(() => organization.id, { onDelete: 'cascade' }),

  // File metadata
  name: text('name').notNull(),           // Original filename
  key: text('key').notNull().unique(),    // R2 object key
  mimeType: text('mimeType').notNull(),
  size: integer('size').notNull(),        // Bytes

  // Optional categorization
  folder: text('folder'),                  // Virtual folder path
  isPublic: integer('isPublic', { mode: 'boolean' }).default(false),

  // Timestamps
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

// Add to central schema exports
export { files } from '@/server/modules/files/db/schema'
```

---

## File Upload Routes

```typescript
// src/server/modules/files/routes.ts
import { Hono } from 'hono'
import { eq, and, desc } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { files } from './db/schema'

const app = new Hono<AuthContext>()

app.use('*', authMiddleware)

// Configuration
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
]

// List user's files
app.get('/', async (c) => {
  const db = drizzle(c.env.DB)
  const userId = c.get('userId')
  const folder = c.req.query('folder')

  let query = db
    .select()
    .from(files)
    .where(
      folder
        ? and(eq(files.userId, userId), eq(files.folder, folder))
        : eq(files.userId, userId)
    )
    .orderBy(desc(files.createdAt))

  const results = await query.all()

  return c.json({ files: results })
})

// Upload file (multipart form)
app.post('/', async (c) => {
  const db = drizzle(c.env.DB)
  const userId = c.get('userId')

  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  const folder = formData.get('folder') as string | null

  if (!file) {
    return c.json({ error: 'No file provided' }, 400)
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB` }, 400)
  }

  // Validate file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return c.json({ error: `File type not allowed: ${file.type}` }, 400)
  }

  // Generate unique key
  const ext = file.name.split('.').pop() || 'bin'
  const key = `${userId}/${folder || 'uploads'}/${crypto.randomUUID()}.${ext}`

  // Upload to R2
  await c.env.FILES.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type,
    },
    customMetadata: {
      originalName: file.name,
      uploadedBy: userId,
    },
  })

  // Record in database
  const [record] = await db
    .insert(files)
    .values({
      userId,
      name: file.name,
      key,
      mimeType: file.type,
      size: file.size,
      folder: folder || 'uploads',
    })
    .returning()

  return c.json({ file: record }, 201)
})

// Get file metadata
app.get('/:id', async (c) => {
  const db = drizzle(c.env.DB)
  const userId = c.get('userId')
  const fileId = c.req.param('id')

  const file = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .get()

  if (!file) {
    return c.json({ error: 'File not found' }, 404)
  }

  return c.json({ file })
})

// Download file
app.get('/:id/download', async (c) => {
  const db = drizzle(c.env.DB)
  const userId = c.get('userId')
  const fileId = c.req.param('id')

  const file = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .get()

  if (!file) {
    return c.json({ error: 'File not found' }, 404)
  }

  const object = await c.env.FILES.get(file.key)

  if (!object) {
    return c.json({ error: 'File not found in storage' }, 404)
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${file.name}"`,
      'Content-Length': file.size.toString(),
    },
  })
})

// Delete file
app.delete('/:id', async (c) => {
  const db = drizzle(c.env.DB)
  const userId = c.get('userId')
  const fileId = c.req.param('id')

  const file = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .get()

  if (!file) {
    return c.json({ error: 'File not found' }, 404)
  }

  // Delete from R2
  await c.env.FILES.delete(file.key)

  // Delete from database
  await db.delete(files).where(eq(files.id, fileId))

  return c.json({ success: true })
})

export default app
```

---

## Presigned URLs (Direct Upload)

For large files, upload directly to R2 without going through your Worker:

```typescript
// src/server/modules/files/routes.ts (add to existing)

// Get presigned upload URL
app.post('/presigned-upload', zValidator('json', z.object({
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
  folder: z.string().optional(),
})), async (c) => {
  const db = drizzle(c.env.DB)
  const userId = c.get('userId')
  const { filename, mimeType, size, folder } = c.req.valid('json')

  // Validate
  if (size > MAX_FILE_SIZE) {
    return c.json({ error: 'File too large' }, 400)
  }

  if (!ALLOWED_TYPES.includes(mimeType)) {
    return c.json({ error: 'File type not allowed' }, 400)
  }

  // Generate key
  const ext = filename.split('.').pop() || 'bin'
  const key = `${userId}/${folder || 'uploads'}/${crypto.randomUUID()}.${ext}`

  // Create database record (pending)
  const [record] = await db
    .insert(files)
    .values({
      userId,
      name: filename,
      key,
      mimeType,
      size,
      folder: folder || 'uploads',
    })
    .returning()

  // Generate presigned URL (R2 presigned URLs via S3-compatible API)
  // Note: Requires additional setup - see R2 docs
  const uploadUrl = await generatePresignedUploadUrl(c.env, key, mimeType)

  return c.json({
    file: record,
    uploadUrl,
    key,
  })
})

// Helper for presigned URLs
async function generatePresignedUploadUrl(
  env: Env,
  key: string,
  contentType: string
): Promise<string> {
  // Option 1: Use R2's S3-compatible API with credentials
  // Option 2: Use a simple signed token approach

  // Simple signed approach (upload through Worker but with pre-validation)
  const token = await signUploadToken(env, key, contentType)
  return `/api/files/upload-with-token?token=${token}`
}
```

---

## Client Integration

### File Upload Hook

```typescript
// src/client/modules/files/hooks/useFiles.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface FileRecord {
  id: string
  name: string
  key: string
  mimeType: string
  size: number
  folder: string | null
  createdAt: string
}

export function useFiles(folder?: string) {
  const params = new URLSearchParams()
  if (folder) params.set('folder', folder)

  return useQuery({
    queryKey: ['files', folder],
    queryFn: async (): Promise<{ files: FileRecord[] }> => {
      const res = await fetch(`/api/files?${params}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch files')
      return res.json()
    },
  })
}

export function useUploadFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ file, folder }: { file: File; folder?: string }) => {
      const formData = new FormData()
      formData.append('file', file)
      if (folder) formData.append('folder', folder)

      const res = await fetch('/api/files', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Upload failed')
      }

      return res.json()
    },
    onSuccess: (_, { folder }) => {
      queryClient.invalidateQueries({ queryKey: ['files', folder] })
    },
  })
}

export function useDeleteFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (fileId: string) => {
      const res = await fetch(`/api/files/${fileId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Delete failed')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] })
    },
  })
}
```

### File Upload Component

```tsx
// src/client/modules/files/components/FileUploader.tsx
import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Upload, File, X } from 'lucide-react'
import { useUploadFile } from '../hooks/useFiles'
import { cn } from '@/lib/utils'

interface FileUploaderProps {
  folder?: string
  onUpload?: (file: FileRecord) => void
  accept?: Record<string, string[]>
  maxSize?: number
}

export function FileUploader({
  folder,
  onUpload,
  accept = { 'image/*': [], 'application/pdf': [] },
  maxSize = 50 * 1024 * 1024,
}: FileUploaderProps) {
  const upload = useUploadFile()
  const [progress, setProgress] = useState(0)

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      try {
        setProgress(50) // Simulated - real progress needs XHR
        const result = await upload.mutateAsync({ file, folder })
        setProgress(100)
        onUpload?.(result.file)
      } catch (error) {
        console.error('Upload failed:', error)
      } finally {
        setTimeout(() => setProgress(0), 1000)
      }
    }
  }, [upload, folder, onUpload])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxSize,
    multiple: true,
  })

  return (
    <div
      {...getRootProps()}
      className={cn(
        'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
        isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
        upload.isPending && 'opacity-50 pointer-events-none'
      )}
    >
      <input {...getInputProps()} />
      <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
      <p className="mt-2 text-sm text-muted-foreground">
        {isDragActive
          ? 'Drop files here...'
          : 'Drag & drop files, or click to select'}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Max size: {maxSize / 1024 / 1024}MB
      </p>
      {progress > 0 && (
        <Progress value={progress} className="mt-4" />
      )}
    </div>
  )
}
```

Install dropzone:

```bash
pnpm add react-dropzone
```

---

## Image Processing (Optional)

Resize images on upload using Cloudflare Images or manual processing:

```typescript
// src/server/lib/image-processing.ts

export async function processImage(
  file: ArrayBuffer,
  options: {
    maxWidth?: number
    maxHeight?: number
    quality?: number
    format?: 'jpeg' | 'png' | 'webp'
  }
): Promise<ArrayBuffer> {
  // Option 1: Use Cloudflare Images (requires binding)
  // Option 2: Use a library like sharp via WASM
  // Option 3: Client-side resize before upload

  // For now, return original - implement based on needs
  return file
}

export async function generateThumbnail(
  env: Env,
  key: string,
  width: number = 200
): Promise<string> {
  // Cloudflare Image Resizing (if configured)
  // return `/cdn-cgi/image/width=${width}/${key}`

  // Or generate and store thumbnail
  const thumbnailKey = key.replace(/(\.[^.]+)$/, `-thumb$1`)
  // Process and store...
  return thumbnailKey
}
```

---

## Public vs Private Files

For public files (shareable links):

```typescript
// Add to routes
app.get('/public/:key{.+}', async (c) => {
  const key = c.req.param('key')
  const db = drizzle(c.env.DB)

  // Check if file is public
  const file = await db
    .select()
    .from(files)
    .where(and(eq(files.key, key), eq(files.isPublic, true)))
    .get()

  if (!file) {
    return c.json({ error: 'File not found' }, 404)
  }

  const object = await c.env.FILES.get(key)

  if (!object) {
    return c.json({ error: 'File not found' }, 404)
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': file.mimeType,
      'Cache-Control': 'public, max-age=31536000',
    },
  })
})

// Toggle public status
app.patch('/:id/visibility', zValidator('json', z.object({
  isPublic: z.boolean(),
})), async (c) => {
  const db = drizzle(c.env.DB)
  const userId = c.get('userId')
  const fileId = c.req.param('id')
  const { isPublic } = c.req.valid('json')

  const file = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .get()

  if (!file) {
    return c.json({ error: 'File not found' }, 404)
  }

  await db
    .update(files)
    .set({ isPublic })
    .where(eq(files.id, fileId))

  const publicUrl = isPublic
    ? `${c.req.url.split('/api')[0]}/api/files/public/${file.key}`
    : null

  return c.json({ isPublic, publicUrl })
})
```

---

## Organization-Scoped Files

For multi-tenant file storage:

```typescript
// Add organizationId to schema (see ADDING_ORGANIZATIONS.md)

// Middleware to scope files
app.use('*', requireOrganization)

// Modify queries
const results = await db
  .select()
  .from(files)
  .where(
    and(
      eq(files.organizationId, c.get('organizationId')),
      folder ? eq(files.folder, folder) : undefined
    )
  )
  .all()
```

---

## Storage Quotas

Track and enforce storage limits:

```typescript
// Check quota before upload
async function checkStorageQuota(
  db: DrizzleD1Database,
  userId: string,
  newFileSize: number,
  maxStorage: number = 1024 * 1024 * 1024 // 1GB default
): Promise<{ allowed: boolean; used: number; remaining: number }> {
  const result = await db
    .select({ total: sql<number>`SUM(size)` })
    .from(files)
    .where(eq(files.userId, userId))
    .get()

  const used = result?.total || 0
  const remaining = maxStorage - used

  return {
    allowed: newFileSize <= remaining,
    used,
    remaining,
  }
}

// Use in upload route
const quota = await checkStorageQuota(db, userId, file.size)
if (!quota.allowed) {
  return c.json({
    error: 'Storage quota exceeded',
    used: quota.used,
    remaining: quota.remaining,
  }, 403)
}
```

---

## Common Gotchas

### 1. File Size Limits

Workers have a 100MB request body limit. For larger files, use presigned URLs.

### 2. Streaming Large Files

Use `object.body` (ReadableStream) instead of `object.arrayBuffer()` for large files.

### 3. CORS for Direct Upload

Configure R2 CORS for presigned URL uploads:

```bash
npx wrangler r2 bucket cors put vite-flare-starter-files --rules '[
  {
    "allowedOrigins": ["https://your-app.workers.dev"],
    "allowedMethods": ["PUT"],
    "allowedHeaders": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]'
```

### 4. Content-Type Detection

Don't trust client-provided MIME types for security-sensitive operations. Verify file signatures (magic bytes) for critical files.

---

## Resources

- [R2 Documentation](https://developers.cloudflare.com/r2/)
- [R2 Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Cloudflare Images](https://developers.cloudflare.com/images/)
- [react-dropzone](https://react-dropzone.js.org/)

---

**Created**: 2026-01-03
**Author**: Jeremy Dawes (Jezweb)
