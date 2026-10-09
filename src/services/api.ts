import type {ApiErrorKind, ApiOptions, ApiPrefix} from '../types/api';
import {isRecord} from '../types/api';
import {clearSession, readSession, requirePasswordChange} from './auth';

export class ApiError extends Error {
  constructor(message: string, public status: number, public kind: ApiErrorKind = 'http') {super(message); this.name = 'ApiError';}
}
export function apiUrl(endpoint: string, prefix: ApiPrefix = import.meta.env?.VITE_API_PREFIX === '/api' ? '/api' : '/.netlify/functions'): string {
  if (!/^[a-z][a-z0-9-]*(?:\?[^#]*)?$/.test(endpoint) || /[\r\n]/.test(endpoint)) throw new Error('Invalid API endpoint.');
  return `${prefix}/${endpoint}`;
}
export function apiRequest(endpoint: string, options: ApiOptions & {responseType: 'blob'}): Promise<Blob>;
export function apiRequest(endpoint: string, options: ApiOptions & {responseType: 'text'}): Promise<string>;
export function apiRequest(endpoint: string, options?: ApiOptions): Promise<unknown>;
export async function apiRequest(endpoint: string, options: ApiOptions = {}): Promise<unknown> {
  const {prefix, body, responseType = 'json', authenticated = true, ...init} = options;
  const headers = new Headers(init.headers);
  if (authenticated) {const session = readSession(); if (session) headers.set('Authorization', `Bearer ${session.token}`);}
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(apiUrl(endpoint, prefix), {...init, headers, ...(body !== undefined ? {body: JSON.stringify(body)} : {})});
  // Inspect JSON errors even when the successful response is a file download.
  let parsed: unknown;
  const isJson = response.headers.get('content-type')?.includes('json');
  if (isJson) {try {parsed = await response.json();} catch {parsed = null;}}
  const message = isRecord(parsed) && typeof parsed.error === 'string' ? parsed.error : 'The request could not be completed. Please try again.';
  if (response.status === 401) {clearSession(); throw new ApiError('Your session has expired. Please sign in again.', 401, 'unauthenticated');}
  if (response.status === 403) {
    if ((isRecord(parsed) && parsed.mustChangePassword === true) || /^password change required:/i.test(message)) {
      requirePasswordChange(); throw new ApiError('Please change your temporary password to continue.', 403, 'password-change');
    }
    throw new ApiError(message, 403, 'forbidden');
  }
  if (!response.ok) throw new ApiError(message, response.status);
  if (responseType === 'blob') {if (isJson) throw new ApiError('The download did not return a file.', response.status, 'invalid-response');return response.blob();}
  if (responseType === 'text') return isJson ? JSON.stringify(parsed) : response.text();
  if (!isJson || parsed === null || parsed === undefined) throw new ApiError('The server returned an invalid response.', response.status, 'invalid-response');
  if (isRecord(parsed) && parsed.success === false) throw new ApiError(message, response.status);
  return parsed;
}
