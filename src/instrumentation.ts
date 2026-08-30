/**
 * Server startup hook.
 *
 * Next.js runs this once, before the first request is served. Validating the
 * configuration here is what makes "fail fast with a useful message" true: a
 * deployment missing `SESSION_SECRET`, pointing `JUSTGIVING_URL` at a
 * placeholder, or serving over plain HTTP crashes on boot with a readable
 * message rather than starting and quietly behaving unsafely.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { assertConfigurationAtStartup, ConfigurationError } = await import('./lib/config');

  try {
    assertConfigurationAtStartup();
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error(`\nRMPAC failed to start.\n\n${error.message}\n`);
    } else {
      console.error('\nRMPAC failed to start due to an unexpected configuration error.\n', error);
    }
    // Rethrowing is deliberate: a half-configured production server is worse
    // than one that is plainly down and visible to the platform's health check.
    // Next.js aborts startup when this hook throws.
    throw error;
  }
}
