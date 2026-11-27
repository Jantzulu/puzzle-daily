import React from 'react';
import { LINTEL_TORCH_SHEET as SHEET } from '../../assets/ui-kits/lintelTorch';
import { useCrispSnap } from './panelSkins';
import { playChromeSound } from '../../utils/chromeSounds';
import { onWallMayLight, wallMayLight } from './enterGateState';

/** The second torch of a pair follows the first by this much (ms). */
const FOLLOW_MS = 220;

/**
 * Torches that light when SEEN catch one after another, never together:
 * each waits until this long after the one before it (ms). On a screen tall
 * enough to show several at once they run down the wall in turn.
 */
const CATCH_GAP_MS = 260;
let lastCatchAt = 0;

/**
 * HOW FAR UP THE SCREEN a torch must be brought before it catches: its foot
 * above this share of the screen's height, from the top (user, 2026-11-21:
 * "we should maybe require the user to bring the panel more up the screen
 * (than simply have it on the screen even by a pixel)"). Two thirds: the
 * panel is well into view, with its first cards showing under the beam.
 */
const SEEN_LINE = 0.67;

/**
 * Has this torch been brought far enough up the screen? If the page cannot
 * scroll far enough to bring it to the line at all (the last panels of a
 * short page; a tall desktop window that shows the whole wall), being wholly
 * on screen is enough: no room may be left dark for good.
 */
/** Wholly on the screen, wherever on it. */
function wholeOnScreen(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.top >= 0 && rect.bottom <= window.innerHeight;
}

/**
 * A desktop-sized window. There, at the moment the wall first lights, every
 * torch on the screen catches, not only the ones brought two thirds up it
 * (user, 2026-11-27: the hero panel lights once the scroll unfurls, "or for
 * desktop, any that are on the screen"). A phone keeps the two-thirds rule:
 * a beam peeping in at the foot of the screen waits to be scrolled to.
 */
function wideScreen(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 768px)').matches;
}

function broughtIntoView(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  const screen = window.innerHeight;
  if (rect.top < 0 || rect.bottom > screen) return false;
  const line = screen * SEEN_LINE;
  if (rect.bottom <= line) return true;
  const furthest = document.documentElement.scrollHeight - screen; // as far as the page scrolls
  const needed = rect.bottom + window.scrollY - line; // the scroll that would bring its foot to the line
  return needed > furthest + 1;
}

/**
 * TOP DOWN: the torches still waiting to be seen. One never catches while
 * another ABOVE it on the page is still out and waiting: the last panels of
 * a short page cannot be brought to the line, so they light as soon as they
 * are on screen, and without this a low room came up before the one over it
 * (seen in the first film: DUNGEON TILES before STATUS EFFECTS). When one
 * catches, the rest look again.
 */
const waiting = new Set<{ el: Element; look: (first?: unknown) => void }>();

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
 * A torch with a `phase` follows its partner a beat later when the wall
 * first lights.
 *
 * `lightOn="opened"` (the hero hall's torch): out until THE WALL MAY LIGHT
 * (enterGateState.ts: after the dark entry, once the quest scroll has
 * unfurled), then it catches, wherever it stands. It was the tap itself
 * until 2026-11-27.
 *
 * `lightOn="seen"` (the cutaway wall's torches, one on each beam; user,
 * 2026-11-21: torches that catch as you scroll down, "especially if the
 * panels appear darker and become more visible with the torch lighting"):
 * such a torch stays OUT until the wall may light AND it has been
 * brought two thirds of the way up the screen (SEEN_LINE; or simply onto
 * the screen, where the page cannot scroll that far, and on a desktop-sized
 * window at the moment the wall first lights), then catches, once.
 * This is not the run-reaction
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
export const LintelTorch: React.FC<{ phase?: number; lightOn?: 'opened' | 'seen' }> = ({ phase = 0, lightOn = 'opened' }) => {
  // Out until the wall may light (the dark entry, then the quest scroll's
  // unfurl); a torch that lights when seen starts out whatever the page is doing.
  const [lit, setLit] = React.useState(() => lightOn === 'opened' && wallMayLight());
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

  // THE WALL'S FIRST LIGHT: when the quest scroll has opened after the dark
  // entry, this torch catches (a second of a pair a beat after the first),
  // with its sound.
  React.useEffect(() => {
    if (lightOn !== 'opened') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onWallMayLight(() => {
      clearTimeout(timer);
      // (It takes its turn among the torches that light when seen: they follow it.)
      timer = setTimeout(() => { lastCatchAt = Math.max(lastCatchAt, performance.now()); setLit(true); }, phase ? FOLLOW_MS : 0);
    });
    return () => { off(); clearTimeout(timer); };
  }, [phase, lightOn]);

  // LIT WHEN SEEN: once the wall may light and the torch has been brought
  // far enough up the screen (broughtIntoView), it catches, in its turn.
  // At the wall's FIRST light on a desktop-sized window, being on the
  // screen is enough (look(true)); the torches after it are told the same.
  // Once only: after that it is the player's to put out and relight.
  // Looked at on every scroll and resize, and whenever the page changes
  // height, until it has caught; then nothing is listening.
  React.useEffect(() => {
    if (lightOn !== 'seen') return;
    const el = snapRef.current;
    if (!el) return;
    let allowed = wallMayLight();
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ro: ResizeObserver | undefined;
    const me = { el, look };
    const stop = () => {
      window.removeEventListener('scroll', look);
      window.removeEventListener('resize', look);
      ro?.disconnect();
      waiting.delete(me);
    };
    // (`first` is true only when called for the wall's first light: a scroll
    // or resize passes its event here, which is not `true`.)
    function look(first?: unknown) {
      if (done || !allowed || !el) return;
      const onScreenIsEnough = first === true && wideScreen();
      if (!(onScreenIsEnough ? wholeOnScreen(el) : broughtIntoView(el))) return;
      // Not before a torch above it that is still waiting.
      const top = el.getBoundingClientRect().top;
      for (const other of waiting) if (other !== me && other.el.getBoundingClientRect().top < top - 1) return;
      done = true;
      stop();
      timer = setTimeout(() => setLit(true), nextCatchDelay());
      for (const other of [...waiting]) other.look(first); // the next one down may go now
    }
    waiting.add(me);
    const off = onWallMayLight(() => { allowed = true; look(true); });
    window.addEventListener('scroll', look, { passive: true });
    window.addEventListener('resize', look);
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(look);
      ro.observe(document.documentElement);
    }
    look();
    return () => { off(); stop(); clearTimeout(timer); };
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
