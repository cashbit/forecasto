import apiClient from './client'
import type {
  EInvoiceSummary,
  Invoice,
  InvoiceDraftCreate,
  InvoiceUpdate,
  ParsedScadenza,
} from '@/types/invoice'

export const invoicesApi = {
  parsePaymentTerms: async (
    workspaceId: string,
    text: string,
    issueDate: string,
  ): Promise<ParsedScadenza[]> => {
    const response = await apiClient.post<{ success: boolean; scadenze: ParsedScadenza[] }>(
      `/workspaces/${workspaceId}/invoices/parse-payment-terms`,
      { text, issue_date: issueDate },
    )
    return response.data.scadenze
  },

  list: async (
    workspaceId: string,
    limit = 100,
    offset = 0,
  ): Promise<{ invoices: Invoice[]; total: number }> => {
    const response = await apiClient.get<{ success: boolean; invoices: Invoice[]; total: number }>(
      `/workspaces/${workspaceId}/invoices`,
      { params: { limit, offset } },
    )
    return { invoices: response.data.invoices, total: response.data.total }
  },

  get: async (workspaceId: string, documentId: string): Promise<Invoice> => {
    const response = await apiClient.get<{ success: boolean; invoice: Invoice }>(
      `/workspaces/${workspaceId}/invoices/${documentId}`,
    )
    return response.data.invoice
  },

  createDraft: async (workspaceId: string, data: InvoiceDraftCreate): Promise<Invoice> => {
    const response = await apiClient.post<{ success: boolean; invoice: Invoice }>(
      `/workspaces/${workspaceId}/invoices/draft`,
      data,
    )
    return response.data.invoice
  },

  update: async (workspaceId: string, documentId: string, data: InvoiceUpdate): Promise<Invoice> => {
    const response = await apiClient.patch<{ success: boolean; invoice: Invoice }>(
      `/workspaces/${workspaceId}/invoices/${documentId}`,
      data,
    )
    return response.data.invoice
  },

  issue: async (workspaceId: string, documentId: string): Promise<Invoice> => {
    const response = await apiClient.post<{ success: boolean; invoice: Invoice }>(
      `/workspaces/${workspaceId}/invoices/${documentId}/issue`,
    )
    return response.data.invoice
  },

  markSentToClient: async (workspaceId: string, documentId: string): Promise<Invoice> => {
    const response = await apiClient.post<{ success: boolean; invoice: Invoice }>(
      `/workspaces/${workspaceId}/invoices/${documentId}/sent-to-client`,
    )
    return response.data.invoice
  },

  recordSdiSubmission: async (
    workspaceId: string,
    documentId: string,
    outcome?: string | null,
  ): Promise<Invoice> => {
    const response = await apiClient.post<{ success: boolean; invoice: Invoice }>(
      `/workspaces/${workspaceId}/invoices/${documentId}/sdi-submission`,
      { outcome: outcome ?? null },
    )
    return response.data.invoice
  },

  listEInvoices: async (workspaceId: string, documentId: string): Promise<EInvoiceSummary[]> => {
    const response = await apiClient.get<{ success: boolean; einvoices: EInvoiceSummary[] }>(
      `/workspaces/${workspaceId}/invoices/${documentId}/einvoices`,
    )
    return response.data.einvoices
  },

  downloadEInvoiceXml: async (workspaceId: string, einvoiceId: string): Promise<void> => {
    const resp = await apiClient.get(`/workspaces/${workspaceId}/einvoices/${einvoiceId}/xml`, {
      responseType: 'blob',
    })
    const cd = (resp.headers['content-disposition'] as string) || ''
    const m = /filename="?([^"]+)"?/.exec(cd)
    const name = m ? m[1] : 'einvoice.xml'
    const url = URL.createObjectURL(resp.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
}
