import AdminAccount from '../models/Admin.js';
import StaffAccount from '../models/Staff.js';

export const ELEVATED_ROLES = ['admin', 'staff'];
export const MANAGED_ROLES = ['admin', 'staff', 'customer'];

export function isElevatedRole(role) {
  return ELEVATED_ROLES.includes(String(role || '').trim().toLowerCase());
}

export function normalizeManagedRole(role) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  return MANAGED_ROLES.includes(normalizedRole) ? normalizedRole : '';
}

export function toManagedRoleLabel(role) {
  const normalizedRole = normalizeManagedRole(role);
  if (normalizedRole === 'admin') return 'Admin';
  if (normalizedRole === 'staff') return 'Staff';
  if (normalizedRole === 'customer') return 'Customer';
  return '';
}

export function getElevatedAccountModel(role) {
  return String(role || '').trim().toLowerCase() === 'staff' ? StaffAccount : AdminAccount;
}