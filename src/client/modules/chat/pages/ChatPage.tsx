/**
 * ChatPage — full-page AI chat interface built on AI Elements.
 *
 * Uses AI Elements primitives (Conversation, Message, PromptInput) for
 * polished chat UI with streaming, tool calls, reasoning, and file
 * attachments. Custom bits (artifacts, documents, inline UI, input
 * takeover, approval UI) are composed inside the AI Elements layout.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionAddAttachments,
} from '@/components/ai-elements/prompt-input'
import {
  PromptInputActionAddScreenshotCountdown,
  PromptInputActionAddScreenCapture,
} from '../components/ScreenCaptureMenuItems'
import { Plus, MessageSquare, MessagesSquare, Download, ArrowDown, Paperclip, FileText, Folder, X, FileQuestion } from 'lucide-react'
import { Link as RouterLink } from 'react-router-dom'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useMediaQuery } from '@/client/hooks/useMediaQuery'
import { useChat, type Message } from '../hooks/useChat'
import { useConversationList, useConversationMessages } from '../hooks/useConversations'
import { useProjectList, useMoveConversation } from '@/client/modules/projects/hooks/useProjects'
import { ConversationSidebar } from '../components/ConversationSidebar'
import { ArtifactSidebar, countArtifactsAndFiles } from '../components/ArtifactSidebar'
import { MessageRenderer } from '../components/MessageRenderer'
import { ModelSelector } from '../components'
import { AttachmentTiles } from '../components/AttachmentTiles'
import { DropOverlay } from '../components/DropOverlay'
import { ActionChips } from '../components/ActionChips'
import { CHAT_EXAMPLES } from '@/shared/config/chat-chips'
import { DEFAULT_MODEL_ID } from '@/shared/config/models'
import { features } from '@/shared/config/features'
import { apiClient } from '@/client/lib/api-client'
import { InputTakeover, isTakeoverElement } from '../components/chat-ui/InputTakeover'
import { hasUiMarker } from '../components/chat-ui/ChatUiElement'
import { AudioRecorder } from '@/client/components/AudioRecorder'
import { usePasteUpload } from '@/client/hooks/usePasteUpload'
import { useSession } from '@/client/lib/auth'
import { cn } from '@/lib/utils'
import { SkillsSlashMenu, parseSlashQuery } from '../components/SkillsSlashMenu'
import { useSkillSummary, type SkillSummary } from '@/client/modules/skills/hooks/useSkills'

/**
 * Accept string for the file input. We widened this beyond images so that
 * docs/PDFs/audio can flow through convertToMarkdown on the server regardless
 * of whether the current model supports vision. Vision-only models still get
 * an image-filtered picker via `acceptFor(model)`.
 */
const ACCEPT_ALL = [
  'image/*',
  'audio/*',
  'video/*',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'application/json',
  'application/xml',
  'application/rtf',
  'application/epub+zip',
].join(',')

function greetingForTime(name: string | undefined): string {
  const hour = new Date().getHours()
  const who = name ? `, ${name}` : ''
  if (hour < 5) return `Good evening${who}`
  if (hour < 12) return `Good morning${who}`
  if (hour < 18) return `Good afternoon${who}`
  return `Good evening${who}`
}

export function ChatPage() {
  const { conversationId: urlConversationId } = useParams<{ conversationId?: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const [model, setModel] = useState<string>(DEFAULT_MODEL_ID)
  const [showSidebar, setShowSidebar] = useState(false)
  const [showArtifactPanel, setShowArtifactPanel] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 768px)')
  // Collapse the artifact panel into a Sheet on mobile — same pattern as the
  // conversation sidebar. On tablets (768px+) it docks inline on the right.
  const isLargeScreen = useMediaQuery('(min-width: 1024px)')

  // Share Target: when shared from mobile, params arrive as ?title=&text=&url=
  const sharedText = searchParams.get('text') || searchParams.get('title') || searchParams.get('url')
  // projectId stays in the URL until the first message is sent; on creation
  // the server stamps the new conversation with the project and the row
  // becomes source-of-truth. Any further ?projectId= is ignored for existing
  // conversations (the server re-reads from DB).
  const urlProjectId = searchParams.get('projectId')
  // Vision support check — gates whether we accept image attachments at the picker.
  // Non-image files (PDF/DOCX/audio/text) flow through convertToMarkdown on the
  // server and are safe for every model. The API endpoint also validates.
  const supportsVision = model.includes('gemma') || model.includes('gemini') || model.includes('claude') || model.includes('gpt')
  // Accept is "everything" for vision-capable models, or "everything minus images"
  // for text-only models. Drop, paste, and the + menu all respect this.
  const acceptString = supportsVision
    ? ACCEPT_ALL
    : ACCEPT_ALL.replace('image/*,', '')

  // Ref to the underlying textarea so preset chips can insert text.
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  // Mirror the uncontrolled textarea value in state so the slash-command
  // menu can react to every keystroke without forcing the input to be
  // fully controlled (which would break ai-elements' PromptInput).
  const [inputValue, setInputValue] = useState('')
  const [slashIndex, setSlashIndex] = useState(0)
  const [activatingSkill, setActivatingSkill] = useState<string | null>(null)
  const { data: skillSummary } = useSkillSummary()
  // Single scroll container holding both the transcript and the sticky input.
  // We manage auto-scroll-to-bottom manually instead of relying on StickToBottom
  // so the input can be a sticky child of the same scroller (claude.ai layout).
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  // Track if the user has scrolled up: if yes, don't auto-stick to bottom on
  // streamed tokens (respect their read position).
  const stickToBottomRef = useRef(true)
  // Count of new messages that arrived while the user was scrolled up. Used to
  // show a "↓ 3 new messages" badge on the scroll-to-latest button.
  const [unreadCount, setUnreadCount] = useState(0)
  const lastSeenCountRef = useRef(0)

  const { data: existingConversation, error: conversationError, isError: conversationIsError } =
    useConversationMessages(urlConversationId)

  // 404 on a URL-supplied conversation means it's been deleted, is on another
  // account, or never existed. Show a clear not-found state instead of the
  // empty welcome screen, which makes the situation look like a fresh chat and
  // confuses users who followed a stale bookmark.
  const conversationNotFound =
    !!urlConversationId &&
    conversationIsError &&
    (conversationError as { status?: number } | null)?.status === 404

  const {
    messages,
    isLoading,
    error,
    status,
    conversationId,
    sendMessage,
    regenerate,
    stop,
    clearMessages,
    setMessages,
    addToolApprovalResponse,
  } = useChat({
    model,
    conversationId: urlConversationId,
    projectId: urlProjectId,
    initialMessages: existingConversation?.messages as Message[] | undefined,
  })

  // Navigate to conversation URL when a new conversation is created.
  // Preserve ?projectId= across the navigate so the in-project pill doesn't
  // briefly vanish while the conversations list refetches. The pill falls
  // back to urlProjectId until storedProjectId resolves from the list cache.
  useEffect(() => {
    if (conversationId && !urlConversationId && messages.length > 0) {
      const projectSuffix = urlProjectId ? `?projectId=${urlProjectId}` : ''
      navigate(`/dashboard/chat/${conversationId}${projectSuffix}`, { replace: true })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    }
  }, [conversationId, urlConversationId, urlProjectId, messages.length, navigate, queryClient])

  // After the first assistant response completes, ask the server to generate
  // a proper title + summary for the sidebar. Fires at most once per
  // conversationId per tab session. Fire-and-forget — sidebar refreshes on the
  // next list fetch (next focus or next message).
  const summarisedIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!conversationId) return
    if (isLoading) return
    if (summarisedIdsRef.current.has(conversationId)) return
    // Need at least one user + one assistant message.
    const hasUser = messages.some((m) => m.role === 'user')
    const hasAssistant = messages.some((m) => m.role === 'assistant')
    if (!hasUser || !hasAssistant) return
    // Must be the FIRST exchange — don't re-summarise mid-conversation.
    if (messages.length > 3) return
    summarisedIdsRef.current.add(conversationId)
    void fetch(`/api/conversations/${conversationId}/summarise`, {
      method: 'POST',
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          // Refresh the sidebar so the new title/summary appears without a page reload.
          queryClient.invalidateQueries({ queryKey: ['conversations'] })
        }
      })
      .catch(() => {})
  }, [conversationId, isLoading, messages, queryClient])

  // Reset + hydrate when the conversation URL changes (navigating sidebar
  // entries). Tracking the last-hydrated conversationId prevents us from
  // clobbering mid-stream messages for the current conversation.
  const lastHydratedIdRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    // Conversation cleared (user clicked "New chat" with no id) — empty the list.
    if (!urlConversationId) {
      if (lastHydratedIdRef.current !== undefined) {
        setMessages([])
        lastHydratedIdRef.current = undefined
      }
      return
    }
    const raw = existingConversation?.messages as Message[] | undefined
    // Still loading — don't touch messages.
    if (!raw) return
    // Already hydrated this conversation and we're not switching — skip.
    if (lastHydratedIdRef.current === urlConversationId) return

    const hydrated = raw.map((m) => {
      const msg = m as Message & { createdAt?: unknown }
      return {
        ...m,
        parts: Array.isArray(m.parts) ? m.parts : [],
        ...(msg.createdAt != null
          ? { createdAt: msg.createdAt instanceof Date ? msg.createdAt : new Date(msg.createdAt as string) }
          : {}),
      }
    })
    setMessages(hydrated as Message[])
    lastHydratedIdRef.current = urlConversationId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlConversationId, existingConversation?.messages])

  // Share Target: auto-send shared text on first load, then clear params
  useEffect(() => {
    if (sharedText && messages.length === 0 && !isLoading) {
      sendMessage({ text: sharedText })
      setSearchParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedText])

  // Regenerate: uses AI SDK's built-in regenerate (removes last assistant + re-sends)
  const handleRegenerate = useCallback(() => {
    if (isLoading) return
    regenerate()
  }, [isLoading, regenerate])

  // Edit a user message: truncate to that point and re-send with new text
  const handleEdit = useCallback(
    (messageId: string, newText: string) => {
      if (isLoading) return
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return
      // Keep everything before this message
      const truncated = messages.slice(0, idx)
      setMessages(truncated)
      setTimeout(() => sendMessage({ text: newText }), 50)
    },
    [messages, isLoading, setMessages, sendMessage],
  )

  // Find the last assistant message index
  const lastAssistantIdx = useMemo(() => {
    const idx = [...messages].reverse().findIndex((m) => m.role === 'assistant')
    return idx === -1 ? -1 : messages.length - 1 - idx
  }, [messages])

  // ─── Input Takeover Detection ─────────────────────────────────
  const [activeTakeover, setActiveTakeover] = useState<{ _ui: string; [key: string]: unknown } | null>(null)

  useEffect(() => {
    const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant')
    if (!lastAssistantMsg?.parts) {
      if (activeTakeover) setActiveTakeover(null)
      return
    }
    for (const part of lastAssistantMsg.parts) {
      if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
        const p = part as Record<string, unknown>
        const output = p['output']
        if (output && hasUiMarker(output) && isTakeoverElement(output)) {
          setActiveTakeover(output as { _ui: string; [key: string]: unknown })
          return
        }
      }
    }
  }, [messages, isLoading, activeTakeover])

  useEffect(() => {
    if (messages.length === 0) setActiveTakeover(null)
  }, [messages.length])

  const handleTakeoverSubmit = useCallback(
    (text: string) => {
      setActiveTakeover(null)
      sendMessage({ text })
    },
    [sendMessage],
  )

  const handleTakeoverDismiss = useCallback(() => {
    setActiveTakeover(null)
  }, [])

  const handleToolApproval = useCallback(
    ({ toolCallId, result }: { toolCallId: string; toolName: string; result: 'approve' | 'deny' }) => {
      addToolApprovalResponse({ id: toolCallId, approved: result === 'approve' })
    },
    [addToolApprovalResponse],
  )

  // Preview vs pick separation for ActionChips hover:
  //   - onPreview(text): fill textarea temporarily (remember prior value)
  //   - onPreview(null): restore the prior value
  //   - onPick(text):    commit (prior value forgotten)
  // This lets users glide over presets to see them live in the textarea
  // without committing, matching claude.ai's chip UX.
  const priorTextareaRef = useRef<string | null>(null)
  const setTextareaValue = useCallback((text: string, focus: boolean) => {
    const ta = textareaRef.current
    if (!ta) return
    // Use the native setter so React's synthetic onChange picks up the change.
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    )?.set
    setter?.call(ta, text)
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    if (focus) {
      ta.focus()
      requestAnimationFrame(() => ta.setSelectionRange(text.length, text.length))
    }
  }, [])

  const handlePresetPreview = useCallback((text: string | null) => {
    const ta = textareaRef.current
    if (!ta) return
    if (text === null) {
      // Restore — only if the preview was actually in effect (guards against
      // stray mouseleave events when no preview was active).
      if (priorTextareaRef.current !== null) {
        setTextareaValue(priorTextareaRef.current, false)
        priorTextareaRef.current = null
      }
    } else {
      // Save current value once on first preview, then fill.
      if (priorTextareaRef.current === null) {
        priorTextareaRef.current = ta.value
      }
      setTextareaValue(text, false)
    }
  }, [setTextareaValue])

  const handlePresetPick = useCallback((text: string) => {
    // Commit — discard the saved prior value so future mouseleave doesn't
    // undo the user's selection.
    priorTextareaRef.current = null
    setTextareaValue(text, true)
  }, [setTextareaValue])

  /**
   * Fetch a skill body and wrap it in <skill_content> tags so the model
   * receives the activated skill in the first user message. Returns the
   * final text + body for the UI to send or null if the skill is missing.
   */
  const activateSkill = useCallback(async (skillName: string, rest: string, files: unknown) => {
    try {
      const detail = await apiClient.get<{
        name: string
        directory: string
        body: string
        resources: string[]
      }>(`/api/skills/${skillName}`)
      const resourceBlock = detail.resources.length > 0
        ? `\n\n<skill_resources>\n${detail.resources.map((r) => `  <file>${r}</file>`).join('\n')}\n</skill_resources>`
        : ''
      const wrapper = [
        `<skill_content name="${detail.name}" directory="${detail.directory}">`,
        detail.body,
        '',
        `Skill directory: ${detail.directory}`,
        'Relative paths resolve against the skill directory. Use read_skill_resource or run_skill_script for any listed resource.',
        resourceBlock.trim(),
        '</skill_content>',
      ].filter(Boolean).join('\n')
      const finalText = `${wrapper}\n\n${rest || `Using the ${detail.name} skill.`}`
      sendMessage({ text: finalText, files: files as never })
      return true
    } catch {
      return false
    }
  }, [sendMessage])

  const handleSubmit = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (message: { text?: string; files?: any[] }) => {
      const text = message.text?.trim()
      if (!text && !message.files?.length) return

      // Slash-command activation (phase 2). When the user starts with `/` and
      // the first token matches a skill, we activate the skill so the model
      // receives the full instructions without having to call load_skill.
      if (text && text.startsWith('/') && features.skills) {
        const firstSpace = text.indexOf(' ')
        const skillName = (firstSpace === -1 ? text.slice(1) : text.slice(1, firstSpace)).trim()
        const rest = firstSpace === -1 ? '' : text.slice(firstSpace + 1).trim()
        if (skillName && /^[a-z0-9-]+$/.test(skillName)) {
          const activated = await activateSkill(skillName, rest, message.files)
          if (activated) return
          // Fall through on miss so the user sees a normal error rather
          // than a silent no-op.
        }
      }

      if (message.files && message.files.length > 0) {
        sendMessage({ text: text || '', files: message.files })
      } else if (text) {
        sendMessage({ text })
      }
    },
    [sendMessage, activateSkill],
  )

  // Observe the uncontrolled PromptInputTextarea so the slash-command menu
  // can react to every keystroke without fighting the AI Elements component.
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    const onInput = () => setInputValue(ta.value)
    ta.addEventListener('input', onInput)
    // Catch programmatic value changes too (preset chips dispatch their own
    // input event via setTextareaValue — this listener will pick them up).
    setInputValue(ta.value)
    return () => ta.removeEventListener('input', onInput)
  }, [])

  // Reset slash-menu highlight whenever the query changes.
  const slashParsed = features.skills ? parseSlashQuery(inputValue) : null
  const slashMatches = useMemo<SkillSummary[]>(() => {
    if (!features.skills || !slashParsed || !skillSummary) return []
    const q = slashParsed.query.toLowerCase()
    if (!q) return skillSummary.skills.slice(0, 8)
    return skillSummary.skills
      .filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
      .slice(0, 8)
  }, [slashParsed, skillSummary])
  const slashMenuOpen = !!slashParsed && slashMatches.length > 0
  useEffect(() => { setSlashIndex(0) }, [slashParsed?.query])

  const handleSelectSkill = useCallback(async (skill: SkillSummary) => {
    if (!slashParsed) return
    setActivatingSkill(skill.name)
    const rest = slashParsed.rest.trim()
    const ok = await activateSkill(skill.name, rest, undefined)
    setActivatingSkill(null)
    if (ok) {
      // Clear the input — the message is in flight.
      setTextareaValue('', true)
      setInputValue('')
    }
  }, [slashParsed, activateSkill, setTextareaValue])

  /**
   * Keyboard navigation for the slash menu. Intercepts Arrow/Enter/Tab/Esc
   * when the menu is open; otherwise lets the textarea handle them normally
   * (Enter submits via PromptInput, Esc does nothing).
   */
  const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!slashMenuOpen) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSlashIndex((i) => (i + 1) % slashMatches.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSlashIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      const skill = slashMatches[slashIndex]
      if (skill) {
        e.preventDefault()
        e.stopPropagation()
        void handleSelectSkill(skill)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setTextareaValue('', true)
      setInputValue('')
    }
  }, [slashMenuOpen, slashMatches, slashIndex, handleSelectSkill, setTextareaValue])

  // Helper: convert File/Blob → data URL for AI SDK's FileUIPart
  const toDataUrl = useCallback((blob: Blob): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.readAsDataURL(blob)
    })
  }, [])

  // Paste-to-upload: Cmd+V anywhere in the chat sends images as attachments
  const handlePastedFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      const parts = await Promise.all(
        files.map(async (f) => ({ type: 'file' as const, url: await toDataUrl(f), mediaType: f.type })),
      )
      sendMessage({ text: 'What do you see in this image?', files: parts })
    },
    [sendMessage, toDataUrl],
  )
  usePasteUpload({ onPaste: handlePastedFiles, accept: 'image/*', global: true, disabled: isLoading })

  // Audio recording: sends the recorded blob as an attachment
  const handleAudioRecording = useCallback(
    async (blob: Blob) => {
      const url = await toDataUrl(blob)
      sendMessage({ text: 'Transcribe this audio recording.', files: [{ type: 'file', url, mediaType: blob.type }] })
    },
    [sendMessage, toDataUrl],
  )

  // hasMessages gates the empty "Good evening" screen. We treat "streaming
  // with no messages yet" as "has messages" so the welcome state doesn't
  // briefly flash between send and the first optimistic append, or while a
  // regenerate is rebuilding the transcript. Empty state shows ONLY when
  // the transcript is genuinely empty AND we're not mid-request.
  const hasMessages = messages.length > 0 || isLoading
  // Derive whether the artifact panel toggle should appear at all. Recomputed
  // per render — cheap walk, no need for useMemo.
  const { artifactCount, fileCount } = countArtifactsAndFiles(messages)
  const hasArtifactsOrFiles = artifactCount + fileCount > 0

  // Resolve the current conversation's project (if any) for the header pill.
  // Two paths: (a) new chat launched from a project page — `urlProjectId` set
  // until the first send persists it; (b) existing conversation — read from
  // the conversations list cache. The list is already fetched by the sidebar,
  // so this is a zero-cost subscribe.
  const { data: conversationListData } = useConversationList()
  const { data: projectListData } = useProjectList()
  const moveConversation = useMoveConversation()
  const activeConversation = urlConversationId
    ? conversationListData?.conversations.find((c) => c.id === urlConversationId)
    : undefined
  const storedProjectId = activeConversation?.projectId ?? null
  const activeProjectId = storedProjectId ?? urlProjectId ?? null
  const activeProject = activeProjectId
    ? projectListData?.projects.find((p) => p.id === activeProjectId) ?? null
    : null

  // Track whether the user is near the bottom of the scroll container so we
  // can (a) show/hide the scroll-to-bottom button, (b) stop auto-sticking
  // once they scroll up, and (c) reset the unread count when they return.
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    setIsAtBottom(nearBottom)
    stickToBottomRef.current = nearBottom
    if (nearBottom) {
      setUnreadCount(0)
      lastSeenCountRef.current = messages.length
    }
  }, [messages.length])

  // Auto-scroll to bottom on new messages / streamed tokens, but only if the
  // user hasn't scrolled up. Tracks unread count for the scroll-to-latest
  // badge when they have.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (stickToBottomRef.current) {
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      })
      lastSeenCountRef.current = messages.length
    } else {
      // User is scrolled up — anything past the last seen index counts as unread.
      const delta = messages.length - lastSeenCountRef.current
      if (delta > 0) setUnreadCount(delta)
    }
  }, [messages])

  // While streaming, tokens arrive without a messages[] identity change — so
  // the effect above doesn't re-fire per token. Run a rAF loop that nudges the
  // scroll position to the bottom each frame until streaming stops. Gives
  // claude.ai-style continuous auto-scroll instead of jumpy per-message scroll.
  useEffect(() => {
    if (!isLoading) return
    let rafId = 0
    const tick = () => {
      const el = scrollRef.current
      if (el && stickToBottomRef.current) {
        // instant, not smooth, because we're running 60fps — smooth would jitter
        el.scrollTop = el.scrollHeight
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isLoading])

  // Force scroll to bottom (e.g. when user clicks the scroll-down button or
  // submits a new message). Also clears the unread-message badge.
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    stickToBottomRef.current = true
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setUnreadCount(0)
    lastSeenCountRef.current = messages.length
  }, [messages.length])

  return (
    // Break out of DashboardLayout's p-4 md:p-6 wrapper so the scroller fills
    // the entire <main> region edge-to-edge (claude.ai style — scrollbar hugs
    // the right edge of the content area, no inset padding). The negative
    // margin cancels the parent padding exactly; `h-[calc(100svh-3.5rem)]`
    // accounts for the SiteHeader only (56px, no extra padding now that we've
    // cancelled the p-4/p-6).
    <div className="-m-4 md:-m-6 flex h-[calc(100svh-3.5rem)] overflow-hidden">
      {/* Full-viewport drop overlay while dragging files. Visual only — the
          actual capture happens inside PromptInput's globalDrop handler. */}
      <DropOverlay disabled={isLoading} />
      {/* Conversation sidebar: inline on desktop, Sheet on mobile */}
      {showSidebar && isDesktop && (
        <ConversationSidebar activeConversationId={urlConversationId} />
      )}
      {showSidebar && !isDesktop && (
        <Sheet open onOpenChange={(open) => { if (!open) setShowSidebar(false) }}>
          <SheetContent side="left" className="w-64 p-0">
            <ConversationSidebar activeConversationId={urlConversationId} />
          </SheetContent>
        </Sheet>
      )}

      {/* Chat area */}
      <div className="flex flex-1 flex-col min-w-0 relative">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setShowSidebar(!showSidebar)}
              title={showSidebar ? 'Hide conversations' : 'Show conversations'}
              aria-label={showSidebar ? 'Hide conversations' : 'Show conversations'}
            >
              {/* MessagesSquare (plural speech bubbles) distinguishes this from
                  the dashboard sidebar toggle in SiteHeader which uses PanelLeft. */}
              <MessagesSquare className="size-4" />
            </Button>
            <MessageSquare className="size-4 text-muted-foreground ml-1" />
            <h1 className="text-sm font-medium truncate max-w-[28rem]" title={activeConversation?.title ?? 'AI Chat'}>
              {activeConversation?.title ?? 'AI Chat'}
            </h1>
            {/* In-project pill: click name → project page; × detaches. For
                new chats launched from a project page we show the pill
                immediately (optimistic) even before the first message
                persists. */}
            {activeProject && (
              <div className="ml-2 inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 pl-2 pr-1 py-0.5 text-xs">
                <Folder className="size-3 text-muted-foreground" />
                <RouterLink
                  to={`/dashboard/projects/${activeProject.id}`}
                  className="font-medium hover:underline underline-offset-2"
                  title={`Project: ${activeProject.name}`}
                >
                  {activeProject.name}
                </RouterLink>
                {/* Detach — only for persisted conversations (no server-side
                    PATCH exists for a not-yet-created chat). If the chat is
                    only declared via urlProjectId, user can just navigate
                    away; no "detach" affordance needed yet. */}
                {urlConversationId && storedProjectId && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-4 rounded-full hover:bg-muted-foreground/10 text-muted-foreground hover:text-foreground"
                    onClick={() => moveConversation.mutate({ id: urlConversationId, projectId: null })}
                    title="Remove from project"
                    aria-label="Remove from project"
                  >
                    <X className="size-2.5" />
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {hasArtifactsOrFiles && (
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn(
                  'text-muted-foreground',
                  showArtifactPanel && 'bg-accent text-foreground ring-1 ring-primary/30',
                )}
                onClick={() => setShowArtifactPanel((v) => !v)}
                title={showArtifactPanel ? 'Hide artifact panel' : `Artifacts (${artifactCount}) & files (${fileCount})`}
                aria-label={showArtifactPanel ? 'Hide artifact panel' : 'Show artifact panel'}
                aria-pressed={showArtifactPanel}
              >
                <FileText className="size-3.5" />
              </Button>
            )}
            {hasMessages && conversationId && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground"
                    title="Export conversation"
                    aria-label="Export conversation"
                  >
                    <Download className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() =>
                      window.open(
                        `/api/conversations/${conversationId}/export?format=md`,
                        '_blank',
                      )
                    }
                  >
                    Export as Markdown
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      window.open(
                        `/api/conversations/${conversationId}/export?format=json`,
                        '_blank',
                      )
                    }
                  >
                    Export as JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {hasMessages && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-8"
                onClick={() => {
                  // Preserve current project context — if this chat belongs
                  // to a project, "New chat" should create another one in
                  // the same project, not kick the user back to ungrouped.
                  clearMessages()
                  const dest = activeProjectId
                    ? `/dashboard/chat?projectId=${activeProjectId}`
                    : '/dashboard/chat'
                  navigate(dest)
                }}
                disabled={isLoading}
              >
                <Plus className="size-3.5" />
                New chat
              </Button>
            )}
          </div>
        </div>

        {/* One scroll container holds BOTH the transcript AND the sticky
            input. Flex-col so the empty-state and sticky input can share
            vertical space cleanly — without flex-col the empty state needs
            `min-h-full` which stacks with the 144px sticky input and creates
            a phantom scrollbar on a fresh conversation. */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative"
        >
          {hasMessages ? (
            <div className="max-w-3xl mx-auto w-full px-4 py-6 flex flex-col gap-8">
              {messages.map((message, idx) => {
                // Hide duplicate user messages left by regenerate
                if (message.role === 'user' && idx > 0) {
                  const prev = messages[idx - 1]
                  if (prev?.role === 'user') return null
                }
                return (
                  <MessageRenderer
                    key={message.id}
                    message={message}
                    isLast={idx === lastAssistantIdx && !isLoading}
                    isLoading={isLoading && idx === messages.length - 1}
                    onRegenerate={handleRegenerate}
                    onEdit={handleEdit}
                    onSendMessage={(text) => sendMessage({ text })}
                    onToolApproval={handleToolApproval}
                    userImage={session?.user?.image}
                  />
                )
              })}
              {/* Bottom spacer — leaves room for the sticky input so the last
                  message isn't permanently hidden behind it when scrolled to
                  the bottom. Matches claude.ai's h-12 spacer pattern. */}
              <div aria-hidden className="h-48 shrink-0" />
            </div>
          ) : conversationNotFound ? (
            <div className="flex-1 flex items-center justify-center px-4 py-6">
              <div className="max-w-md w-full text-center space-y-4">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                  <FileQuestion className="h-7 w-7 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold">Conversation not found</h2>
                  <p className="text-sm text-muted-foreground">
                    This chat may have been deleted or belongs to another account.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <Button onClick={() => navigate('/dashboard/chat')}>
                    <Plus className="mr-2 h-4 w-4" />
                    Start a new chat
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center px-4 py-6">
              <div className="max-w-2xl w-full text-center space-y-6">
                <EmptyStateBody
                  userName={session?.user?.name?.split(' ')[0]}
                  userEmail={session?.user?.email}
                  onPresetPick={handlePresetPick}
                  onPresetPreview={handlePresetPreview}
                />
              </div>
            </div>
          )}

          {/* Error display — inside the scroller so it's visible above the input.
              Puts the error text beside a compact action row so users have a
              one-click path to recover (retry the last message, or switch model
              via the selector below). */}
          {error && (
            <div className="sticky bottom-28 mx-auto max-w-3xl px-4">
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">Something went wrong.</div>
                  <div className="mt-0.5 text-destructive/80 break-words">{error}</div>
                </div>
                {lastAssistantIdx === -1 && messages.some((m) => m.role === 'user') && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 border-destructive/50 text-destructive hover:bg-destructive/10"
                    onClick={handleRegenerate}
                    disabled={isLoading}
                  >
                    Retry
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Sticky input — pinned to the bottom of the scroll container with
              a gradient fade so messages scroll nicely behind it. */}
          <div className="sticky bottom-0 left-0 right-0 z-10">
            {/* Gradient fade-out so text under the input fades into the bg */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-background to-transparent"
            />
            <div className="bg-background px-4 pt-2 pb-4">
              <div className="mx-auto max-w-3xl">
                {/* Scroll-to-bottom button floats above the input card */}
                {!isAtBottom && hasMessages && (
                  <div className="flex justify-center -mt-2 mb-2">
                    <Button
                      size="sm"
                      onClick={scrollToBottom}
                      className="h-8 rounded-full shadow-lg bg-foreground text-background hover:bg-foreground/90"
                    >
                      <ArrowDown className="size-3.5 mr-1" />
                      {unreadCount > 0
                        ? `${unreadCount} new message${unreadCount === 1 ? '' : 's'}`
                        : 'Scroll to latest'}
                    </Button>
                  </div>
                )}
                {activeTakeover ? (
                  <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
                    <InputTakeover
                      element={activeTakeover}
                      onSubmit={handleTakeoverSubmit}
                      onDismiss={handleTakeoverDismiss}
                    />
                  </div>
                ) : (
                  // Outer wrapper owns the border + rounding + focus ring.
                  // Inner InputGroup has its own border+rounded-md+ring; we
                  // neutralise those via the `[&_...]` selectors so we don't
                  // end up with mismatched nested corners (the original bug).
                  // `relative` anchors the SkillsSlashMenu popover below.
                  <div className="relative">
                    {slashMenuOpen && (
                      <SkillsSlashMenu
                        input={inputValue}
                        activeIndex={slashIndex}
                        setActiveIndex={setSlashIndex}
                        onSelect={handleSelectSkill}
                      />
                    )}
                    {activatingSkill && (
                      <div className="absolute bottom-full left-0 right-0 mb-2 mx-4 rounded-md border bg-popover p-2 text-xs text-muted-foreground shadow-md z-20">
                        Activating <span className="font-mono">/{activatingSkill}</span>…
                      </div>
                    )}
                  <div
                    className={cn(
                      'rounded-2xl border bg-background shadow-sm overflow-hidden transition-all',
                      // Stronger focus treatment — subtle ring in the primary
                      // colour plus a slightly brighter border. Still calm
                      // (20% opacity), but actually perceptible in dark mode.
                      'focus-within:border-primary/30 focus-within:ring-1 focus-within:ring-primary/20',
                      // Kill the inner InputGroup chrome so only the outer
                      // wrapper is visible. Keep the outer radius; drop the
                      // inner ring + border that were stacking.
                      '[&_[data-slot=input-group]]:border-0',
                      '[&_[data-slot=input-group]]:rounded-none',
                      '[&_[data-slot=input-group]]:shadow-none',
                      '[&_[data-slot=input-group]]:focus-within:ring-0',
                    )}
                  >
                    <PromptInput
                      onSubmit={handleSubmit}
                      accept={acceptString}
                      multiple
                      maxFiles={5}
                      maxFileSize={25 * 1024 * 1024}
                      globalDrop
                    >
                      <AttachmentTiles />
                      <PromptInputTextarea
                        ref={textareaRef}
                        placeholder={hasMessages ? 'Reply to the AI...' : 'Ask anything, or drop a file…'}
                        onKeyDown={handleTextareaKeyDown}
                      />
                      <PromptInputFooter>
                        <PromptInputTools>
                          <PromptInputActionMenu>
                            <PromptInputActionMenuTrigger
                              aria-label="Attach a file or take a screenshot"
                              tooltip="Attach"
                              size="sm"
                              className="bg-muted hover:bg-muted-foreground/10"
                            >
                              <Paperclip className="size-4" />
                              <span className="hidden sm:inline">Attach</span>
                            </PromptInputActionMenuTrigger>
                            <PromptInputActionMenuContent>
                              <PromptInputActionAddAttachments />
                              <PromptInputActionAddScreenshotCountdown />
                              <PromptInputActionAddScreenCapture />
                            </PromptInputActionMenuContent>
                          </PromptInputActionMenu>
                          <AudioRecorder compact onRecordingComplete={handleAudioRecording} />
                          <ModelSelector value={model} onChange={setModel} disabled={isLoading} />
                        </PromptInputTools>
                        <PromptInputSubmit status={status} onStop={stop} />
                      </PromptInputFooter>
                    </PromptInput>
                  </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right-side artifact panel: inline on large screens, Sheet on mobile.
          Zero-schema derivation — ArtifactSidebar walks `messages` itself for
          artifacts (_artifact tool results) and user file parts. */}
      {showArtifactPanel && isLargeScreen && (
        <ArtifactSidebar messages={messages} onClose={() => setShowArtifactPanel(false)} />
      )}
      {showArtifactPanel && !isLargeScreen && (
        <Sheet open onOpenChange={(open) => { if (!open) setShowArtifactPanel(false) }}>
          <SheetContent side="right" className="w-80 p-0">
            <ArtifactSidebar messages={messages} onClose={() => setShowArtifactPanel(false)} />
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}

/**
 * Empty-state body — no outer scroll wrapper. The parent scroll container in
 * ChatPage wraps this (and the sticky input) together; we just render the
 * greeting + chip row here.
 */
function EmptyStateBody({
  userName,
  userEmail,
  onPresetPick,
  onPresetPreview,
}: {
  userName?: string
  userEmail?: string
  onPresetPick: (text: string) => void
  onPresetPreview: (text: string | null) => void
}) {
  return (
    <>
      {(userName || userEmail) && (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3 py-1 text-xs text-muted-foreground">
          {userEmail || userName}
        </div>
      )}
      <h2 className="text-3xl font-semibold tracking-tight">
        {greetingForTime(userName)}
      </h2>
      <p className="text-sm text-muted-foreground/60 -mt-3">
        Ask anything, drop a file, or pick a starter below.
      </p>
      <ActionChips onPick={onPresetPick} onPreview={onPresetPreview} />
      <ExampleQuestions onPick={onPresetPick} />
    </>
  )
}

/**
 * ExampleQuestions — click-to-insert flat starter prompts shown beneath the
 * chip row. Matches t3.chat's pattern: gives users who know what they want
 * a single-click cold start (chips handle the "I want to explore" path).
 * Config lives in src/shared/config/chat-chips.ts → CHAT_EXAMPLES.
 */
function ExampleQuestions({ onPick }: { onPick: (text: string) => void }) {
  if (CHAT_EXAMPLES.length === 0) return null
  return (
    <div className="w-full max-w-2xl mx-auto space-y-1.5 pt-2">
      {CHAT_EXAMPLES.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onPick(q)}
          className="block w-full text-left rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
        >
          {q}
        </button>
      ))}
    </div>
  )
}

export default ChatPage
