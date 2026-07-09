import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { consentDecided, setConsent, subscribeConsent, applyStartupConsent } from '../../utils/consent';

/**
 * Privacy consent banner — shown once, until the player accepts or declines
 * optional play analytics + error diagnostics. Non-blocking: it sits at the
 * bottom over the page and never gates gameplay. Essential storage (game
 * progress, settings) needs no consent and isn't mentioned as optional.
 *
 * Mounted once at app root so it persists across route changes; renders
 * nothing once a choice is on record.
 */
export const ConsentBanner: React.FC = () => {
  const [decided, setDecided] = useState(true); // assume decided → no flash before the effect reads storage

  useEffect(() => {
    // Honor a prior "accept" (spins up diagnostics) and reflect current state.
    applyStartupConsent();
    setDecided(consentDecided());
    return subscribeConsent(() => setDecided(consentDecided()));
  }, []);

  if (decided) return null;

  return (
    <div className="consent-banner" role="dialog" aria-label="Privacy choices" aria-live="polite">
      <div className="consent-banner-inner">
        <p className="consent-banner-text">
          We store your progress on this device to run the game. With your OK, we
          also collect <strong>anonymous play stats</strong> to power community
          comparisons and improve puzzles.{' '}
          <Link to="/privacy" className="consent-banner-link">Privacy&nbsp;Policy</Link>
        </p>
        <div className="consent-banner-actions">
          <button
            type="button"
            onClick={() => setConsent(false)}
            className="consent-btn consent-btn-decline"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => setConsent(true)}
            className="consent-btn consent-btn-accept"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
};
