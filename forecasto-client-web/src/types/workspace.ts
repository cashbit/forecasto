export interface Workspace {
  id: string
  name: string
  description?: string
  owner_id: string
  fiscal_year?: number
  is_archived?: boolean
  settings: WorkspaceSettings
  created_at: string
  updated_at: string
  // From list endpoint (WorkspaceWithRole)
  role?: 'owner' | 'admin' | 'member' | 'viewer'
  area_permissions?: AreaPermissions
}

export interface SdiSupplierMapping {
  name: string
  account: string
  vat_deduction: number
}

export interface WorkspaceSettings {
  currency: string
  timezone: string
  fiscal_year_start_month: number
  vat_number?: string
  sdi_supplier_mappings?: Record<string, SdiSupplierMapping>
}

export interface WorkspaceCreate {
  name: string
  description?: string
  settings?: Partial<WorkspaceSettings>
}

export interface WorkspaceUpdate {
  name?: string
  description?: string
  settings?: Partial<WorkspaceSettings>
}

export interface GranularPermission {
  can_read_others: boolean
  can_create: boolean
  can_edit_others: boolean
  can_delete_others: boolean
}

export interface SignPermissions {
  in: GranularPermission
  out: GranularPermission
}

export interface GranularAreaPermissions {
  budget: SignPermissions
  prospect: SignPermissions
  orders: SignPermissions
  actual: SignPermissions
}

export interface AreaPermissions {
  actual: 'none' | 'read' | 'write'
  orders: 'none' | 'read' | 'write'
  prospect: 'none' | 'read' | 'write'
  budget: 'none' | 'read' | 'write'
}

export type Area = 'budget' | 'prospect' | 'orders' | 'actual'
export type Sign = 'in' | 'out'
export type PermissionType = 'can_read_others' | 'can_create' | 'can_edit_others' | 'can_delete_others'

export function getDefaultGranularPermissions(): GranularAreaPermissions {
  const defaultSignPerms: SignPermissions = {
    in: { can_read_others: true, can_create: true, can_edit_others: true, can_delete_others: true },
    out: { can_read_others: true, can_create: true, can_edit_others: true, can_delete_others: true },
  }
  return {
    budget: { ...defaultSignPerms },
    prospect: { ...defaultSignPerms },
    orders: { ...defaultSignPerms },
    actual: { ...defaultSignPerms },
  }
}

export interface WorkspaceMember {
  id: string
  user_id?: string
  workspace_id?: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  area_permissions?: AreaPermissions
  granular_permissions?: GranularAreaPermissions | null
  can_view_in_consolidated_cashflow?: boolean
  can_import: boolean
  can_import_sdi: boolean
  can_export: boolean
  user: {
    id: string
    email: string
    name: string
  }
  joined_at: string
}

export interface MemberUpdate {
  role?: 'owner' | 'admin' | 'member' | 'viewer'
  area_permissions?: AreaPermissions
  granular_permissions?: GranularAreaPermissions
  can_view_in_consolidated_cashflow?: boolean
  can_import?: boolean
  can_import_sdi?: boolean
  can_export?: boolean
}

export interface PendingInvitation {
  id: string
  workspace_id: string
  workspace_name: string | null
  role: string
  area_permissions: AreaPermissions
  granular_permissions: GranularAreaPermissions | null
  can_import: boolean
  can_import_sdi: boolean
  can_export: boolean
  created_at: string
  expires_at: string
}

export interface WorkspaceInvitation {
  id: string
  invite_code: string
  user_name: string
  role: string
  area_permissions: AreaPermissions
  granular_permissions: GranularAreaPermissions | null
  can_import: boolean
  can_import_sdi: boolean
  can_export: boolean
  created_at: string
  expires_at: string
}
