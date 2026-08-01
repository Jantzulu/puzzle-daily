import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Direction } from '../../types/game';
import type { CustomSprite, SpriteDirection } from '../../utils/assetStorage';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { lockBodyScroll } from '../../utils/scrollLock';

/**
 * COMPASS ARROW — one glyph, drawn as SVG so it renders identically on every
 * platform (a rotated system dingbat does not). Lives here because the picker
 * is now the compass's home; the hero panel imports it for the orders pill's
 * "you chose north-east" readout.
 *
 * IT IS A SHAFT AND A HEAD, AND IT TOOK THREE CUTS TO GET THERE. Both
 * earlier attempts were single closed blobs, and both read ~180 deg WRONG on
 * all four diagonals:
 *   1. `M5 1L8 7H2Z` — a near-equilateral triangle. Axis-aligned it survives,
 *      because the flat horizontal base anchors it and the eye reads "the
 *      pointy end is the one opposite the level edge". Rotated 45 deg there
 *      is no level edge and no vertex sharp enough to dominate.
 *   2. `M5 0.83L7.83 8.66L5 7.71L2.17 8.66Z` — a concave dart, cut to a
 *      measured spec: apex 1.20x farther from the area centroid than the tail
 *      wings and 12 deg sharper. Those numbers are correct and they did not
 *      help. On a diagonal the trailing wing lands near-horizontal and forms
 *      a broad triangle with a flat-ish base — which IS the arrowhead
 *      gestalt — while the true head becomes a thin sliver. Rendered beside a
 *      plain shaft-and-head arrow at the same rotation, the two disagreed by
 *      half a turn.
 *
 * SO THE MEASURED-PROPORTION SPEC IS RETIRED. Do not re-derive centroid
 * ratios or interior angles to defend a glyph here; two glyphs passed that
 * test and failed the only test that matters. A shaft is what makes an arrow
 * unambiguous: the head is the only WIDE part, the shaft is the only LONG
 * part, and no rotation can swap those roles. This is the same silhouette as
 * every navigation arrow in the world, which is the point — the player must
 * not have to learn it.
 *
 * THE ACCEPTANCE TEST IS PERCEPTUAL AND IT IS CHEAP. Render the four
 * diagonals beside a plain shaft-and-head reference arrow at the same
 * rotation, magnified, and confirm they agree; then confirm all eight
 * bearings still read at 24 / 16 / 14 / 9px, the four call-site sizes
 * (rose cell, orders pill, card row, spell chip). The viewBox and the
 * rotation map below are unchanged, so every call site keeps its size and
 * bearing, and every vertex is inside r=4.75 of the box centre so no
 * rotation clips.
 */
export const CompassArrow: React.FC<{ direction: string; size?: number; className?: string }> = ({ direction, size = 10, className = '' }) => {
  const rotations: Record<string, number> = {
    north: 0, northeast: 45, east: 90, southeast: 135,
    south: 180, southwest: 225, west: 270, northwest: 315,
  };
  const rotation = rotations[direction] ?? 0;
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" className={className} style={{ transform: `rotate(${rotation}deg)` }}>
      <path d="M5 0.5L9 5.2L6.5 5.2L6.5 9.5L3.5 9.5L3.5 5.2L1 5.2Z" fill="currentColor" />
    </svg>
  );
};

/**
 * The rose, in reading order, with the hub punched out of the middle. Keeping
 * the SPATIAL arrangement is the whole reason this is a rose and not a row of
 * eight chips: "north-west" is up-and-left on the board and up-and-left here.
 */
const ROSE: (Direction | null)[] = [
  'northwest', 'north', 'northeast',
  'west', null, 'east',
  'southwest', 'south', 'southeast',
] as (Direction | null)[];

/** One direction input the player owes before this hero can be placed. */
export interface DirectionPickerEntry {
  key: string;
  caption: string;
  current?: Direction;
  allowed: Direction[];
  /** Absent = read-only (a placed hero, or a disabled panel). */
  onPick?: (d: Direction) => void;
  /**
   * FACING entries only (user call 2026-08-01): the sheet stays open after a
   * pick — the hub hero turns to face the chosen bearing, so the player can
   * try directions and watch, then close deliberately (scrim / chevron /
   * Escape). Spell-direction entries keep the pick-and-dismiss flow.
   */
  isFacing?: boolean;
}

// Game bearing → directional-sprite key, for the hub's turned idle.
const SPRITE_DIR: Record<string, SpriteDirection> = {
  north: 'n', northeast: 'ne', east: 'e', southeast: 'se',
  south: 's', southwest: 'sw', west: 'w', northwest: 'nw',
};

interface DirectionPickerProps {
  /** The entry being aimed, or null when the picker is closed. */
  entry: DirectionPickerEntry | null;
  /** The hero being aimed — drawn in the rose's hub. */
  sprite?: CustomSprite;
  onClose: () => void;
}

// Matches the .dir-picker__sheet transition in index.css.
const EXIT_MS = 200;
// Long enough for the pressed cell to light up before the sheet leaves, short
// enough that it never feels like a second step.
const PICK_LINGER_MS = 140;

/**
 * DIRECTION PICKER — the 3x3 compass, evacuated from the hero card.
 *
 * WHY IT LEFT THE PANEL. In the card it was a 17x17px cell on an 18.3px pitch:
 * the page's only outright WCAG 2.5.8 failure, on an input that is REQUIRED
 * before certain heroes can be placed at all. Hit-slop cannot fix it — a 44px
 * ring at an 18.3px pitch overlaps all eight neighbours, so the slop just
 * decides mis-taps in favour of whichever sibling paints last, which makes the
 * fiddliness WORSE. Growing the pitch in place costs ~81px of panel per entry
 * and a hero can have two entries. So the control moves to a surface that has
 * room for it: a portalled sheet with 48x48 cells and 6px of real separation,
 * which clears both the iOS 44pt and the Android 48dp floors.
 *
 * PORTALLED TO <body> for the same reason NavSheet is: the hero panel is
 * inside transformed, clipped, z-stacked chrome (the plate, the strip's
 * z-30 band, the animating info grid), and `position: fixed` re-anchors to a
 * transformed ancestor. From <body> the sheet is anchored to the viewport,
 * which is what a bottom sheet has to be.
 *
 * NOTHING ABOUT THE GAME'S RULES MOVES. It calls the same
 * onFacingOverride / onSpellDirectionOverride props with the same values;
 * allowedFacingDirections / allowedSpellDirections still decide which cells
 * exist, and getMissingDirectionInputs still gates placement. Only WHERE the
 * player expresses the choice changed.
 */
export const DirectionPicker: React.FC<DirectionPickerProps> = ({ entry, sprite, onClose }) => {
  const open = !!entry;
  const entryKey = entry?.key ?? null;

  // Keep the last entry so the sheet can draw its own exit animation after the
  // parent has already dropped it. State rather than a ref because it is read
  // during render; the identity guard is what keeps it from re-rendering on
  // every parent update (the entries are rebuilt each time).
  const [lastEntry, setLastEntry] = useState<DirectionPickerEntry | null>(entry);
  useEffect(() => {
    if (!entry) return;
    setLastEntry(prev =>
      prev && prev.key === entry.key && prev.current === entry.current && prev.caption === entry.caption
        ? prev
        : entry
    );
  }, [entry]);
  const shownEntry = entry ?? lastEntry;

  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const panelRef = useFocusTrap<HTMLDivElement>(open);
  const rafRef = useRef<number | null>(null);
  const exitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mount closed, then flip to the open class on the next frame so the browser
  // has painted the closed state and the transition actually runs.
  useEffect(() => {
    if (exitRef.current) clearTimeout(exitRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (entryKey !== null) {
      setMounted(true);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => setShown(true));
      });
    } else {
      setShown(false);
      exitRef.current = setTimeout(() => setMounted(false), EXIT_MS);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [entryKey]);

  useEffect(() => () => {
    if (exitRef.current) clearTimeout(exitRef.current);
    if (pickRef.current) clearTimeout(pickRef.current);
  }, []);

  // Escape closes, and the page underneath does not scroll while a sheet is up
  // (the scrim already blocks pointer input; this stops the flick-through).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    const releaseScroll = lockBodyScroll();
    return () => {
      document.removeEventListener('keydown', onKey);
      releaseScroll();
    };
  }, [open, onClose]);

  if (!mounted || !shownEntry) return null;

  const handlePick = (d: Direction) => {
    if (!entry?.onPick) return;
    entry.onPick(d);
    // Facing: the sheet stays up — the lit cell, the cap-row readout and the
    // hub hero turning ARE the feedback, and the player closes when done.
    if (entry.isFacing) return;
    // Spell aims: let the chosen cell light before the sheet leaves —
    // otherwise the only feedback for a required input is the sheet vanishing.
    if (pickRef.current) clearTimeout(pickRef.current);
    pickRef.current = setTimeout(onClose, PICK_LINGER_MS);
  };

  const readOnly = !entry?.onPick;

  return createPortal(
    // theme-root re-applied because the portal lands OUTSIDE the app's wrapper:
    // without it the sheet loses the theme font and every `.theme-root .hud-*`
    // type token silently stops applying. `.dir-picker` kills the background
    // that class also paints (see index.css).
    <div className="theme-root dir-picker">
      <div
        className={`dir-picker__scrim ${shown ? 'dir-picker__scrim--in' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={shownEntry.caption}
        className={`dir-picker__sheet ${shown ? 'dir-picker__sheet--in' : ''}`}
      >
        {/* CAP ROW — what is being aimed, what it is currently set to, and the
            way out. Same vocabulary as the plate's right cap: engraved label,
            a groove, then a recessed well for the control. */}
        <div className="flex items-center gap-2 h-7 mb-2.5">
          <span className="hud-label text-arcane-300 truncate">{shownEntry.caption}</span>
          <span className="hero-cap__groove" aria-hidden="true" />
          {shownEntry.current ? (
            // `capitalize` was here and never applied: `.theme-root .hud-label`
            // (0,2,0) outranks the utility (0,1,0), so this always rendered
            // uppercase. It is gone rather than left as a no-op — the orders
            // pill is now uppercase too, and one register is the point.
            <span className="hud-label text-parchment-300 flex items-center gap-1 whitespace-nowrap">
              <CompassArrow direction={shownEntry.current} size={12} />
              {shownEntry.current}
            </span>
          ) : (
            <span className="hud-label text-copper-300 whitespace-nowrap">Not set</span>
          )}
          {/* 44x44 of real target, not the cap rail's 44x26. `.hero-cap__well`
              is borrowed for the LOOK only; the sheet overrides its
              `--hit-h` cap (see index.css) because that cap exists to keep a
              cap control off the quest rung and the hero cards, and neither
              is anywhere near this sheet. The picker exists BECAUSE its
              predecessor was a 17px target on a required input — shipping
              its way out at 26px would have been the same mistake, quieter. */}
          <button
            type="button"
            onClick={onClose}
            className="hero-cap__well hit-44 ml-auto flex items-center justify-center w-11 h-7 flex-shrink-0"
            aria-label="Close direction picker"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 4.5L6 8.5L10 4.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="square" />
            </svg>
          </button>
        </div>

        {/* THE ROSE. 56x56 cells with 8px gaps — no hit-slop anywhere, because
            slop between adjacent targets is exactly the failure mode this
            control had. Sized past the 48dp floor rather than to it: the sheet
            is portalled and fixed, so filling the measure costs the layout
            nothing and the rose stops reading as a small thing marooned on a
            wide band. The hub is the hero: you are aiming THEM. */}
        <div className="dir-rose" role="group" aria-label={shownEntry.caption}>
          {ROSE.map((dir) => {
            if (dir === null) {
              return (
                <div key="hub" className="dir-rose__hub" aria-hidden="true">
                  {sprite && (
                    <SpriteThumbnail
                      sprite={sprite}
                      size={52}
                      pixelScale={2}
                      previewType="entity"
                      noBackground
                      // Facing entries: the hub hero idles in the chosen
                      // bearing (default art until one is picked, or when
                      // the sprite has no variant for it).
                      facingDirection={
                        shownEntry.isFacing && shownEntry.current
                          ? SPRITE_DIR[shownEntry.current]
                          : undefined
                      }
                    />
                  )}
                </div>
              );
            }
            if (!shownEntry.allowed.includes(dir)) {
              // Creator-disallowed: holds the rose's shape so the spatial
              // mnemonic survives, but is inert and cannot steal a tap.
              return (
                <div key={dir} className="dir-cell dir-cell--off" aria-hidden="true">
                  <CompassArrow direction={dir} size={24} />
                </div>
              );
            }
            const isCurrent = shownEntry.current === dir;
            if (readOnly) {
              return (
                <div
                  key={dir}
                  className={`dir-cell ${isCurrent ? 'dir-cell--on' : ''}`}
                  aria-hidden={!isCurrent}
                >
                  <CompassArrow direction={dir} size={24} />
                </div>
              );
            }
            return (
              <button
                key={dir}
                type="button"
                onClick={(e) => { e.stopPropagation(); handlePick(dir); }}
                className={`dir-cell ${isCurrent ? 'dir-cell--on' : ''}`}
                aria-label={`Face ${dir}`}
                aria-pressed={isCurrent}
              >
                <CompassArrow direction={dir} size={24} />
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
};
