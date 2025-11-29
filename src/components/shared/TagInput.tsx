import { useState, useRef, useEffect } from 'react'
import { X, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  suggestions?: string[]
  placeholder?: string
  className?: string
}

/**
 * TagInput Component
 *
 * A reusable tag input component with autocomplete functionality.
 * Features:
 * - Add tags by typing and pressing Enter
 * - Remove tags with X button
 * - Autocomplete suggestions from previously used tags
 * - Prevents duplicate tags
 * - Clean, minimal UI with badges
 *
 * Usage:
 * ```tsx
 * <FormField
 *   control={form.control}
 *   name="tags"
 *   render={({ field }) => (
 *     <FormItem>
 *       <FormLabel>Tags</FormLabel>
 *       <FormControl>
 *         <TagInput
 *           value={field.value || []}
 *           onChange={field.onChange}
 *           suggestions={['customer', 'prospect', 'partner']}
 *         />
 *       </FormControl>
 *     </FormItem>
 *   )}
 * />
 * ```
 */
export function TagInput({
  value = [],
  onChange,
  suggestions = [],
  placeholder = 'Add tag...',
  className,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Filter suggestions based on input value
  const filteredSuggestions = suggestions
    .filter((suggestion) =>
      suggestion.toLowerCase().includes(inputValue.toLowerCase()) &&
      !value.includes(suggestion)
    )
    .slice(0, 5) // Limit to 5 suggestions

  // Add tag
  const addTag = (tag: string) => {
    const trimmedTag = tag.trim()
    if (trimmedTag && !value.includes(trimmedTag)) {
      onChange([...value, trimmedTag])
      setInputValue('')
      setShowSuggestions(false)
    }
  }

  // Remove tag
  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((tag) => tag !== tagToRemove))
  }

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (inputValue.trim()) {
        addTag(inputValue)
      }
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      // Remove last tag if input is empty and backspace is pressed
      const lastTag = value[value.length - 1]
      if (lastTag) removeTag(lastTag)
    }
  }

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
    setShowSuggestions(e.target.value.length > 0)
  }

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: string) => {
    addTag(suggestion)
    inputRef.current?.focus()
  }

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      const clickedOutsideInput = inputRef.current && !inputRef.current.contains(target)
      const clickedOutsideSuggestions = suggestionsRef.current && !suggestionsRef.current.contains(target)

      if (clickedOutsideInput && clickedOutsideSuggestions) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className={cn('space-y-2', className)}>
      {/* Tag Display */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="gap-1 pr-1 pl-3"
            >
              <span>{tag}</span>
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="hover:bg-muted rounded-full p-0.5 transition-colors"
                aria-label={`Remove ${tag} tag`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Input Field with Autocomplete */}
      <div className="relative">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(inputValue.length > 0)}
            placeholder={placeholder}
            className="flex-1 placeholder:opacity-50"
          />
          {inputValue.trim() && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => addTag(inputValue)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Autocomplete Suggestions */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute z-50 w-full mt-1 rounded-md border bg-popover shadow-md"
          >
            <div className="p-1">
              {filteredSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Helper Text */}
      <p className="text-xs text-muted-foreground">
        Press Enter to add tag, or click suggested tags below
      </p>
    </div>
  )
}
