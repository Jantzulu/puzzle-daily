import React from 'react';
import { runStatusMessage, type RunStatus } from './runStatusMessage';

/**
 * Speaks the run's state to screen readers: heroes placed, run started,
 * victory or defeat, and the replay position. Visually hidden; a polite live
 * region announces whenever its text changes.
 */
export const RunAnnouncer: React.FC<RunStatus> = (props) => (
  <div className="sr-only" role="status" aria-live="polite">
    {runStatusMessage(props)}
  </div>
);
