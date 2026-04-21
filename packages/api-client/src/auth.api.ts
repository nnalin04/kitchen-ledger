import { getClient } from './client';
import type { AuthResponse, User, Tenant, TenantSettings } from '@kitchenledger/types';
import type { AxiosResponse } from 'axios';

export const authApi = {
  register: (data: {
    email: string;
    password: string;
    restaurantName: string;
    phone?: string;
  }): Promise<AxiosResponse<AuthResponse>> =>
    getClient().post('/api/auth/register', data),

  login: (email: string, password: string): Promise<AxiosResponse<AuthResponse>> =>
    getClient().post('/api/auth/login', { email, password }),

  refresh: (refreshToken: string): Promise<AxiosResponse<AuthResponse>> =>
    getClient().post('/api/auth/refresh', { refresh_token: refreshToken }),

  logout: (refreshToken: string): Promise<AxiosResponse<void>> =>
    getClient().post('/api/auth/logout', { refresh_token: refreshToken }),

  me: (): Promise<AxiosResponse<User>> =>
    getClient().get('/api/auth/me'),

  updateMe: (data: {
    fullName?: string;
    phone?: string;
    language?: string;
  }): Promise<AxiosResponse<User>> =>
    getClient().patch('/api/auth/me', data),

  changePassword: (
    currentPassword: string,
    newPassword: string,
  ): Promise<AxiosResponse<void>> =>
    getClient().post('/api/auth/me/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    }),

  forgotPassword: (email: string): Promise<AxiosResponse<void>> =>
    getClient().post('/api/auth/forgot-password', { email }),

  resetPassword: (
    token: string,
    newPassword: string,
    confirmPassword: string,
  ): Promise<AxiosResponse<void>> =>
    getClient().post('/api/auth/reset-password', {
      token,
      new_password: newPassword,
      confirm_password: confirmPassword,
    }),

  getUsers: (): Promise<AxiosResponse<User[]>> =>
    getClient().get('/api/auth/users'),

  inviteUser: (data: {
    email: string;
    fullName: string;
    role: string;
    phone?: string;
  }): Promise<AxiosResponse<User>> =>
    getClient().post('/api/auth/users/invite', data),

  updateUser: (
    userId: string,
    data: { role?: string; isActive?: boolean },
  ): Promise<AxiosResponse<User>> =>
    getClient().patch(`/api/auth/users/${userId}`, data),

  getTenantSettings: (): Promise<AxiosResponse<TenantSettings>> =>
    getClient().get('/api/auth/tenant/settings'),

  updateTenantSettings: (
    settings: Record<string, unknown>,
  ): Promise<AxiosResponse<TenantSettings>> =>
    getClient().patch('/api/auth/tenant/settings', settings),

  getTenantProfile: (): Promise<AxiosResponse<Tenant>> =>
    getClient().get('/api/auth/tenant/profile'),

  updateTenantProfile: (
    data: Record<string, unknown>,
  ): Promise<AxiosResponse<Tenant>> =>
    getClient().patch('/api/auth/tenant/profile', data),
};
