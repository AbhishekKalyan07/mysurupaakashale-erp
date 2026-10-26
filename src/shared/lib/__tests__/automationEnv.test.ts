import { describe, it, expect } from 'vitest';
import { bootstrapAutomationEnv } from '../../../../scripts/automation/env';

describe('scripts/automation/env.ts - Dedicated Automation API Key Mapping', () => {
  it('maps FIREBASE_AUTOMATION_API_KEY to VITE_FIREBASE_API_KEY in metaEnv and sourceEnv', () => {
    const mockSource: Record<string, string | undefined> = {
      NODE_ENV: 'production',
      FIREBASE_AUTOMATION_API_KEY: 'test-dedicated-key-abc',
      VITE_FIREBASE_PROJECT_ID: 'my-project',
    };
    const mockMeta: Record<string, string | undefined> = {};

    bootstrapAutomationEnv(mockSource, mockMeta);

    expect(mockMeta.VITE_FIREBASE_API_KEY).toBe('test-dedicated-key-abc');
    expect(mockSource.VITE_FIREBASE_API_KEY).toBe('test-dedicated-key-abc');
    expect(mockMeta.VITE_FIREBASE_PROJECT_ID).toBe('my-project');
  });

  it('fails fast in non-emulator mode if FIREBASE_AUTOMATION_API_KEY is missing, preventing silent fallback', () => {
    const mockSource: Record<string, string | undefined> = {
      NODE_ENV: 'production',
      VITE_FIREBASE_API_KEY: 'browser-restricted-key',
    };
    const mockMeta: Record<string, string | undefined> = {};

    expect(() => bootstrapAutomationEnv(mockSource, mockMeta)).toThrow(
      '[Automation Bootstrap] Missing required secret: FIREBASE_AUTOMATION_API_KEY'
    );
  });

  it('fails fast if FIREBASE_AUTOMATION_API_KEY is whitespace only', () => {
    const mockSource: Record<string, string | undefined> = {
      NODE_ENV: 'production',
      FIREBASE_AUTOMATION_API_KEY: '   ',
    };
    const mockMeta: Record<string, string | undefined> = {};

    expect(() => bootstrapAutomationEnv(mockSource, mockMeta)).toThrow(
      '[Automation Bootstrap] Missing required secret: FIREBASE_AUTOMATION_API_KEY'
    );
  });

  it('allows execution in test mode when FIREBASE_AUTOMATION_API_KEY is absent', () => {
    const mockSource: Record<string, string | undefined> = {
      NODE_ENV: 'test',
      VITE_FIREBASE_API_KEY: 'mock-key',
    };
    const mockMeta: Record<string, string | undefined> = {};

    expect(() => bootstrapAutomationEnv(mockSource, mockMeta)).not.toThrow();
    expect(mockMeta.VITE_FIREBASE_API_KEY).toBe('mock-key');
  });

  it('allows execution in emulator mode when FIREBASE_AUTOMATION_API_KEY is absent', () => {
    const mockSource: Record<string, string | undefined> = {
      NODE_ENV: 'production',
      VITE_USE_FIREBASE_EMULATORS: 'true',
      VITE_FIREBASE_API_KEY: 'mock-key',
    };
    const mockMeta: Record<string, string | undefined> = {};

    expect(() => bootstrapAutomationEnv(mockSource, mockMeta)).not.toThrow();
  });

  it('sanitizes and trims the API key string without logging key content', () => {
    const mockSource: Record<string, string | undefined> = {
      NODE_ENV: 'production',
      FIREBASE_AUTOMATION_API_KEY: '  trimmed-key-xyz  ',
    };
    const mockMeta: Record<string, string | undefined> = {};

    bootstrapAutomationEnv(mockSource, mockMeta);
    expect(mockMeta.VITE_FIREBASE_API_KEY).toBe('trimmed-key-xyz');
  });
});
