/**
 * EmojiPicker — emoji-mart wrapper. Lazy-loaded so the data bundle
 * (~150KB) doesn't ship in the main chunk for users who never open
 * it.
 */
// emoji-mart types are loose — keep the import path narrow and the
// onEmojiSelect callback typed at our boundary.
import data from '@emoji-mart/data'
// biome-ignore lint/suspicious/noExplicitAny: emoji-mart's types are imprecise
import Picker from '@emoji-mart/react'

interface Props {
  onPick: (emoji: string) => void
}

export function EmojiPicker({ onPick }: Props) {
  return (
    <Picker
      data={data}
      previewPosition="none"
      skinTonePosition="none"
      maxFrequentRows={1}
      perLine={8}
      onEmojiSelect={(e: { native?: string; shortcodes?: string }) => {
        if (e.native) onPick(e.native)
      }}
    />
  )
}
