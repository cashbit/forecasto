/** Extract a human-readable message from an Axios/FastAPI error response. */
export function extractError(e: unknown, fallback: string): string {
  if (e && typeof e === 'object' && 'response' in e) {
    const ax = e as {
      response?: { data?: { message?: string; error?: string; detail?: string } }
    }
    return (
      ax.response?.data?.message ||
      ax.response?.data?.error ||
      ax.response?.data?.detail ||
      fallback
    )
  }
  return fallback
}
