/**
 * VirtualMessageList — windowed chat transcript.
 *
 * Wraps the chat transcript in `useVirtualizer` from `@tanstack/react-virtual`
 * so only visible messages mount. Uses `measureElement` so variable row
 * heights (short prompt vs. long markdown response with code blocks)
 * self-correct from an 80px estimate.
 *
 * Stick-to-bottom: the parent ChatPage already runs a hand-rolled rAF
 * scroll loop + scrollHeight writes against the same scroll container.
 * We did NOT adopt `use-stick-to-bottom` here because that loop already
 * works during streaming (the StickToBottom component would fight it).
 * The virtualizer's spacer keeps `scrollHeight` accurate, so the
 * existing scroll-to-bottom logic continues to work without changes.
 *
 * The scroll container is OWNED by the parent (ChatPage's `scrollRef`)
 * so this component only needs the ref and the message list — it does
 * not introduce a second scroller.
 *
 * Phase 1 of issue #52.
 */
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Message as UIMessageType } from '../hooks/useChat'

interface VirtualMessageListProps {
  /** Outer scroll container — passed in from ChatPage so we share its ref. */
  scrollRef: React.RefObject<HTMLDivElement | null>
  /** Visible messages. The caller is responsible for any de-duplication. */
  messages: UIMessageType[]
  /** Render a single message. Caller decides what `key` rules to apply. */
  renderMessage: (message: UIMessageType, index: number) => React.ReactNode
  /** Optional bottom spacer height — leaves room for the sticky input. */
  bottomSpacerPx?: number
}

export function VirtualMessageList({
  scrollRef,
  messages,
  renderMessage,
  bottomSpacerPx = 192,
}: VirtualMessageListProps) {
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    // Average chat message — short messages drag the average down, long
    // markdown responses stretch it up. measureElement self-corrects.
    estimateSize: () => 80,
    overscan: 4,
    // Use message id (stable) as the cache key so re-orders / edits
    // don't reset measured heights.
    getItemKey: (index) => messages[index]?.id ?? index,
  })

  return (
    <div className="max-w-3xl mx-auto w-full px-4 py-6">
      {/* Total height spacer — keeps scrollHeight accurate so the
          existing rAF stick-to-bottom loop in ChatPage continues to
          land on the visual bottom even when most rows are unmounted. */}
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: 'relative',
          width: '100%',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const message = messages[virtualRow.index]
          if (!message) return null
          const rendered = renderMessage(message, virtualRow.index)
          // If the renderer returns null (e.g. duplicate user message after
          // regenerate), skip the wrapper entirely so it doesn't reserve
          // padding height — preserves the previous behaviour where
          // `messages.map` returning null produced no spacing.
          if (rendered === null || rendered === undefined || rendered === false) {
            return null
          }
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              // pb-8 (32px) bottom padding mirrors the previous flex-col
              // gap-8 spacing between messages.
              className="absolute left-0 right-0 pb-8"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {rendered}
            </div>
          )
        })}
      </div>
      {/* Bottom spacer — leaves room for the sticky input so the last
          message isn't permanently hidden behind it when scrolled to
          the bottom. Matches claude.ai's spacer pattern. */}
      <div aria-hidden style={{ height: bottomSpacerPx, flexShrink: 0 }} />
    </div>
  )
}
