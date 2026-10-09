export type Role = 'manager' | 'assessor' | 'vendor';
export interface SessionUser {
  id?: string;
  name: string;
  email: string;
  role: Role;
  assessorId?: string;
  mustChangePassword: boolean;
}
export interface AuthSession {
  token: string;
  user: SessionUser;
  expiresAt: number | null;
}
export interface LoginResponse {
  success: true;
  token: string;
  role: Role;
  mustChangePassword?: boolean;
  user?: Record<string, unknown>;
}
