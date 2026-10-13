/**
 * Safe role-aware dashboard routing.
 * Always resolves to the user's authoritative role home portal.
 * Never redirects across role boundaries.
 */
export function getRoleHome(role?: string | null): string {
  const normalized = typeof role === 'string' ? role.trim().toLowerCase() : '';
  if (normalized === 'manager') return '/react/manager.html';
  if (normalized === 'assessor') return '/react/assessor.html';
  if (normalized === 'vendor') return '/react/vendor.html';
  return '/login.html';
}

