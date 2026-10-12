import { create } from 'zustand'

export const useAppStore = create((set, get) => ({
  // Navigation State
  page: 'dashboard',
  batch: null,
  history: ['dashboard'],

  setPage: (newPage) => {
    const current = get().page
    if (current === newPage) return
    set((state) => ({
      page: newPage,
      history: [...state.history.slice(-10), newPage],
    }))
  },

  openBatch: (batchName) => {
    set((state) => ({
      batch: batchName,
      page: 'editor',
      history: [...state.history.slice(-10), 'editor'],
    }))
  },

  // Modal Registry (Stack of active open modals)
  activeModals: [],

  registerModal: (id, closeHandler) => {
    set((state) => {
      const filtered = state.activeModals.filter((m) => m.id !== id)
      return { activeModals: [...filtered, { id, close: closeHandler }] }
    })
  },

  unregisterModal: (id) => {
    set((state) => ({
      activeModals: state.activeModals.filter((m) => m.id !== id),
    }))
  },

  closeTopModal: () => {
    const modals = get().activeModals
    if (modals.length > 0) {
      const top = modals[modals.length - 1]
      try {
        if (typeof top.close === 'function') {
          top.close()
        }
      } catch (err) {
        console.error('Error closing modal:', err)
      }
      set((state) => ({
        activeModals: state.activeModals.filter((m) => m.id !== top.id),
      }))
      return true
    }
    return false
  },

  // Go Back logic (triggered by ESC or Back buttons)
  goBack: () => {
    // 1. If any modal is open, close topmost modal
    if (get().closeTopModal()) {
      return
    }

    const { page, history } = get()
    // 2. If inside Batch Editor, return to Batches list
    if (page === 'editor') {
      set({ page: 'batches', batch: null })
      return
    }

    // 3. If in navigation history, go back to previous page
    if (history.length > 1) {
      const newHistory = [...history]
      newHistory.pop() // remove current
      const prev = newHistory[newHistory.length - 1] || 'dashboard'
      set({ page: prev, history: newHistory })
      return
    }

    // 4. Default fallback: Dashboard
    if (page !== 'dashboard') {
      set({ page: 'dashboard', history: ['dashboard'] })
    }
  },

  // Global MUI Snackbar Notification
  snackbar: {
    open: false,
    message: '',
    severity: 'success', // 'success' | 'error' | 'warning' | 'info'
  },

  showSnackbar: (message, severity = 'success') => {
    set({
      snackbar: {
        open: true,
        message,
        severity,
      },
    })
  },

  hideSnackbar: () => {
    set((state) => ({
      snackbar: {
        ...state.snackbar,
        open: false,
      },
    }))
  },
}))
