import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc, isNull, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { authMiddleware, type AuthContext } from '@/server/middleware/auth'
import { files, type File } from './db/schema'
import { logActivityFromContext } from '@/server/modules/activity/log'
import { stripImageMetadata } from '@/server/lib/strip-exif'

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
  projectId: z.string().nullable().optional(),
})

const listQuerySchema = z.object({
  folder: z.string().optional(),
  /**
   * Optional project filter. Pass a project UUID to fetch files scoped to
   * that project. Pass the literal "_none" to fetch only un-scoped files
   * (general/personal). Omit to fetch all of the user's files.
   */
  projectId: z.string().optional(),
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
  const { folder, projectId, limit, offset } = c.req.valid('query')
  const db = drizzle(c.env.DB)

  const conditions = [eq(files.userId, userId)]
  if (folder) {
    conditions.push(eq(files.folder, folder))
  }
  if (projectId === '_none') {
    // Files that don't belong to any project (default for the global Files page)
    conditions.push(isNull(files.projectId))
  } else if (projectId) {
    conditions.push(eq(files.projectId, projectId))
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

  // Total bytes for capacity meter (Phase 2 — per-project)
  const totalBytesRow = await db
    .select({ total: sql<number>`COALESCE(SUM(${files.size}), 0)` })
    .from(files)
    .where(and(...conditions))
  const totalBytes = totalBytesRow[0]?.total ?? 0

  return c.json({
    files: userFiles,
    total: countResult.length,
    totalBytes,
    limit,
    offset,
  })
})

/**
 * Download a file directly by R2 key (user-scoped).
 * Used by agent tools (docx generation, image transform, etc.) that write
 * to R2 without creating a D1 metadata record.
 * Must be registered BEFORE /:id to avoid Hono's greedy param matching.
 */
app.get('/download/*', async (c) => {
  const userId = c.get('userId')
  const rawKey = c.req.path.replace(/^\/api\/files\/download\//, '')
  const decoded = decodeURIComponent(rawKey)
  // Accept the current scoped key format `users/${userId}/...` plus two
  // legacy formats that may still be in some R2 buckets:
  // - `generated/${userId}/...` from very old generate_image tool
  // - `files/${userId}/...` from uploads before the 2026-04-20 migration
  // All resolve to the same physical R2 object when we normalise.
  const isScoped = decoded.startsWith(`users/${userId}/`)
  const isLegacyGenerated = decoded.startsWith(`generated/${userId}/`)
  const isLegacyUpload = decoded.startsWith(`files/${userId}/`)
  if (!decoded || (!isScoped && !isLegacyGenerated && !isLegacyUpload)) {
    return c.json({ error: 'Access denied' }, 403)
  }
  const bucket = c.env.FILES as R2Bucket | undefined
  if (!bucket) return c.json({ error: 'Storage not configured' }, 501)
  // Try the key as given first; fall back to looking under the new location
  // in case a legacy URL is hit after a re-generation migrated the object.
  let object = await bucket.get(decoded)
  if (!object && isLegacyGenerated) {
    // Also try the new scoped path in case of a future migration.
    const migrated = `users/${userId}/generated/${decoded.slice(`generated/${userId}/`.length)}`
    object = await bucket.get(migrated)
  }
  if (!object) return c.json({ error: 'Not found' }, 404)
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${decoded.split('/').pop()}"`,
      'Cache-Control': 'private, max-age=3600',
    },
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
  const projectIdRaw = formData.get('projectId')
  const projectId = typeof projectIdRaw === 'string' && projectIdRaw.trim() ? projectIdRaw : null

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

  // Generate unique key for R2. Lives under users/<userId>/uploads/ so the
  // agent's fs_* tools (scoped to users/<userId>/) can see UI-uploaded files
  // alongside agent outputs. Legacy keys at files/<userId>/... are handled
  // by the migration script and the download route's backward-compat check.
  const fileId = crypto.randomUUID()
  const ext = file.name.split('.').pop() || 'bin'
  const key = `users/${userId}/uploads/${fileId}.${ext}`

  // Upload to R2 — strip EXIF / XMP from JPEGs first so GPS coordinates
  // and Photoshop IPTC blocks don't leak with the file. JFIF + ICC kept
  // (colour accuracy). Non-JPEG images pass through unchanged. Set
  // STRIP_IMAGE_METADATA=false to disable.
  const rawBuffer = await file.arrayBuffer()
  const stripEnabled = ((c.env as unknown as { STRIP_IMAGE_METADATA?: string }).STRIP_IMAGE_METADATA) !== 'false'
  const arrayBuffer = stripEnabled ? stripImageMetadata(rawBuffer, file.type) : rawBuffer
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
      projectId,
      name: file.name,
      key,
      mimeType: file.type,
      size: file.size,
      folder: folder.startsWith('/') ? folder : `/${folder}`,
      isPublic,
      publicUrl: isPublic ? `/api/files/${fileId}/download` : null,
    })
    .returning()

  await logActivityFromContext(c, {
    action: 'create',
    entityType: 'file',
    entityId: fileId,
    entityName: file.name,
    metadata: { mimeType: file.type, size: file.size, folder },
  })

  // Fire-and-forget ingest into Vectorize. Runs in the background via
  // executionCtx.waitUntil so the upload response returns immediately
  // while chunking + embedding happen after the request ends.
  // Falls back to a direct await when waitUntil isn't available (tests).
  if ((c.env as unknown as { VECTORS?: VectorizeIndex }).VECTORS) {
    const { ingestFile } = await import('./ingest')
    const task = ingestFile(
      c.env as unknown as Parameters<typeof ingestFile>[0],
      fileId,
      userId,
    ).catch((err) => {
      console.error(JSON.stringify({ event: 'ingest_failed_async', fileId, error: String(err) }))
    })
    try {
      c.executionCtx.waitUntil(task)
    } catch {
      // waitUntil not available — let it run to completion.
      await task
    }
  }

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
  if (updates.projectId !== undefined) {
    updateData.projectId = updates.projectId
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

  // Delete ingested vectors before dropping the row (needs indexChunks).
  if ((c.env as unknown as { VECTORS?: VectorizeIndex }).VECTORS && file.indexStatus === 'indexed') {
    try {
      const { deleteFileVectors } = await import('./ingest')
      await deleteFileVectors(
        c.env as unknown as Parameters<typeof deleteFileVectors>[0],
        fileId,
        userId,
      )
    } catch (err) {
      console.error(JSON.stringify({ event: 'vector_cleanup_failed', fileId, error: String(err) }))
    }
  }

  // Delete database record
  await db.delete(files).where(eq(files.id, fileId))

  await logActivityFromContext(c, {
    action: 'delete',
    entityType: 'file',
    entityId: fileId,
    entityName: file.name,
  })

  return c.json({ success: true })
})

/**
 * POST /:id/reindex — re-run the ingest pipeline for a file.
 * Handy when the content changed (file rename doesn't trigger) or when
 * the initial ingest failed (e.g. Vectorize not yet configured).
 */
app.post('/:id/reindex', async (c) => {
  const userId = c.get('userId')
  const fileId = c.req.param('id')

  if (!(c.env as unknown as { VECTORS?: VectorizeIndex }).VECTORS) {
    return c.json({ error: 'Vectorize not configured' }, 501)
  }

  const { ingestFile } = await import('./ingest')
  const result = await ingestFile(
    c.env as unknown as Parameters<typeof ingestFile>[0],
    fileId,
    userId,
  )
  if (result.status === 'failed') {
    return c.json({ error: result.error ?? 'Reindex failed' }, 500)
  }
  return c.json({ success: true, ...result })
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
