import { apiGet, apiPost, apiPut } from './client';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerifiedAt?: string | null;
  avatarUrl?: string | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface LoginResponse {
  token: string;
  user: User;
  organizations?: Organization[];
}

export function login(data: { email: string; password: string }): Promise<LoginResponse> {
  return apiPost<LoginResponse>('/api/auth/login', data);
}

export function register(data: { email: string; password: string; name: string }): Promise<LoginResponse> {
  return apiPost<LoginResponse>('/api/auth/register', data);
}

export function getMe(): Promise<User> {
  return apiGet<User>('/api/auth/me');
}

export function logout(): Promise<void> {
  return apiPost<void>('/api/auth/logout');
}

export function logoutAll(): Promise<{ success: boolean; message: string }> {
  return apiPost<{ success: boolean; message: string }>('/api/auth/logout-all');
}

export function verifyEmail(token: string): Promise<{ success: boolean; message: string }> {
  return apiPost<{ success: boolean; message: string }>('/api/auth/verify-email', { token });
}

export function forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
  return apiPost<{ success: boolean; message: string }>('/api/auth/forgot-password', { email });
}

export function resetPassword(token: string, password: string): Promise<{ success: boolean; message: string }> {
  return apiPost<{ success: boolean; message: string }>('/api/auth/reset-password', { token, password });
}

export function changePassword(oldPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
  return apiPut<{ success: boolean; message: string }>('/api/auth/change-password', { oldPassword, newPassword });
}

export function resendVerification(): Promise<{ success: boolean; message: string }> {
  return apiPost<{ success: boolean; message: string }>('/api/auth/resend-verification');
}
