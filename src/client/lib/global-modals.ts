/**
 * Global modal coordination.
 *
 * App-level modals (Command Palette, Keyboard Shortcuts, future global
 * dialogs) call `announceOpen(id)` when they open. Any other modal listening
 * to the event closes itself. One-at-a-time policy — no stacking.
 */

const EVENT_NAME = 'app:global-modal-open'

export type GlobalModalId = 'command-palette' | 'keyboard-shortcuts'

export function announceGlobalModalOpen(id: GlobalModalId) {
  window.dispatchEvent(new CustomEvent<GlobalModalId>(EVENT_NAME, { detail: id }))
}

export function subscribeGlobalModal(selfId: GlobalModalId, onPeerOpen: () => void) {
  const handler = (event: Event) => {
    const otherId = (event as CustomEvent<GlobalModalId>).detail
    if (otherId !== selfId) onPeerOpen()
  }
  window.addEventListener(EVENT_NAME, handler)
  return () => window.removeEventListener(EVENT_NAME, handler)
}
