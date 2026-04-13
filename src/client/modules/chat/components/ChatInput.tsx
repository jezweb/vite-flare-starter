/**
 * ChatInput Component
 *
 * Text input with send button, optional image attachment for vision-capable models.
 */
import { useState, useRef, useEffect, useCallback, type KeyboardEvent, type FormEvent } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, Square, Paperclip, X } from 'lucide-react'

interface ChatInputProps {
  onSend: (message: string, files?: File[]) => void
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setAttachedFiles(prev => [...prev, ...acceptedFiles].slice(0, 4)) // Max 4 images
  }, [])

  const { getRootProps, getInputProps, open: openFilePicker } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'] },
    noClick: true,
    noKeyboard: true,
    maxSize: 5 * 1024 * 1024, // 5MB
  })

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [input])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if ((!input.trim() && attachedFiles.length === 0) || isLoading || disabled) return

    onSend(input.trim(), attachedFiles.length > 0 ? attachedFiles : undefined)
    setInput('')
    setAttachedFiles([])

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as FormEvent)
    }
  }

  return (
    <div className="border-t bg-background">
      {/* Attached file previews */}
      {attachedFiles.length > 0 && (
        <div className="flex gap-2 px-4 pt-3">
          {attachedFiles.map((file, i) => (
            <div key={i} className="relative group">
              <img
                src={URL.createObjectURL(file)}
                alt={file.name}
                className="size-16 rounded-md object-cover border"
              />
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
            title="Attach image"
          >
            <Paperclip className="size-4" />
          </Button>
        )}
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
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
