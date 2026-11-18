// Keeping a song playing, live.
//
// A sound is drawn into the audio context all at once. A song cannot be: it
// may loop for as long as a level takes, and a looped song has no end to
// draw up to. So it is drawn A LITTLE AHEAD: every 50 ms, the notes that
// start in the next quarter of a second are scheduled on the audio clock.
// The audio clock does the timing (a note lands on its instant to the
// sample, however late or early this timer wakes); the timer only has to
// keep ahead of it.
//
// Everything goes through one gain node of its own, so that stopping a song
// is a quick fade and not a wait for the notes already drawn to ring out.
//
// A PAGE IN THE BACKGROUND: browsers slow a hidden page's timers to about
// one a second, and a quarter of a second ahead would leave holes in the
// music of a game left playing in another tab. So while the page is hidden
// the song is drawn much further ahead, and the moment it is hidden the
// drawing is topped up at once (the slow timers start right after).

import { noteEvents, ringOut, scheduleSong, songSeconds, type SynthSong } from './song';

const AHEAD_SECONDS = 0.25;
const AHEAD_HIDDEN_SECONDS = 3;
const TICK_MS = 50;
const FADE_SECONDS = 0.04;

export interface SongPlayback {
  /** Stop it (a quick fade). Safe to call twice. */
  stop: () => void;
  /** Where the song is now (s into the current pass), or -1 once it has stopped. */
  position: () => number;
}

export function playSong(
  ctx: BaseAudioContext,
  out: AudioNode,
  song: SynthSong,
  options: { loop?: boolean; /** Start this far in (s). */ from?: number; onEnd?: () => void } = {},
): SongPlayback {
  const total = songSeconds(song);
  const events = noteEvents(song);
  const bus = ctx.createGain();
  bus.connect(out);
  if (!(total > 0)) {
    // (Told a moment later, never before this has returned.)
    setTimeout(() => options.onEnd?.(), 0);
    return { stop: () => undefined, position: () => -1 };
  }

  // The song's time 0 (of its first pass) on the audio clock. A short lead,
  // so the first notes are not asked for in the past.
  const lead = 0.06;
  const offset = Math.min(Math.max(0, options.from ?? 0), total - 1e-6);
  const origin = ctx.currentTime + lead - offset;
  /** Which pass of the song is being drawn, and how far into it (s) the drawing has got. */
  let pass = 0;
  let drawnTo = offset;
  let allDrawn = false;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let ending: ReturnType<typeof setTimeout> | null = null;

  const pageHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
  const onVisibility = () => draw();

  const finish = () => {
    if (stopped) return;
    stopped = true;
    if (timer !== null) clearInterval(timer);
    if (ending !== null) clearTimeout(ending);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    const now = ctx.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(bus.gain.value, now);
    bus.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
    setTimeout(() => { try { bus.disconnect(); } catch { /* already gone */ } }, (FADE_SECONDS + 0.05) * 1000);
  };

  const draw = () => {
    if (stopped) return;
    const until = ctx.currentTime - origin + (pageHidden() ? AHEAD_HIDDEN_SECONDS : AHEAD_SECONDS);
    while (!allDrawn) {
      const passStart = pass * total;
      const to = Math.min(total, until - passStart);
      if (to <= drawnTo) break; // far enough ahead for now
      scheduleSong(ctx, bus, origin + passStart + drawnTo, song, { from: drawnTo, to }, events);
      drawnTo = to;
      if (to < total) break;
      if (options.loop) { pass++; drawnTo = 0; } else allDrawn = true;
    }
    if (allDrawn && ending === null) {
      if (timer !== null) clearInterval(timer);
      timer = null;
      // Let the last notes ring out, then say it is over.
      const left = origin + total + ringOut(song) - ctx.currentTime;
      ending = setTimeout(() => { finish(); options.onEnd?.(); }, Math.max(0, left) * 1000);
    }
  };

  draw();
  if (!stopped && ending === null) timer = setInterval(draw, TICK_MS);
  if (!stopped && typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);

  return {
    stop: finish,
    position: () => {
      if (stopped) return -1;
      const t = ctx.currentTime - origin;
      if (t < 0) return offset;
      return options.loop ? t % total : Math.min(t, total);
    },
  };
}
