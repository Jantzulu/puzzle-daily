import React from 'react';
import { LINTEL_TORCH_SHEET as SHEET } from '../../assets/ui-kits/lintelTorch';
import { useCrispSnap } from './panelSkins';
import { playChromeSound } from '../../utils/chromeSounds';
import { entryIsDark, onEntryDark } from './enterGateState';

/** The second torch of a pair follows the first by this much (ms). */
const FOLLOW_MS = 220;

/**
 * Torches that light when SEEN catch one after another, never together:
 * each waits until this long after the one before it (ms). On a screen tall
 * enough to show several at once they run down the wall in turn.
 */
const CATCH_GAP_MS = 260;
let lastCatchAt = 0;
function nextCatchDelay(): number {
  const now = performance.now();
  const at = Math.max(now, lastCatchAt + CATCH_GAP_MS);
  lastCatchAt = at;
  return at - now;
}

/** The chrome's art scale (panelSkins Z): CSS px per art px. */
const Z = 2;

/**
 * A torch on the Dungeon Details lintel (user idea 2026-10-15): it burns
 * (the sheet's flame loop over a flickering pool of light), a tap puts it
 * out (a puff of smoke, the light dies away), and another tap relights it.
 * Nothing remembers it past the visit.
 *
 * It does NOT react to the run. For three days (2026-11-13 to 16) a lost
 * run put the torches out and the retry relit them; the user removed it:
 * on a phone the torches are off screen when a run ends, so their sounds
 * played "for a not obvious reason". Do not bring it back.
 * A torch with a `phase` follows its partner a beat later when the dark
 * entry lights them (EnterGate.tsx).
 *
 * `lightOn="seen"` (the cutaway wall's torches, one on each beam; user,
 * 2026-11-21: torches that catch as you scroll down, "especially if the
 * panels appear darker and become more visible with the torch lighting"):
 * such a torch stays OUT until the page has been entered AND it has come
 * fully onto the screen, then catches, once. This is not the run-reaction
 * that was removed: it lights because the player has just scrolled to it,
 * so it is always on screen when it sounds. Its room is dark until it does
 * (index.css .wall-dark reads this torch's --out class).
 *
 * COST (the user asked): no script runs per frame. The flame is a Web
 * Animations transform loop and the light a CSS opacity/scale flicker,
 * both the compositor's work, and both pause while the torch is off screen.
 * They burn under Reduce Motion too (user call 2026-10-15: the movement is
 * minimal, in a project full of it). `phase` (ms) offsets this torch's
 * loops so a pair never burns in step.
 */
export const LintelTorch: React.FC<{ phase?: number; lightOn?: 'entry' | 'seen' }> = ({ phase = 0, lightOn = 'entry' }) => {
  // Out while the page waits in the dark for its first tap (EnterGate.tsx);
  // a torch that lights when seen starts out whatever the page is doing.
  const [lit, setLit] = React.useState(() => lightOn === 'entry' && !entryIsDark());
  // Whole-px placement: the lettering's flex centring can land it on a
  // half pixel, which would blur the art.
  const snapRef = useCrispSnap<HTMLButtonElement>(true);
  const stripRef = React.useRef<HTMLImageElement>(null);
  const loopRef = React.useRef<Animation | null>(null);
  const onScreen = React.useRef(true);
  const fw = SHEET.frameWidth * Z;
  const fh = SHEET.frameHeight * Z;
  const frames = Math.max(SHEET.litFrames, SHEET.outFrame + 1 + SHEET.smokeFrames);

  // The strip: the burning loop while lit; put out, the smoke puff once,
  // then the out frame.
  React.useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const at = (frame: number) => `translateX(${-frame * fw}px)`;
    let anim: Animation | null = null;
    if (lit) {
      strip.style.transform = at(0);
      if (SHEET.litFrames > 1) {
        anim = strip.animate([{ transform: at(0) }, { transform: at(SHEET.litFrames) }], {
          duration: (SHEET.litFrames / SHEET.fps) * 1000,
          iterations: Infinity,
          easing: `steps(${SHEET.litFrames})`,
          delay: -phase,
        });
      }
    } else {
      strip.style.transform = at(SHEET.outFrame);
      if (SHEET.smokeFrames > 0) {
        anim = strip.animate([{ transform: at(SHEET.outFrame + 1) }, { transform: at(SHEET.outFrame + 1 + SHEET.smokeFrames) }], {
          duration: (SHEET.smokeFrames / SHEET.fps) * 1000,
          easing: `steps(${SHEET.smokeFrames})`,
        });
      }
    }
    if (anim && !onScreen.current) anim.pause();
    loopRef.current = anim;
    return () => {
      anim?.cancel();
      loopRef.current = null;
    };
  }, [lit, fw, phase]);

  // Going out and catching each make a sound (chromeSounds.ts): on a tap,
  // and as the dark entry lights them; not when the page first opens, and
  // not from a torch that is off screen.
  const wasLit = React.useRef(lit);
  React.useEffect(() => {
    if (wasLit.current !== lit && onScreen.current) playChromeSound(lit ? 'torch-lit' : 'torch-out', phase ? 1 : 0);
    wasLit.current = lit;
  }, [lit, phase]);

  // THE DARK ENTRY: the tap that enters the page lights the torches, the
  // second a beat after the first, each with its sound.
  React.useEffect(() => {
    if (lightOn !== 'entry') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onEntryDark(dark => {
      clearTimeout(timer);
      if (!dark) timer = setTimeout(() => setLit(true), phase ? FOLLOW_MS : 0);
    });
    return () => { off(); clearTimeout(timer); };
  }, [phase, lightOn]);

  // LIT WHEN SEEN: once the page has been entered and the torch has come
  // wholly onto the screen (and a little clear of its foot), it catches, in
  // its turn. Once only: after that it is the player's to put out and relight.
  React.useEffect(() => {
    if (lightOn !== 'seen') return;
    const el = snapRef.current;
    if (!el) return;
    let seen = typeof IntersectionObserver === 'undefined'; // nothing to watch with: do not leave it dark
    let entered = !entryIsDark();
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tryLight = () => {
      if (done || !seen || !entered) return;
      done = true;
      timer = setTimeout(() => setLit(true), nextCatchDelay());
    };
    const off = onEntryDark(dark => { entered = !dark; tryLight(); });
    let io: IntersectionObserver | undefined;
    if (!seen) {
      io = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        seen = true;
        io?.disconnect();
        tryLight();
      }, { threshold: 1, rootMargin: '0px 0px -10% 0px' });
      io.observe(el);
    }
    tryLight();
    return () => { off(); io?.disconnect(); clearTimeout(timer); };
  }, [lightOn, snapRef]);

  // Off screen, nothing runs: the strip's loop pauses, and data-offscreen
  // pauses the light's flicker (index.css).
  React.useEffect(() => {
    const el = snapRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => {
      onScreen.current = entry.isIntersecting;
      el.toggleAttribute('data-offscreen', !entry.isIntersecting);
      const anim = loopRef.current;
      if (anim && anim.playState !== 'finished') {
        if (entry.isIntersecting) anim.play(); else anim.pause();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [snapRef]);

  return (
    <button
      ref={snapRef}
      type="button"
      className={`lintel-torch${lit ? '' : ' lintel-torch--out'}`}
      style={{
        width: fw,
        height: fh,
        '--torch-flame-x': `${SHEET.flameX * Z}px`,
        '--torch-flame-y': `${SHEET.flameY * Z}px`,
        '--torch-phase': `${-phase}ms`,
      } as React.CSSProperties}
      onClick={() => setLit(l => !l)}
      aria-label={lit ? 'Put out the torch' : 'Light the torch'}
    >
      <span className="lintel-torch-light" aria-hidden="true"><span /></span>
      <span className="lintel-torch-frame" aria-hidden="true">
        <img ref={stripRef} src={SHEET.url} alt="" draggable={false} width={frames * fw} height={fh} />
      </span>
    </button>
  );
};
