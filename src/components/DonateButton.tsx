import { getConfig } from '@/lib/config';

/**
 * The fixed JustGiving action, present on every route including admin.
 *
 * It is a plain outbound link and nothing more: the application processes no
 * payments, stores no donor data and never reads a fundraising total. The
 * destination comes from validated configuration, and production refuses to
 * start unless it is a real justgiving.com address.
 */
export function DonateButton() {
  const { justGivingUrl } = getConfig();

  return (
    <a
      className="donate"
      href={justGivingUrl}
      target="_blank"
      rel="noopener noreferrer external"
      data-testid="donate-action"
    >
      <svg
        className="donate__icon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M12 21s-7.5-4.7-9.5-9A5.2 5.2 0 0 1 12 6.6 5.2 5.2 0 0 1 21.5 12c-2 4.3-9.5 9-9.5 9Z" />
      </svg>
      <span>
        Donate to PSPA
        <span className="visually-hidden"> (opens JustGiving in a new tab)</span>
      </span>
    </a>
  );
}
