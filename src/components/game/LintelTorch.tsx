import React from 'react';
import { LINTEL_TORCH_SHEET as SHEET } from '../../assets/ui-kits/lintelTorch';
import { useCrispSnap } from './panelSkins';

/** The chrome's art scale (panelSkins Z): CSS px per art px. */
const Z = 2;

/**
 * A torch on the Dungeon Details lintel (user idea 2026-10-15): it burns
 * (the sheet's flame loop over a flickering pool of light), a tap puts it
 * out (a puff of smoke, the light dies away), and another tap relights it.
 * Nothing remembers it past the visit.
 *
 * COST (the user asked): no script runs per frame. The flame is a Web
 * Animations transform loop and the light a CSS opacity/scale flicker,
 * both the compositor's work, and both pause while the torch is off screen.
 * Reduce Motion holds one still frame and steady light. `phase` (ms)
 * offsets this torch's loops so a pair never burns in step.
 */
export const LintelTorch: React.FC<{ phase?: number }> = ({ phase = 0 }) => {
  const [lit, setLit] = React.useState(true);
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
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let anim: Animation | null = null;
    if (lit) {
      strip.style.transform = at(0);
      if (!reduce && SHEET.litFrames > 1) {
        anim = strip.animate([{ transform: at(0) }, { transform: at(SHEET.litFrames) }], {
          duration: (SHEET.litFrames / SHEET.fps) * 1000,
          iterations: Infinity,
          easing: `steps(${SHEET.litFrames})`,
          delay: -phase,
        });
      }
    } else {
      strip.style.transform = at(SHEET.outFrame);
      if (!reduce && SHEET.smokeFrames > 0) {
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
