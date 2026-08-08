/* global describe it expect afterEach jest */

jest.mock('expo-constants', () => ({
  expoConfig: { extra: {} },
  manifest: { extra: {} },
  manifest2: { extra: {} },
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(null),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(null),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

const { getApiBaseUrl, getAuthHeaders } = require('./authService.js');

describe('authService', () => {
  const previousExpoOverride = process.env.EXPO_PUBLIC_API_BASE_URL;
  const previousApiOverride = process.env.API_BASE_URL;

  afterEach(() => {
    if (previousExpoOverride !== undefined) {
      process.env.EXPO_PUBLIC_API_BASE_URL = previousExpoOverride;
    } else {
      delete process.env.EXPO_PUBLIC_API_BASE_URL;
    }

    if (previousApiOverride !== undefined) {
      process.env.API_BASE_URL = previousApiOverride;
    } else {
      delete process.env.API_BASE_URL;
    }
  });

  it('uses a shared API base URL from runtime configuration when available', () => {
    const override = 'shared-base';
    process.env.EXPO_PUBLIC_API_BASE_URL = override;
    delete process.env.API_BASE_URL;
    expect(getApiBaseUrl()).toBe(override);
  });

  it('uses the API_BASE_URL runtime variable when EXPO_PUBLIC_API_BASE_URL is not set', () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    process.env.API_BASE_URL = 'api-base-override';
    expect(getApiBaseUrl()).toBe('api-base-override');
  });

  it('uses the configured app API base URL when no runtime override exists', () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    delete process.env.API_BASE_URL;
    expect(getApiBaseUrl()).toBe('http://192.168.1.4:8000/api');
  });

  it('uses the Expo Constants runtime config when available', () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    delete process.env.API_BASE_URL;
    jest.resetModules();
    jest.doMock('expo-constants', () => ({
      expoConfig: { extra: { apiBaseUrl: 'constants-base' } },
      manifest: { extra: {} },
      manifest2: { extra: {} },
    }));
    const { getApiBaseUrl: getApiBaseUrlWithConstants } = require('./authService.js');
    expect(getApiBaseUrlWithConstants()).toBe('constants-base');
    jest.dontMock('expo-constants');
  });

  it('builds authorization headers when a token exists', async () => {
    await expect(getAuthHeaders('token-123')).resolves.toEqual({
      Authorization: 'Bearer token-123',
    });
  });

  it('returns empty headers when no token exists', async () => {
    await expect(getAuthHeaders()).resolves.toEqual({});
  });
});
