import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { files, type File } from './db/schema'

// Constants
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'application/json',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/zip',
  'application/x-zip-compressed',
]

// Validation schemas
const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  folder: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
})

const listQuerySchema = z.object({
  folder: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
})

const app = new Hono<AuthContext>()

// Apply auth to all routes
app.use('*', authMiddleware)

/**
 * List files for the authenticated user
 */
app.get('/', zValidator('query', listQuerySchema), async (c) => {
  const userId = c.get('userId')
  const { folder, limit, offset } = c.req.valid('query')
  const db = drizzle(c.env.DB)

  const conditions = [eq(files.userId, userId)]
  if (folder) {
    conditions.push(eq(files.folder, folder))
  }

  const userFiles = await db
    .select()
    .from(files)
    .where(and(...conditions))
    .orderBy(desc(files.createdAt))
    .limit(limit)
    .offset(offset)

  // Get total count for pagination
  const countResult = await db
    .select({ count: files.id })
    .from(files)
    .where(and(...conditions))

  return c.json({
    files: userFiles,
    total: countResult.length,
    limit,
    offset,
  })
})

/**
 * Get a single file by ID
 */
app.get('/:id', async (c) => {
  const userId = c.get('userId')
  const fileId = c.req.param('id')
  const db = drizzle(c.env.DB)

  const [file] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .limit(1)

  if (!file) {
    return c.json({ error: 'File not found' }, 404)
  }

  return c.json({ file })
})

/**
 * Upload a new file
 */
app.post('/', async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB)

  // Parse multipart form data
  const formData = await c.req.formData()
  const file = formData.get('file') as globalThis.File | null
  const folder = (formData.get('folder') as string) || '/'
  const isPublic = formData.get('isPublic') === 'true'

  if (!file) {
    return c.json({ error: 'No file provided' }, 400)
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` }, 400)
  }

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return c.json({ error: `File type not allowed: ${file.type}` }, 400)
  }

  // Generate unique key for R2
  const fileId = crypto.randomUUID()
  const ext = file.name.split('.').pop() || 'bin'
  const key = `files/${userId}/${fileId}.${ext}`

  // Upload to R2
  const arrayBuffer = await file.arrayBuffer()
  await c.env.FILES.put(key, arrayBuffer, {
    httpMetadata: {
      contentType: file.type,
    },
    customMetadata: {
      userId,
      originalName: file.name,
    },
  })

  // Create database record
  const [newFile] = await db
    .insert(files)
    .values({
      id: fileId,
      userId,
      name: file.name,
      key,
      mimeType: file.type,
      size: file.size,
      folder: folder.startsWith('/') ? folder : `/${folder}`,
      isPublic,
      publicUrl: isPublic ? `/api/files/${fileId}/download` : null,
    })
    .returning()

  return c.json({ file: newFile }, 201)
})

/**
 * Update file metadata
 */
app.patch('/:id', zValidator('json', updateSchema), async (c) => {
  const userId = c.get('userId')
  const fileId = c.req.param('id')
  const updates = c.req.valid('json')
  const db = drizzle(c.env.DB)

  // Verify ownership
  const [existingFile] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .limit(1)

  if (!existingFile) {
    return c.json({ error: 'File not found' }, 404)
  }

  // Build update object
  const updateData: Partial<File> = {
    updatedAt: new Date(),
  }

  if (updates.name !== undefined) {
    updateData.name = updates.name
  }
  if (updates.folder !== undefined) {
    updateData.folder = updates.folder.startsWith('/') ? updates.folder : `/${updates.folder}`
  }
  if (updates.isPublic !== undefined) {
    updateData.isPublic = updates.isPublic
    updateData.publicUrl = updates.isPublic ? `/api/files/${fileId}/download` : null
  }

  const [updatedFile] = await db
    .update(files)
    .set(updateData)
    .where(eq(files.id, fileId))
    .returning()

  return c.json({ file: updatedFile })
})

/**
 * Delete a file
 */
app.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const fileId = c.req.param('id')
  const db = drizzle(c.env.DB)

  // Get file to find R2 key
  const [file] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .limit(1)

  if (!file) {
    return c.json({ error: 'File not found' }, 404)
  }

  // Delete from R2
  await c.env.FILES.delete(file.key)

  // Delete database record
  await db.delete(files).where(eq(files.id, fileId))

  return c.json({ success: true })
})

/**
 * Download a file (streaming)
 */
app.get('/:id/download', async (c) => {
  const fileId = c.req.param('id')
  const db = drizzle(c.env.DB)

  // Get file metadata
  const [file] = await db.select().from(files).where(eq(files.id, fileId)).limit(1)

  if (!file) {
    return c.json({ error: 'File not found' }, 404)
  }

  // Check access - either owner or public file
  const userId = c.get('userId')
  if (!file.isPublic && file.userId !== userId) {
    return c.json({ error: 'Access denied' }, 403)
  }

  // Get from R2
  const object = await c.env.FILES.get(file.key)
  if (!object) {
    return c.json({ error: 'File not found in storage' }, 404)
  }

  // Stream the file
  return new Response(object.body, {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': file.size.toString(),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.name)}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  })
})

/**
 * Get list of folders for the user
 */
app.get('/folders/list', async (c) => {
  const userId = c.get('userId')
  const db = drizzle(c.env.DB)

  // Get distinct folders
  const userFiles = await db
    .select({ folder: files.folder })
    .from(files)
    .where(eq(files.userId, userId))
    .groupBy(files.folder)

  const folders = [...new Set(userFiles.map((f) => f.folder || '/'))]
    .filter(Boolean)
    .sort()

  return c.json({ folders })
})

export default app
