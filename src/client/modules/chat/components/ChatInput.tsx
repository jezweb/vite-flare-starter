/**
 * ChatInput Component
 *
 * Text input with send button, optional image attachment for vision-capable models.
 * Supports `/skill-name` slash-command typeahead when the skills feature flag is on.
 */
import { useState, useRef, useEffect, useCallback, type KeyboardEvent, type FormEvent } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, Square, Paperclip, X } from 'lucide-react'
import { features } from '@/shared/config/features'
import { SkillsSlashMenu, parseSlashQuery } from './SkillsSlashMenu'
import { useSkillSummary, type SkillSummary } from '@/client/modules/skills/hooks/useSkills'
import { apiClient } from '@/client/lib/api-client'

interface ChatInputProps {
  /**
   * Called when the user sends a message. `activatedSkillBody` is populated
   * when the user activated a skill via slash-command — the caller should
   * prepend it as a system-style context block before the user's text.
   */
  onSend: (message: string, files?: File[], activatedSkillBody?: string) => void
  onStop?: () => void
  isLoading?: boolean
  disabled?: boolean
  placeholder?: string
  supportsVision?: boolean
}

export function ChatInput({
  onSend,
  onStop,
  isLoading = false,
  disabled = false,
  placeholder = 'Type a message...',
  supportsVision = false,
}: ChatInputProps) {
  const [input, setInput] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [slashIndex, setSlashIndex] = useState(0)
  const [activatingSkill, setActivatingSkill] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Read the skill catalog once — the menu uses it too but this gives us
  // direct access for Enter-to-select arithmetic.
  const { data: skillData } = useSkillSummary()
  const slashParsed = features.skills ? parseSlashQuery(input) : null
  const skillsAvailable = !!skillData?.skills?.length
  const slashMatches = (() => {
    if (!features.skills || !slashParsed || !skillData) return [] as SkillSummary[]
    const q = slashParsed.query.toLowerCase()
    if (!q) return skillData.skills.slice(0, 8)
    return skillData.skills
      .filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
      .slice(0, 8)
  })()
  const slashMenuOpen = features.skills && skillsAvailable && slashMatches.length > 0

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setAttachedFiles((prev) => [...prev, ...acceptedFiles].slice(0, 4)) // Max 4 images
  }, [])

  const {
    getRootProps,
    getInputProps,
    open: openFilePicker,
  } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
      'application/pdf': ['.pdf'],
    },
    noClick: true,
    noKeyboard: true,
    maxSize: 10 * 1024 * 1024, // 10MB (PDFs can be larger)
  })

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [input])

  /** Pick the highlighted skill in the slash menu. */
  const applySlashSkill = useCallback(
    async (skill: SkillSummary) => {
      setActivatingSkill(skill.name)
      try {
        const detail = await apiClient.get<{
          name: string
          directory: string
          body: string
          resources: string[]
        }>(`/api/skills/${skill.name}`)
        const resourceBlock =
          detail.resources.length > 0
            ? `\n\n<skill_resources>\n${detail.resources.map((r) => `  <file>${r}</file>`).join('\n')}\n</skill_resources>`
            : ''
        const wrapped = [
          `<skill_content name="${detail.name}" directory="${detail.directory}">`,
          detail.body,
          '',
          `Skill directory: ${detail.directory}`,
          'Relative paths resolve against the skill directory. Use read_skill_resource (or run_skill_script for scripts) for any listed resource.',
          resourceBlock.trim(),
          '</skill_content>',
        ]
          .filter(Boolean)
          .join('\n')

        // Strip the /slash command from the input so only the user's real
        // text reaches the model. Keep anything they typed after the command.
        const rest = slashParsed ? slashParsed.rest.trim() : ''
        const message = rest || `Using the ${skill.name} skill.`
        onSend(message, attachedFiles.length > 0 ? attachedFiles : undefined, wrapped)
        setInput('')
        setAttachedFiles([])
        if (textareaRef.current) textareaRef.current.style.height = 'auto'
      } catch (err) {
        console.error('Failed to activate skill:', err)
      } finally {
        setActivatingSkill(null)
      }
    },
    [attachedFiles, onSend, slashParsed]
  )

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if ((!input.trim() && attachedFiles.length === 0) || isLoading || disabled) return

    // If the slash menu is open, Enter should select the highlighted skill
    // rather than send the raw slash text.
    if (slashMenuOpen && slashMatches[slashIndex]) {
      void applySlashSkill(slashMatches[slashIndex])
      return
    }

    onSend(input.trim(), attachedFiles.length > 0 ? attachedFiles : undefined)
    setInput('')
    setAttachedFiles([])

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashMenuOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIndex((i) => Math.min(i + 1, slashMatches.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        if (slashMatches[slashIndex]) void applySlashSkill(slashMatches[slashIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setInput('')
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as FormEvent)
    }
  }

  return (
    <div className="border-t bg-background relative">
      {slashMenuOpen && (
        <SkillsSlashMenu
          input={input}
          activeIndex={slashIndex}
          setActiveIndex={setSlashIndex}
          onSelect={(skill) => void applySlashSkill(skill)}
        />
      )}
      {/* Attached file previews */}
      {attachedFiles.length > 0 && (
        <div className="flex gap-2 px-4 pt-3">
          {attachedFiles.map((file, i) => (
            <div key={i} className="relative group">
              {file.type.startsWith('image/') ? (
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="size-16 rounded-md object-cover border"
                />
              ) : (
                <div className="size-16 rounded-md border bg-muted flex flex-col items-center justify-center p-1">
                  <Paperclip className="size-4 text-muted-foreground mb-0.5" />
                  <span className="text-[8px] text-muted-foreground truncate w-full text-center">
                    {file.name.split('.').pop()?.toUpperCase()}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2 p-4" {...getRootProps()}>
        <input {...getInputProps()} />
        {supportsVision && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={openFilePicker}
            disabled={disabled || isLoading}
            className="shrink-0 size-[44px] text-muted-foreground"
            title="Attach file (image or PDF)"
            aria-label="Attach file (image or PDF)"
          >
            <Paperclip className="size-4" />
          </Button>
        )}
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setSlashIndex(0)
          }}
          onKeyDown={handleKeyDown}
          placeholder={activatingSkill ? `Loading /${activatingSkill}…` : placeholder}
          disabled={disabled || !!activatingSkill}
          className="min-h-[44px] max-h-[200px] resize-none"
          rows={1}
        />
        {isLoading ? (
          <Button
            type="button"
            size="icon"
            variant="destructive"
            onClick={onStop}
            className="shrink-0 size-[44px]"
          >
            <Square className="size-4" />
            <span className="sr-only">Stop generation</span>
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            disabled={(!input.trim() && attachedFiles.length === 0) || disabled}
            className="shrink-0 size-[44px]"
          >
            <Send className="size-4" />
            <span className="sr-only">Send message</span>
          </Button>
        )}
      </form>
    </div>
  )
}

export default ChatInput
