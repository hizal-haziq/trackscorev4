import type {AuthSession, LoginResponse, Role} from '../types/auth';
import {isRecord} from '../types/api';

export const AUTH_KEYS = {token: 'trackscore_token', role: 'trackscore_user_role', user: 'trackscore_user'} as const;
export const AUTH_CHANGED = 'trackscore:auth-changed';
const isRole = (role: unknown): role is Role => role === 'manager' || role === 'assessor' || role === 'vendor';
function storage(): Storage | null {
  try {return typeof window !== 'undefined' ? window.localStorage : null;} catch {return null;}
}
function announce() {if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_CHANGED));}
function parse(value: string | null): unknown {try {return JSON.parse(value || '{}');} catch {return {};}}
function claims(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), c => c.charCodeAt(0));
    const decoded: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return isRecord(decoded) ? decoded : null;
  } catch {return null;}
}
/** Decoding is for UX only. Every private API still verifies the JWT on the server. */
export function readSession(now = Date.now()): AuthSession | null {
  const store = storage();
  const token = store?.getItem(AUTH_KEYS.token);
  if (!token) return null;
  const payload = claims(token);
  if (!payload || !isRole(payload.role)) return null;
  const expiresAt = typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp * 1000 : null;
  if (expiresAt !== null && expiresAt <= now) return null;
  const raw = parse(store?.getItem(AUTH_KEYS.user) || null);
  const profile = isRecord(raw) ? raw : {};
  return {token, expiresAt, user: {
    id: typeof payload.userId === 'string' ? payload.userId : typeof payload.vendorId === 'string' ? payload.vendorId : undefined,
    role: payload.role,
    name: typeof payload.name === 'string' ? payload.name : typeof profile.name === 'string' ? profile.name : 'TrackScore user',
    email: typeof payload.email === 'string' ? payload.email : '',
    assessorId: typeof payload.assessorId === 'string' ? payload.assessorId : undefined,
    mustChangePassword: payload.mustChangePassword === true || profile.mustChangePassword === true,
  }};
}
export function clearSession() {
  const store = storage();
  for (const key of Object.values(AUTH_KEYS)) store?.removeItem(key);
  if (typeof window !== 'undefined') window.sessionStorage.removeItem('manager_authenticated');
  announce();
}
export function saveSession(response: LoginResponse) {
  const payload = claims(response.token);
  if (!payload || !isRole(payload.role) || payload.role !== response.role) throw new Error('Invalid sign-in response.');
  const store = storage();
  store?.setItem(AUTH_KEYS.token, response.token);
  store?.setItem(AUTH_KEYS.role, payload.role);
  store?.setItem(AUTH_KEYS.user, JSON.stringify({...response.user, mustChangePassword: response.mustChangePassword === true || payload.mustChangePassword === true}));
  if (typeof window !== 'undefined' && payload.role === 'manager') window.sessionStorage.setItem('manager_authenticated', 'true');
  announce();
}
export function requirePasswordChange() {
  const store = storage();
  const profile = parse(store?.getItem(AUTH_KEYS.user) || null);
  store?.setItem(AUTH_KEYS.user, JSON.stringify({...isRecord(profile) ? profile : {}, mustChangePassword: true}));
  announce();
}
