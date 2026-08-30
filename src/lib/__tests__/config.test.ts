import { describe, expect, it } from 'vitest';
import {
  ConfigurationError,
  DEV_SESSION_SECRET,
  PLACEHOLDER_JUSTGIVING,
  parseConfig,
} from '../config';

const validDevEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://localhost:5432/rmpac_dev',
  APP_ORIGIN: 'http://localhost:3000',
  SESSION_SECRET: DEV_SESSION_SECRET,
  JUSTGIVING_URL: PLACEHOLDER_JUSTGIVING,
} as NodeJS.ProcessEnv;

const validProdEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:pass@db.internal:5432/rmpac',
  APP_ORIGIN: 'https://rmpac.example',
  SESSION_SECRET: 'a-real-production-secret-of-more-than-32-chars',
  JUSTGIVING_URL: 'https://www.justgiving.com/page/rmpac-london-marathon',
  SITE_PASSCODE: 'a-real-club-passcode',
} as NodeJS.ProcessEnv;

describe('parseConfig', () => {
  it('accepts a complete development environment', () => {
    const config = parseConfig(validDevEnv);
    expect(config.isProduction).toBe(false);
    expect(config.appOrigin).toBe('http://localhost:3000');
    expect(config.allowSampleSeed).toBe(false);
  });

  it('accepts a complete production environment', () => {
    const config = parseConfig(validProdEnv);
    expect(config.isProduction).toBe(true);
    expect(config.justGivingUrl).toContain('justgiving.com');
  });

  it('names every missing required variable at once', () => {
    try {
      parseConfig({ NODE_ENV: 'development' } as NodeJS.ProcessEnv);
      expect.unreachable('expected a ConfigurationError');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      const problems = (error as ConfigurationError).problems.join('\n');
      expect(problems).toContain('DATABASE_URL');
      expect(problems).toContain('APP_ORIGIN');
      expect(problems).toContain('SESSION_SECRET');
      expect(problems).toContain('JUSTGIVING_URL');
    }
  });

  it('rejects a short session secret', () => {
    expect(() => parseConfig({ ...validDevEnv, SESSION_SECRET: 'too-short' })).toThrow(
      /at least 32 characters/,
    );
  });

  it('rejects a trailing slash on APP_ORIGIN', () => {
    // A trailing slash would make every same-origin comparison fail.
    expect(() => parseConfig({ ...validDevEnv, APP_ORIGIN: 'http://localhost:3000/' })).toThrow(
      /trailing slash/,
    );
  });

  describe('production hardening', () => {
    it('refuses to start with the development session secret', () => {
      expect(() => parseConfig({ ...validProdEnv, SESSION_SECRET: DEV_SESSION_SECRET })).toThrow(
        /development placeholder/,
      );
    });

    it('refuses to start with the placeholder donation URL', () => {
      expect(() =>
        parseConfig({ ...validProdEnv, JUSTGIVING_URL: PLACEHOLDER_JUSTGIVING }),
      ).toThrow(/real JustGiving page/);
    });

    it('refuses a donation URL that is not JustGiving', () => {
      // The donate button is the one outbound link the app makes prominent, so
      // it must not be pointable at an arbitrary host by a misconfiguration.
      expect(() =>
        parseConfig({ ...validProdEnv, JUSTGIVING_URL: 'https://evil.example/donate' }),
      ).toThrow(/justgiving\.com/);
    });

    it('refuses a plaintext origin', () => {
      expect(() => parseConfig({ ...validProdEnv, APP_ORIGIN: 'http://rmpac.example' })).toThrow(
        /https in production/,
      );
    });

    it('refuses to start without a club passcode', () => {
      // The club's requirement is that members' names and times are not on the
      // open internet. Booting without a passcode would publish exactly that,
      // so failing to start is the safe way to get it wrong.
      const { SITE_PASSCODE: _omitted, ...withoutPasscode } = validProdEnv;
      expect(() => parseConfig(withoutPasscode as NodeJS.ProcessEnv)).toThrow(
        /SITE_PASSCODE is required in production/,
      );
      expect(() => parseConfig({ ...validProdEnv, SITE_PASSCODE: '   ' })).toThrow(
        /SITE_PASSCODE is required in production/,
      );
    });

    it('refuses a trivially short passcode', () => {
      expect(() => parseConfig({ ...validProdEnv, SITE_PASSCODE: 'abc' })).toThrow(
        /at least 6 characters/,
      );
    });

    it('refuses to enable sample seeding', () => {
      expect(() => parseConfig({ ...validProdEnv, ALLOW_SAMPLE_SEED: 'true' })).toThrow(
        /must not be enabled in production/,
      );
    });

    it('allows all of these in development', () => {
      expect(() => parseConfig({ ...validDevEnv, ALLOW_SAMPLE_SEED: 'true' })).not.toThrow();
    });
  });

  describe('the site gate', () => {
    it('is off when no passcode is configured, so development is not obstructed', () => {
      const config = parseConfig(validDevEnv);
      expect(config.siteIsGated).toBe(false);
      expect(config.sitePasscode).toBe('');
    });

    it('is on as soon as a passcode is configured', () => {
      const config = parseConfig({ ...validDevEnv, SITE_PASSCODE: 'portland2026' });
      expect(config.siteIsGated).toBe(true);
      expect(config.sitePasscode).toBe('portland2026');
    });

    it('trims the configured passcode, so a stray newline is not part of it', () => {
      const config = parseConfig({ ...validDevEnv, SITE_PASSCODE: '  portland2026\n' });
      expect(config.sitePasscode).toBe('portland2026');
    });

    it('treats a whitespace-only passcode as no gate at all', () => {
      expect(parseConfig({ ...validDevEnv, SITE_PASSCODE: '   ' }).siteIsGated).toBe(false);
    });
  });

  it('falls back to default copy when none is supplied', () => {
    const config = parseConfig(validDevEnv);
    expect(config.welcomeCopy.length).toBeGreaterThan(0);
    expect(config.fundraisingCopy).toContain('PSPA');
  });

  it('uses supplied copy when provided', () => {
    const config = parseConfig({ ...validDevEnv, CLUB_WELCOME_COPY: 'Custom welcome.' });
    expect(config.welcomeCopy).toBe('Custom welcome.');
  });
});

describe('loopback origins in production mode', () => {
  const prodBase = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://localhost:5432/rmpac_e2e',
    SESSION_SECRET: 'an-e2e-secret-that-is-well-over-32-characters',
    JUSTGIVING_URL: 'https://www.justgiving.com/page/rmpac-london-marathon',
    SITE_PASSCODE: 'an-e2e-club-passcode',
  } as NodeJS.ProcessEnv;

  it('allows http on loopback so the real production build can be smoke-tested', () => {
    // A deployment can never have a loopback origin, and browsers already treat
    // loopback as a secure context, so this exemption cannot weaken a real site.
    for (const origin of ['http://localhost:3000', 'http://127.0.0.1:3100']) {
      expect(() => parseConfig({ ...prodBase, APP_ORIGIN: origin }), origin).not.toThrow();
    }
  });

  it('still rejects http on any origin that could actually be public', () => {
    for (const origin of ['http://rmpac.example', 'http://192.168.1.10:3000', 'http://10.0.0.1']) {
      expect(() => parseConfig({ ...prodBase, APP_ORIGIN: origin }), origin).toThrow(
        /https in production/,
      );
    }
  });
});
