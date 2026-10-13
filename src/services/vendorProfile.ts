import { getStoredToken } from './auth';
import { ApiError } from './api';
import type { VendorProfileResponse } from '../types/vendor';

function getAuthHeader(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Fetches the authenticated vendor's profile.
 */
export async function fetchVendorProfile(
  signal?: AbortSignal
): Promise<VendorProfileResponse> {
  const res = await fetch('/.netlify/functions/vendor-profile', {
    headers: {
      ...getAuthHeader(),
      'Content-Type': 'application/json'
    },
    signal
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new ApiError(data.error || 'Failed to retrieve profile.', res.status);
  }

  return data;
}

/**
 * Updates allowed contact information fields.
 */
export async function updateVendorProfile(payload: {
  contactPerson?: string;
  contactPhone?: string;
  officeAddress?: string;
  state?: string;
  registrationNumber?: string;
}): Promise<VendorProfileResponse> {
  const res = await fetch('/.netlify/functions/vendor-profile', {
    method: 'POST',
    headers: {
      ...getAuthHeader(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'update_profile',
      ...payload
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to update profile.');
  }

  return data;
}

/**
 * Securely changes the vendor password.
 */
export async function changeVendorPassword(payload: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<VendorProfileResponse> {
  const res = await fetch('/.netlify/functions/vendor-profile', {
    method: 'POST',
    headers: {
      ...getAuthHeader(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'change_password',
      ...payload
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Password update failed.');
  }

  return data;
}

