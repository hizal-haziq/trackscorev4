export type ApiPrefix = '/.netlify/functions' | '/api';
export type ApiErrorKind = 'unauthenticated' | 'forbidden' | 'password-change' | 'http' | 'invalid-response';
export interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  prefix?: ApiPrefix;
  responseType?: 'json' | 'blob' | 'text';
  authenticated?: boolean;
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
