import { useAppStore } from '../store/useAppStore'

/**
 * Focusable form fields selector
 */
const FOCUSABLE_SELECTOR = [
  'input:not([type="hidden"]):not([disabled]):not([readonly])',
  'select:not([disabled]):not([readonly])',
  'textarea:not([disabled]):not([readonly])',
  'button[type="submit"]:not([disabled])',
].join(', ')

/**
 * Determine if element is visible on screen
 */
function isVisible(el) {
  if (!el) return false
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
}

/**
 * Advance focus to next input field inside active container
 */
export function advanceToNextField(currentEl) {
  if (!currentEl) return false

  // Find the active modal or form or main container
  const container =
    currentEl.closest('.modal-card, form, .editor-wrap, .crud-wrap, main') ||
    document.body

  const focusable = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isVisible)
  const currentIndex = focusable.indexOf(currentEl)

  if (currentIndex !== -1 && currentIndex + 1 < focusable.length) {
    const nextEl = focusable[currentIndex + 1]
    nextEl.focus()
    // Auto-select text if it's an input or textarea
    if (
      typeof nextEl.select === 'function' &&
      nextEl.type !== 'date' &&
      nextEl.type !== 'checkbox' &&
      nextEl.type !== 'radio' &&
      nextEl.tagName.toLowerCase() !== 'select'
    ) {
      try {
        nextEl.select()
      } catch (err) {
        // Some input types do not support selection
      }
    }
    return true
  }

  return false
}

/**
 * Regress focus to previous input field inside active container
 */
export function regressToPrevField(currentEl) {
  if (!currentEl) return false

  const container =
    currentEl.closest('.modal-card, form, .editor-wrap, .crud-wrap, main') ||
    document.body

  const focusable = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isVisible)
  const currentIndex = focusable.indexOf(currentEl)

  if (currentIndex > 0) {
    const prevEl = focusable[currentIndex - 1]
    prevEl.focus()
    if (
      typeof prevEl.select === 'function' &&
      prevEl.type !== 'date' &&
      prevEl.type !== 'checkbox' &&
      prevEl.type !== 'radio' &&
      prevEl.tagName.toLowerCase() !== 'select'
    ) {
      try {
        prevEl.select()
      } catch (err) {}
    }
    return true
  }

  return false
}

/**
 * Handle global keyboard shortcuts:
 * 1. ESC: Go back / Close active modal
 * 2. Right Arrow (→): Advance to next field in any form
 */
export function initGlobalKeyboardNav() {
  const onKeyDown = (e) => {
    // 1. ESC KEY -> GO BACK OR CLOSE MODAL
    if (e.key === 'Escape') {
      e.preventDefault()
      useAppStore.getState().goBack()
      return
    }

    // 2. RIGHT ARROW (→) -> FORWARD TO NEXT FIELD IN FORM
    if (e.key === 'ArrowRight') {
      // Ignore if modifier keys are pressed (e.g. Shift+ArrowRight for text selection, Ctrl+Arrow for word jump)
      if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return

      const target = e.target
      if (!target) return

      const tag = target.tagName ? target.tagName.toLowerCase() : ''
      const isInput = tag === 'input'
      const isSelect = tag === 'select'
      const isTextarea = tag === 'textarea'

      if (!isInput && !isSelect && !isTextarea) return
      if (target.disabled || target.readOnly) return

      let shouldAdvance = false

      if (isSelect || target.type === 'checkbox' || target.type === 'radio' || target.type === 'button') {
        shouldAdvance = true
      } else if (target.type === 'number') {
        // In HTML5 number inputs, selectionStart is not supported and Up/Down changes number.
        // Right Arrow advances to next field seamlessly.
        shouldAdvance = true
      } else if (target.type === 'date' || target.type === 'time' || target.type === 'datetime-local') {
        // If in date field and user presses right arrow
        shouldAdvance = true
      } else {
        // Text-based inputs (text, search, email, tel, url, password, textarea)
        try {
          const valLen = target.value ? target.value.length : 0
          const start = target.selectionStart
          const end = target.selectionEnd

          // Advance when cursor is at the end of the text, or when all text is selected, or when empty
          if (start === null || start === undefined || (start === end && start >= valLen) || (start === 0 && end === valLen)) {
            shouldAdvance = true
          }
        } catch (err) {
          // If browser throws for specific type, default to advancing
          shouldAdvance = true
        }
      }

      if (shouldAdvance) {
        const advanced = advanceToNextField(target)
        if (advanced) {
          e.preventDefault()
        }
      }
      return
    }

    // 3. LEFT ARROW (←) -> OPTIONAL BACKWARD NAVIGATION WHEN AT START
    if (e.key === 'ArrowLeft') {
      if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return
      const target = e.target
      if (!target) return
      const tag = target.tagName ? target.tagName.toLowerCase() : ''
      if (tag !== 'input' && tag !== 'select') return
      if (target.disabled || target.readOnly) return

      let shouldRegress = false
      if (tag === 'select' || target.type === 'checkbox' || target.type === 'radio') {
        // don't interfere with selects
      } else if (target.type !== 'number' && target.type !== 'date') {
        try {
          if (target.selectionStart === 0 && target.selectionEnd === 0) {
            shouldRegress = true
          }
        } catch (err) {}
      }

      if (shouldRegress) {
        const regressed = regressToPrevField(target)
        if (regressed) {
          e.preventDefault()
        }
      }
    }
  }

  // AUTOMATIC UPPERCASE ALPHABET CONVERSION FOR ALL FORM INPUTS
  const onInput = (e) => {
    const target = e.target
    if (!target) return
    const tag = target.tagName ? target.tagName.toLowerCase() : ''
    if (tag !== 'input' && tag !== 'textarea') return
    // Allow lowercases in password and email if desired, but convert all other inputs/textareas to uppercase
    if (target.type === 'password' || target.type === 'file' || target.type === 'checkbox' || target.type === 'radio' || target.type === 'number') return
    if (target._uppercasing) return

    if (typeof target.value === 'string') {
      const upper = target.value.toUpperCase()
      if (target.value !== upper) {
        target._uppercasing = true
        const start = target.selectionStart
        const end = target.selectionEnd
        target.value = upper
        try {
          if (start !== null && end !== null) {
            target.setSelectionRange(start, end)
          }
        } catch (_) {}
        // Dispatch React synthetic event to update React component states
        target.dispatchEvent(new Event('input', { bubbles: true }))
        target._uppercasing = false
      }
    }
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('input', onInput, true)

  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('input', onInput, true)
  }
}
