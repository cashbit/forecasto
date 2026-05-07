import type { WorkspaceMember } from '@/types/workspace'

/**
 * Check if a member can import JSON records (workspace-level permission)
 */
export function canImport(
  member: WorkspaceMember | undefined
): boolean {
  if (!member) return false
  if (member.role === 'owner' || member.role === 'admin') return true
  return member.can_import ?? false
}

/**
 * Check if a member can import SDI invoices (workspace-level permission)
 */
export function canImportSdi(
  member: WorkspaceMember | undefined
): boolean {
  if (!member) return false
  if (member.role === 'owner' || member.role === 'admin') return true
  return member.can_import_sdi ?? false
}

/**
 * Check if a member can export records (workspace-level permission)
 */
export function canExport(
  member: WorkspaceMember | undefined
): boolean {
  if (!member) return false
  if (member.role === 'owner' || member.role === 'admin') return true
  return member.can_export ?? false
}
