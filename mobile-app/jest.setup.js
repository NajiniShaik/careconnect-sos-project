// Jest setup is intentionally minimal for unit tests.
// Provide CommonJS-safe mocks for some ESM-only expo virtual modules Jest doesn't transpile.

// Mock the ESM-only expo virtual env module so tests can access `env` synchronously.
try {
	jest.mock('expo/virtual/env', () => ({ env: process.env }), { virtual: true });
} catch (e) {}

// Provide a minimal `expo` mock to prevent importing ESM-only files during unit tests.
try {
	jest.mock('expo', () => ({
		Constants: { manifest: {}, expoConfig: {} },
	}), { virtual: true });
} catch (e) {}
