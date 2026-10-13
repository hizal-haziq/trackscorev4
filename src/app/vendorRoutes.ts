export type VendorPage =
  | 'dashboard'
  | 'assessments'
  | 'assessment-detail'
  | 'actions'
  | 'documents'
  | 'certificates'
  | 'profile'
  | 'missing';

export interface VendorRouteState {
  page: VendorPage;
  id?: string;
}

export function parseVendorLocation(hash: string): VendorRouteState {
  const clean = (hash || '').replace(/^#\/?/, '').trim();

  if (!clean || clean === 'dashboard') {
    return { page: 'dashboard' };
  }

  if (clean === 'assessments') {
    return { page: 'assessments' };
  }

  if (clean.startsWith('assessments/')) {
    const id = clean.replace('assessments/', '').trim();
    if (id) {
      return { page: 'assessment-detail', id };
    }
    return { page: 'assessments' };
  }

  if (clean === 'actions') {
    return { page: 'actions' };
  }

  if (clean === 'documents') {
    return { page: 'documents' };
  }

  if (clean === 'certificates') {
    return { page: 'certificates' };
  }

  if (clean === 'profile') {
    return { page: 'profile' };
  }

  return { page: 'missing' };
}


