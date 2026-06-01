import { apiPost } from './client';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export function login(data: { email: string; password: string }): Promise<LoginResponse> {
  return apiPost<LoginResponse>('/api/auth/login', data);
}

export function getMe(): Promise<User> {
  return apiPost<User>('/api/auth/me');
}

export function logout(): Promise<void> {
  return apiPost<void>('/api/auth/logout');
}
