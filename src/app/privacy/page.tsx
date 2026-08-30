export const metadata = { title: 'Privacy notice' };

/**
 * Privacy notice.
 *
 * Deliberately concrete about the one piece of personal data the club holds
 * that is not already public: dates of birth. The final wording and the stated
 * lawful basis need the club owner's approval before launch — see the README.
 */
export default function PrivacyPage() {
  return (
    <div className="shell pad-block stack-lg">
      <header className="stack" style={{ gap: '0.5rem' }}>
        <p className="eyebrow">About this site</p>
        <h1 style={{ fontSize: 'clamp(1.75rem, 6vw, 2.5rem)', textTransform: 'uppercase' }}>
          Privacy notice
        </h1>
      </header>

      <div className="prose stack">
        <section>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Who can see results</h2>
          <p>
            Runner names, finishing times, positions, points and age-grade percentages are shown on
            this site so members can follow the club&rsquo;s competitions.
          </p>
          <p>
            The whole site sits behind a single club passcode, and search engines are asked not to
            index it. That means results are visible to club members and to anyone they share the
            passcode with — but not to someone searching for a runner&rsquo;s name on the open
            internet.
          </p>
          <p>
            Be aware of what that does and does not do: it keeps the club&rsquo;s results out of
            public search results, but it is a shared passcode, so it cannot control which
            individual members see what. If you would rather your results were not shown at all,
            speak to a committee member.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>What is private</h2>
          <p>
            The club records each member&rsquo;s date of birth. It is used for one purpose only:
            calculating the age-grade percentage that lets runners of different ages compare their
            performances fairly.
          </p>
          <p>
            A date of birth is never published, never included in any page or data this site sends
            to a browser, never written to a log, and never stored in an offline cache. Only the
            resulting percentage is public.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Administrator accounts</h2>
          <p>
            Club volunteers who maintain results sign in with an individual account. Passwords are
            stored only as a slow cryptographic hash, and sign-in sessions are stored as a hash of a
            random token rather than as anything reusable.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Corrections and removal</h2>
          <p>
            To correct a result, or to ask for your details to be removed from this site, speak to a
            club committee member. A runner can be deactivated so they no longer appear in current
            listings while published competition history stays accurate.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Donations</h2>
          <p>
            The &ldquo;Donate to PSPA&rdquo; link opens JustGiving in a new tab. This site does not
            handle payments and receives no information about donors or amounts.
          </p>
        </section>
      </div>
    </div>
  );
}
