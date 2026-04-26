import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('expo-secure-store', () => ({
  setItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

import * as SecureStore from 'expo-secure-store';
import { storeTokens, getTokens, clearTokens } from '../lib/storage';

describe('storage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('storeTokens writes both keys', async () => {
    await storeTokens('access_abc', 'refresh_xyz');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('kl_access_token', 'access_abc');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('kl_refresh_token', 'refresh_xyz');
  });

  it('getTokens returns null when no tokens stored', async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
    const result = await getTokens();
    expect(result).toBeNull();
  });

  it('getTokens returns tokens when both present', async () => {
    vi.mocked(SecureStore.getItemAsync).mockImplementation((key: string) =>
      Promise.resolve(key === 'kl_access_token' ? 'access_abc' : 'refresh_xyz')
    );
    const result = await getTokens();
    expect(result).toEqual({ accessToken: 'access_abc', refreshToken: 'refresh_xyz' });
  });

  it('clearTokens deletes both keys', async () => {
    await clearTokens();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('kl_access_token');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('kl_refresh_token');
  });
});
