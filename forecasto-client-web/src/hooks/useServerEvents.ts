import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { API_BASE_URL } from '@/lib/constants'

interface SSEEventData {
  workspace_id?: string
  action?: string
}

const RECONNECT_BASE_DELAY = 1000
const RECONNECT_MAX_DELAY = 30000

/**
 * Connects to the SSE endpoint and invalidates TanStack Query caches
 * when the server notifies of data changes (e.g. via MCP).
 */
export function useServerEvents() {
  const queryClient = useQueryClient()
  const isAuthenticated = useAuthStore(state => state.isAuthenticated)
  const accessToken = useAuthStore(state => state.accessToken)
  const fetchWorkspaces = useWorkspaceStore(state => state.fetchWorkspaces)

  const abortRef = useRef<AbortController | null>(null)
  const reconnectAttempt = useRef(0)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleEvent = useCallback((eventType: string, data: SSEEventData) => {
    const workspaceId = data.workspace_id

    switch (eventType) {
      case 'records_changed':
        if (workspaceId) {
          queryClient.invalidateQueries({ queryKey: ['records', workspaceId] })
          queryClient.invalidateQueries({ queryKey: ['cashflow', workspaceId] })
          queryClient.invalidateQueries({ queryKey: ['drilldown'] })
        } else {
          // No workspace_id → invalidate all records/cashflow
          queryClient.invalidateQueries({ queryKey: ['records'] })
          queryClient.invalidateQueries({ queryKey: ['cashflow'] })
          queryClient.invalidateQueries({ queryKey: ['drilldown'] })
        }
        break

      case 'cashflow_changed':
        if (workspaceId) {
          queryClient.invalidateQueries({ queryKey: ['cashflow', workspaceId] })
        } else {
          queryClient.invalidateQueries({ queryKey: ['cashflow'] })
        }
        queryClient.invalidateQueries({ queryKey: ['bankAccounts'] })
        break

      case 'bank_accounts_changed':
        queryClient.invalidateQueries({ queryKey: ['bankAccounts'] })
        break

      case 'vat_changed':
        queryClient.invalidateQueries({ queryKey: ['vat-registries'] })
        queryClient.invalidateQueries({ queryKey: ['vat-balances'] })
        break

      case 'workspace_changed':
        fetchWorkspaces()
        break
    }
  }, [queryClient, fetchWorkspaces])

  const connect = useCallback(async (token: string, signal: AbortSignal) => {
    try {
      const response = await fetch(`${API_BASE_URL}/events/stream`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        signal,
      })

      if (!response.ok || !response.body) {
        throw new Error(`SSE connection failed: ${response.status}`)
      }

      // Reset reconnect counter on successful connection
      reconnectAttempt.current = 0

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let currentEventType = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process complete lines
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEventType = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim()
            if (currentEventType && dataStr) {
              try {
                const data = JSON.parse(dataStr) as SSEEventData
                handleEvent(currentEventType, data)
              } catch {
                // Ignore malformed JSON
              }
            }
            currentEventType = ''
          } else if (line.startsWith(':')) {
            // Comment/heartbeat — ignore
          }
        }
      }
    } catch (err: unknown) {
      // Intentional disconnect (cleanup, logout, etc.)
      if (signal.aborted) return
      // AbortError from some browsers
      if (err instanceof DOMException && err.name === 'AbortError') return

      // Schedule reconnect with exponential backoff
      const delay = Math.min(
        RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempt.current),
        RECONNECT_MAX_DELAY
      )
      reconnectAttempt.current++
      console.debug(`[SSE] Disconnected, reconnecting in ${delay}ms...`)
      reconnectTimer.current = setTimeout(() => {
        if (!signal.aborted) {
          connect(token, signal)
        }
      }, delay)
    }
  }, [handleEvent])

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return

    const abort = new AbortController()
    abortRef.current = abort

    connect(accessToken, abort.signal)

    return () => {
      abort.abort()
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
      }
    }
  }, [isAuthenticated, accessToken, connect])
}
