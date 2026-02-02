import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { sessionsApi } from '@/api/sessions'
import type { Session, Operation } from '@/types/session'

interface SessionState {
  sessions: Session[]
  activeSessionId: string | null
  activeSession: Session | null
  operations: Operation[]
  undoStack: Operation[]
  redoStack: Operation[]
  canUndo: boolean
  canRedo: boolean
  isLoading: boolean

  fetchSessions: (workspaceId: string) => Promise<void>
  createSession: (workspaceId: string, title: string) => Promise<Session>
  setActiveSession: (sessionId: string | null) => void
  commitSession: (workspaceId: string, message: string) => Promise<void>
  discardSession: (workspaceId: string) => Promise<void>
  undo: (workspaceId: string) => Promise<void>
  redo: (workspaceId: string) => Promise<void>
  fetchOperations: (workspaceId: string, sessionId: string) => Promise<void>
  addOperation: (operation: Operation) => void
  clearSession: () => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      activeSession: null,
      operations: [],
      undoStack: [],
      redoStack: [],
      canUndo: false,
      canRedo: false,
      isLoading: false,

      fetchSessions: async (workspaceId) => {
        set({ isLoading: true })
        try {
          const sessions = await sessionsApi.list(workspaceId)
          const activeSessions = sessions.filter((s) => s.status === 'active')
          const { activeSessionId } = get()
          const activeSession = activeSessionId
            ? activeSessions.find((s) => s.id === activeSessionId) || null
            : null

          set({
            sessions: activeSessions,
            activeSession,
            isLoading: false,
          })
        } catch {
          set({ isLoading: false })
        }
      },

      createSession: async (workspaceId, title) => {
        set({ isLoading: true })
        try {
          const session = await sessionsApi.create(workspaceId, { title })
          set((state) => ({
            sessions: [...state.sessions, session],
            activeSessionId: session.id,
            activeSession: session,
            operations: [],
            undoStack: [],
            redoStack: [],
            canUndo: false,
            canRedo: false,
            isLoading: false,
          }))
          return session
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      setActiveSession: (sessionId) => {
        const { sessions } = get()
        const session = sessionId ? sessions.find((s) => s.id === sessionId) || null : null
        set({
          activeSessionId: sessionId,
          activeSession: session,
          operations: [],
          undoStack: [],
          redoStack: [],
          canUndo: false,
          canRedo: false,
        })
      },

      commitSession: async (workspaceId, message) => {
        const { activeSessionId } = get()
        if (!activeSessionId) throw new Error('No active session')

        set({ isLoading: true })
        try {
          await sessionsApi.commit(workspaceId, activeSessionId, { message })
          set((state) => ({
            sessions: state.sessions.filter((s) => s.id !== activeSessionId),
            activeSessionId: null,
            activeSession: null,
            operations: [],
            undoStack: [],
            redoStack: [],
            canUndo: false,
            canRedo: false,
            isLoading: false,
          }))
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      discardSession: async (workspaceId) => {
        const { activeSessionId } = get()
        if (!activeSessionId) throw new Error('No active session')

        set({ isLoading: true })
        try {
          await sessionsApi.discard(workspaceId, activeSessionId)
          set((state) => ({
            sessions: state.sessions.filter((s) => s.id !== activeSessionId),
            activeSessionId: null,
            activeSession: null,
            operations: [],
            undoStack: [],
            redoStack: [],
            canUndo: false,
            canRedo: false,
            isLoading: false,
          }))
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      undo: async (workspaceId) => {
        const { activeSessionId } = get()
        if (!activeSessionId) return

        try {
          const operation = await sessionsApi.undo(workspaceId, activeSessionId)
          set((state) => ({
            undoStack: state.undoStack.slice(0, -1),
            redoStack: [...state.redoStack, operation],
            canUndo: state.undoStack.length > 1,
            canRedo: true,
          }))
        } catch {
          // Handle undo error
        }
      },

      redo: async (workspaceId) => {
        const { activeSessionId } = get()
        if (!activeSessionId) return

        try {
          const operation = await sessionsApi.redo(workspaceId, activeSessionId)
          set((state) => ({
            redoStack: state.redoStack.slice(0, -1),
            undoStack: [...state.undoStack, operation],
            canUndo: true,
            canRedo: state.redoStack.length > 1,
          }))
        } catch {
          // Handle redo error
        }
      },

      fetchOperations: async (workspaceId, sessionId) => {
        try {
          const operations = await sessionsApi.getOperations(workspaceId, sessionId)
          const activeOps = operations.filter((op) => !op.is_undone)
          set({
            operations,
            undoStack: activeOps,
            canUndo: activeOps.length > 0,
            canRedo: operations.length > activeOps.length,
          })
        } catch {
          // Handle error
        }
      },

      addOperation: (operation) => {
        set((state) => ({
          operations: [...state.operations, operation],
          undoStack: [...state.undoStack, operation],
          redoStack: [],
          canUndo: true,
          canRedo: false,
        }))
      },

      clearSession: () => {
        set({
          activeSessionId: null,
          activeSession: null,
          operations: [],
          undoStack: [],
          redoStack: [],
          canUndo: false,
          canRedo: false,
        })
      },
    }),
    {
      name: 'forecasto-session',
      partialize: (state) => ({
        activeSessionId: state.activeSessionId,
      }),
    }
  )
)
