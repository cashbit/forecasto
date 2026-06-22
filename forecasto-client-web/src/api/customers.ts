import apiClient from './client'
import type { Customer, CustomerUpsert, ViesLookupResponse } from '@/types/customer'

export const customersApi = {
  list: async (
    workspaceId: string,
    search?: string,
    limit = 100,
    offset = 0,
  ): Promise<{ customers: Customer[]; total: number }> => {
    const response = await apiClient.get<{ success: boolean; customers: Customer[]; total: number }>(
      `/workspaces/${workspaceId}/customers`,
      { params: { search: search || undefined, limit, offset } },
    )
    return { customers: response.data.customers, total: response.data.total }
  },

  get: async (workspaceId: string, documentId: string): Promise<Customer> => {
    const response = await apiClient.get<{ success: boolean; customer: Customer }>(
      `/workspaces/${workspaceId}/customers/${documentId}`,
    )
    return response.data.customer
  },

  upsert: async (workspaceId: string, data: CustomerUpsert): Promise<Customer> => {
    const response = await apiClient.post<{ success: boolean; customer: Customer }>(
      `/workspaces/${workspaceId}/customers`,
      data,
    )
    return response.data.customer
  },

  viesLookup: async (
    workspaceId: string,
    countryCode: string,
    vatNumber: string,
  ): Promise<ViesLookupResponse> => {
    const response = await apiClient.post<ViesLookupResponse>(
      `/workspaces/${workspaceId}/customers/vies-lookup`,
      { country_code: countryCode, vat_number: vatNumber },
    )
    return response.data
  },
}
