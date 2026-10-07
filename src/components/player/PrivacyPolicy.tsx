import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { hasAnalyticsConsent, setConsent, subscribeConsent } from '../../utils/consent';
import { PRIVACY_CONTACT_EMAIL as CONTACT_EMAIL } from '../../utils/privacyContact';

const LAST_UPDATED = 'October 7, 2026';

/**
 * Public privacy policy + the canonical opt-out control. Kept plain and
 * honest — it describes exactly what this app does, no boilerplate for data
 * practices we don't have (no ads, no third-party trackers, no data sales).
 */
export const PrivacyPolicy: React.FC = () => {
  const [analytics, setAnalytics] = useState(hasAnalyticsConsent());

  useEffect(() => subscribeConsent(() => setAnalytics(hasAnalyticsConsent())), []);

  return (
    <div className="min-h-screen theme-root px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-medieval font-bold text-2xl md:text-3xl text-copper-400 text-shadow-dungeon mb-1">
          Privacy Policy
        </h1>
        <p className="text-sm text-stone-400 mb-6">Last updated {LAST_UPDATED}</p>

        {/* Live opt-out — the roadmap's required opt-out mechanism */}
        <div className="dungeon-panel p-4 mb-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-medieval font-semibold text-parchment-100">Anonymous play analytics</div>
              <div className="text-sm text-stone-400">
                {analytics
                  ? 'On — thank you. You can turn this off any time.'
                  : 'Off — no play data leaves this device.'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setConsent(!analytics)}
              role="switch"
              aria-checked={analytics}
              aria-label="Toggle anonymous play analytics"
              className={`consent-toggle ${analytics ? 'consent-toggle-on' : ''}`}
            >
              <span className="consent-toggle-knob" />
            </button>
          </div>
        </div>

        <div className="space-y-6 text-parchment-200 leading-relaxed">
          <section>
            <h2 className="font-medieval font-semibold text-lg text-copper-300 mb-2">The short version</h2>
            <p>
              This is a daily puzzle game. We keep your progress on your own device
              so you can play, and — only if you agree — we collect anonymous
              statistics about how puzzles are played. We do not show ads, we do
              not use third-party advertising or tracking cookies, and we never
              sell your data.
            </p>
          </section>

          <section>
            <h2 className="font-medieval font-semibold text-lg text-copper-300 mb-2">Stored on your device (required)</h2>
            <p>
              To function, the game saves data in your browser's local storage:
              your daily progress and setup, crash-recovery state, sound and
              display preferences, and — if you sign in — your session. This never
              leaves your device except when you sign in or choose to sync, and
              clearing your browser storage erases it.
            </p>
          </section>

          <section>
            <h2 className="font-medieval font-semibold text-lg text-copper-300 mb-2">Anonymous play analytics (optional)</h2>
            <p>
              With your consent, when you finish a puzzle we record the outcome
              (win or loss), your score and rank, which heroes you used, turns
              taken, and time spent. It is tied to a random ID generated in your
              browser — not your name, email, or location. We use it to show you
              how you compare to the community and to help creators balance
              puzzles. No ID is created and nothing is sent until you opt in above,
              and turning the toggle off stops all collection immediately.
            </p>
          </section>

          <section>
            <h2 className="font-medieval font-semibold text-lg text-copper-300 mb-2">Accounts (optional)</h2>
            <p>
              If you create an account, we store your email address, a display
              name (which other players can see) and your role, to sign you in
              and to attribute your saved stats. You can play the daily puzzle
              without an account. You can delete your account at any time from
              your profile page: that permanently removes the account, your
              profile and the puzzle results saved to it.
            </p>
          </section>

          <section>
            <h2 className="font-medieval font-semibold text-lg text-copper-300 mb-2">Error diagnostics (optional)</h2>
            <p>
              With the same consent, if the app crashes we send a technical error
              report to help us fix it. These reports are not created or sent
              unless you opt in.
            </p>
          </section>

          <section>
            <h2 className="font-medieval font-semibold text-lg text-copper-300 mb-2">Retention</h2>
            <p>
              Anonymous completion records are kept to power ongoing community and
              creator statistics. You can withdraw consent at any time with the
              toggle above. Deleting your account removes the results saved to
              it; to request deletion of records tied only to your random ID,
              contact us below.
            </p>
          </section>

          <section>
            <h2 className="font-medieval font-semibold text-lg text-copper-300 mb-2">Your choices</h2>
            <p>
              Use the toggle above to grant or withdraw analytics consent whenever
              you like. Clearing your browser's site data removes everything stored
              on your device, including your random analytics ID.
            </p>
          </section>

          <section>
            <h2 className="font-medieval font-semibold text-lg text-copper-300 mb-2">Children</h2>
            <p>
              This game is made for a general audience and is not directed to
              children under 13. You can play without an account, and your play
              data stays on your device unless you opt in. We don't knowingly collect
              personal information from children under 13; if you believe a
              child has created an account or sent us data, contact us and
              we'll delete it. In some countries (including much of the EU) you
              must be older — up to 16 — to agree to optional data collection on
              your own; if that's you, please ask a parent before turning on
              analytics or creating an account.
            </p>
          </section>

          <section>
            <h2 className="font-medieval font-semibold text-lg text-copper-300 mb-2">Contact</h2>
            <p>
              Questions or data requests: <a href={`mailto:${CONTACT_EMAIL}`} className="text-copper-400 underline">{CONTACT_EMAIL}</a>
            </p>
          </section>
        </div>

        <div className="mt-8">
          <Link to="/" className="text-copper-400 font-medieval hover:text-copper-300">← Back to the game</Link>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
