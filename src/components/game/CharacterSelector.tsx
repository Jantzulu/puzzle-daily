import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getCharacter } from '../../data/characters';
import type { CharacterAction, PlacedCharacter, Direction } from '../../types/game';
import { getDirectionInputSpells, spellDirectionCaption, FACING_CAPTION, allowedFacingDirections, allowedSpellDirections } from '../../utils/directionInput';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';
import { GemMesh } from './GemMesh';
import { RichTextRenderer } from '../editor/RichTextEditor';
import { attributeText, attributeSubItems } from '../../utils/attributeShape';
import { HelpButton } from './HelpOverlay';
import { MovementArrow } from './DirectionArrow';
import { DirectionPicker, CompassArrow, type DirectionPickerEntry } from './DirectionPicker';
import type { ThemeAssets } from '../../utils/themeAssets';
import { CARD_PIXEL_SCALE, computeCardSpriteAreaHeight } from './cardConstants';
import { SlidingSelection } from './SlidingSelection';
import { subscribeToImageLoads } from '../../utils/imageLoader';

const MOVEMENT_TYPES = new Set([
  'move_forward', 'move_backward', 'move_left', 'move_right',
  'move_diagonal_ne', 'move_diagonal_nw', 'move_diagonal_se', 'move_diagonal_sw',
]);

// One-time coach line (plate chrome only) — the permanent hint row cost 26px
// forever to say something the first tap teaches for good. Mirrors the
// already-shipped enemy-strip pattern verbatim (EnemyDisplay.tsx:26-32):
// shown under the strip until the player's FIRST-EVER hero-card tap, then
// never again on this device. Storage failure degrades to never showing it —
// better than showing it forever.
const HERO_HINT_KEY = 'hero_card_hint_dismissed_v1';
const isHeroHintDismissed = () => {
  try { return localStorage.getItem(HERO_HINT_KEY) === '1'; } catch { return true; }
};
const dismissHeroHint = () => {
  try { localStorage.setItem(HERO_HINT_KEY, '1'); } catch { /* ditto */ }
};

// The plate's engraved caps sit ON the frame's top bevel, so they take the
// lintel's cut-into-stone shading rather than a drop shadow.
const CAP_ENGRAVING = '0 -1px 0 rgba(0,0,0,.85), 0 1px 0 rgba(255,235,200,.10)';

// Icon controls on the RIGHT cap. 36x20 of paint (`.hero-cap__well` makes
// it a recessed well in --hud-gold, which is what distinguishes a control
// from the flat engraved `N/M` readout beside it), and `.hit-44-up` grows
// the TARGET to a full 44x44 for zero layout pixels.
//
// BOTH AXES RUN FREE AT 44px. `.hit-44-up` anchors the slop to the
// control's BOTTOM edge — which is the plate's top rail — so it can never
// bleed down into a hero card, and it grows UP into the quest banner's
// `pb-4` cloth margin, which holds no controls. The one thing that ever
// sat in that column was the banner's own help button, above the LEFT tab;
// the left tab is now pure engraving and every control lives in the right
// tab, so the collision is gone by construction rather than paid for by
// capping the axis below the floor.
//
// `gap-2.5` between wells is not decoration: two 44px slops need their
// centres >=44px apart or they clip each other, and 36 + 10 = 46.
//
// pointer-events-auto lives HERE and only here — the tab wrappers stay
// inert so a static label can never eat a card tap.
const CAP_BTN =
  'hero-cap__well pointer-events-auto flex items-center justify-center w-9 h-5 transition-colors hit-44-up';

function getMovementInfo(behavior: CharacterAction[]) {
  const moveAction = behavior.find(a => MOVEMENT_TYPES.has(a.type));
  return moveAction ? { tilesPerMove: moveAction.tilesPerMove || 1 } : null;
}

// The compass glyph now lives with the picker that owns the compass
// (DirectionPicker.tsx) and is imported above — the orders pill's "you chose
// north-east" readout and the picker's cells must never drift apart.

// LEGACY 17px COMPASS — inline chrome only, see the fork note on the info
// area below. Plate chrome (the play page) sends the player to the portalled
// 48px picker instead.
const COMPASS_DIRS: { value: Direction; dir: string }[] = [
  { value: 'northwest' as Direction, dir: 'northwest' },
  { value: 'north' as Direction, dir: 'north' },
  { value: 'northeast' as Direction, dir: 'northeast' },
  { value: 'west' as Direction, dir: 'west' },
  { value: 'east' as Direction, dir: 'east' },
  { value: 'southwest' as Direction, dir: 'southwest' },
  { value: 'south' as Direction, dir: 'south' },
  { value: 'southeast' as Direction, dir: 'southeast' },
];

interface CharacterSelectorProps {
  availableCharacterIds: string[];
  selectedCharacterId: string | null;
  onSelectCharacter: (id: string | null) => void;
  placedCharacterIds?: string[];
  maxPlaceable?: number;
  onClearAll?: () => void;
  onTest?: () => void;
  themeAssets?: ThemeAssets;
  disabled?: boolean;
  noPanel?: boolean;
  placedCharacters?: PlacedCharacter[];
  onSpellDirectionOverride?: (characterId: string, spellId: string, direction: Direction) => void;
  pendingSpellDirectionOverrides?: Record<string, Record<string, Direction>>;
  onFacingOverride?: (characterId: string, direction: Direction) => void;
  pendingFacingOverrides?: Record<string, Direction>;
  /**
   * Which chrome this instance wears.
   *
   * 'inline' (DEFAULT) is today's markup exactly: an in-flow header row
   * (Test | Heroes + ? | N/M placed + trash) and a permanent hint line under
   * the strip. TrainingGrounds and the editor playtest mount pass nothing and
   * are therefore byte-identical to before this prop existed.
   *
   * 'plate' is the play page's war-table variant: identity moves ONTO the
   * frame as absolutely-positioned caps (0 layout px), the dev-only Test
   * button moves to the control rail, and the hint becomes a one-shot coach
   * line. Only Game.tsx opts in.
   */
  chrome?: 'inline' | 'plate';
}

export const CharacterSelector: React.FC<CharacterSelectorProps> = ({
  availableCharacterIds,
  selectedCharacterId,
  onSelectCharacter,
  placedCharacterIds = [],
  maxPlaceable,
  onClearAll,
  onTest,
  themeAssets = {},
  disabled = false,
  noPanel = false,
  placedCharacters = [],
  onSpellDirectionOverride,
  pendingSpellDirectionOverrides = {},
  onFacingOverride,
  pendingFacingOverrides = {},
  chrome = 'inline',
}) => {
  const effectiveMaxPlaceable = maxPlaceable ?? availableCharacterIds.length;
  const isAtMaxPlaced = placedCharacterIds.length >= effectiveMaxPlaceable;
  const isPlate = chrome === 'plate';

  // Plate chrome only: the one-shot coach line that replaced the permanent
  // hint row. Initialized from storage so a returning player never sees it.
  const [showTapHint, setShowTapHint] = useState(() => isPlate && !isHeroHintDismissed());

  // Uniform card sprite-area height across the hero row — derived from the
  // tallest native sprite in the row × CARD_PIXEL_SCALE. Prevents clipping
  // of the tallest sprite's head and keeps all cards the same height.
  //
  // imageLoadTrigger makes the memo re-run when any sprite image finishes
  // loading — important because some imported sprite sheets don't have
  // `frameHeight` stored in their config, and the fallback only resolves
  // to the correct value once the image itself is cached.
  const [imageLoadTrigger, setImageLoadTrigger] = useState(0);
  useEffect(() => {
    const unsubscribe = subscribeToImageLoads(() => {
      setImageLoadTrigger(prev => prev + 1);
    });
    return unsubscribe;
  }, []);
  const cardSpriteHeight = useMemo(() => {
    return computeCardSpriteAreaHeight(
      availableCharacterIds.map(id => getCharacter(id)?.customSprite)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- imageLoadTrigger intentionally forces re-compute after image loads
  }, [availableCharacterIds, imageLoadTrigger]);

  // Uniform name/title block height across the hero row — picks the max
  // rendered height of any card's name/title and applies it as min-height
  // to all of them. Ensures HP rows and everything below line up vertically
  // across cards regardless of name length (which varies with wrapping).
  const nameBlockRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [maxNameBlockHeight, setMaxNameBlockHeight] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      let max = 0;
      for (const el of nameBlockRefs.current) {
        if (!el) continue;
        const h = el.offsetHeight;
        if (h > max) max = h;
      }
      if (max > 0) {
        setMaxNameBlockHeight(prev => (prev === max ? prev : max));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const el of nameBlockRefs.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableCharacterIds]);

  // Info panel animation: grid 0fr→1fr so easing applies to real content height.
  // Double rAF ensures browser paints the closed (0fr) state before opening.
  const [renderedCharId, setRenderedCharId] = useState<string | null>(selectedCharacterId);
  const [isOpen, setIsOpen] = useState(false);
  const prevCharIdRef = useRef<string | null>(selectedCharacterId);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRafRef = useRef<number | null>(null);

  useEffect(() => {
    const prev = prevCharIdRef.current;
    prevCharIdRef.current = selectedCharacterId;
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    if (openRafRef.current) cancelAnimationFrame(openRafRef.current);

    if (selectedCharacterId !== null && prev === null) {
      // null → hero: mount closed, then animate open
      setRenderedCharId(selectedCharacterId);
      setIsOpen(false);
      openRafRef.current = requestAnimationFrame(() => {
        openRafRef.current = requestAnimationFrame(() => setIsOpen(true));
      });
    } else if (selectedCharacterId !== null) {
      // hero → different hero: swap content instantly, stay open
      setRenderedCharId(selectedCharacterId);
      setIsOpen(true);
    } else if (prev !== null) {
      // hero → null: animate closed, then unmount
      setIsOpen(false);
      exitTimerRef.current = setTimeout(() => setRenderedCharId(null), 300);
    }
  }, [selectedCharacterId]);

  // Which order the player is currently aiming, if any. Held as a KEY, not as
  // the entry object: the entries are rebuilt on every render, so an object
  // here would re-latch the picker's open animation on every parent update.
  const [pickerKey, setPickerKey] = useState<string | null>(null);

  // Changing hero (or closing the panel) closes the picker. The sheet belongs
  // to ONE order on ONE hero, and a stale sheet would write the new hero's
  // facing from the old hero's rose.
  useEffect(() => { setPickerKey(null); }, [renderedCharId]);

  const renderedCharacter = renderedCharId ? getCharacter(renderedCharId) : null;
  const hasActionSteps = (renderedCharacter?.actionSteps?.length ?? 0) > 0;
  const hasAttributes = (renderedCharacter?.attributes?.length ?? 0) > 0;

  const directionInputSpells = getDirectionInputSpells(renderedCharacter);
  const hasFacingInput = !!renderedCharacter?.facingAcceptsUserInput;
  const hasDirectionInputs = hasFacingInput || directionInputSpells.length > 0;
  // The single gate on the legacy 17px compass column. Plate chrome (the play
  // page) sends the player to the portalled 48px picker instead; inline chrome
  // keeps the old column ONLY while TrainingGrounds and the editor playtest
  // are held to pixel-identity. Flip this to `hasDirectionInputs` to retire it.
  const showInlineDirections = !isPlate && hasDirectionInputs;

  const placedSelectedChar = placedCharacters.find(pc => pc.characterId === renderedCharId);

  // The player's outstanding ORDERS — starting facing first, then each
  // direction-input spell. `current` stays undefined until the player has
  // actually picked (no phantom default: the engine has no fallback to
  // display, placement is gated on every entry being chosen).
  const directionInputEntries: DirectionPickerEntry[] = [
    ...(hasFacingInput && renderedCharacter ? [{
      key: '__facing',
      caption: FACING_CAPTION,
      current: placedSelectedChar
        ? placedSelectedChar.facing
        : (renderedCharId ? pendingFacingOverrides[renderedCharId] : undefined),
      allowed: allowedFacingDirections(renderedCharacter),
      onPick: onFacingOverride && selectedCharacterId
        ? (d: Direction) => onFacingOverride(selectedCharacterId, d)
        : undefined,
    }] : []),
    ...directionInputSpells.map(spell => ({
      key: spell.id,
      caption: spellDirectionCaption(spell),
      current: placedSelectedChar?.spellDirectionOverrides?.[spell.id]
        || (renderedCharId ? pendingSpellDirectionOverrides[renderedCharId]?.[spell.id] : undefined),
      allowed: allowedSpellDirections(spell),
      onPick: onSpellDirectionOverride && selectedCharacterId
        ? (d: Direction) => onSpellDirectionOverride(selectedCharacterId, spell.id, d)
        : undefined,
    })),
  ];

  // THE ORDERS BAR — plate chrome's replacement for the 17px compass column.
  //
  // ONE PILL PER OUTSTANDING ORDER, 44px TALL NATIVELY. Not 44px of hit-slop:
  // slop is clipped by any `overflow: auto` ancestor, and this control has to
  // survive inside the internally-scrolling drawer that comes next. The pill
  // states the ORDER and its STATE; the compass itself is a portalled sheet
  // (DirectionPicker) with 48px cells, which is the only way this input can
  // meet the platform tap floors — a 44px slop ring on an 18.3px pitch just
  // hands each tap to whichever neighbour paints last.
  //
  // The unset pill is the loudest thing in the panel on purpose: it is a
  // BLOCKING condition (placement is gated on it), and in the old column it
  // was rendered as the smallest thing on the page.
  //
  // WEIGHT LIVES IN CSS, NOT IN UTILITIES. The first cut wrote both states as
  // Tailwind tints — copper for outstanding, arcane for satisfied — and got
  // the hierarchy exactly BACKWARDS on screen: this panel's own ground is
  // `bg-copper-900/15`, so a copper-tinted outstanding pill dissolved into it
  // while the arcane one popped as the only complementary hue in the frame.
  // The SATISFIED order was the loudest object in the panel. So the states
  // are now `.hero-order--open` (filled lit brass, the one thing stopping the
  // player) and `.hero-order--done` (a quiet arcane outline, an item already
  // ticked off), and value — not just hue — carries the difference.
  const activePickerEntry = pickerKey
    ? directionInputEntries.find(e => e.key === pickerKey) ?? null
    : null;

  const renderOrderPill = (entry: DirectionPickerEntry) => {
    const isSet = !!entry.current;
    const canPick = !disabled && !!entry.onPick;
    const className = `hero-order ${isSet ? 'hero-order--done' : 'hero-order--open'} hud-label w-full h-11 px-3 flex items-center justify-between gap-2 rounded-pixel border transition-colors`;
    const body = (
      <>
        <span className="truncate text-left">{entry.caption}</span>
        <span className="flex items-center gap-1.5 flex-shrink-0">
          {isSet ? (
            <>
              <CompassArrow direction={entry.current!} size={16} />
              {/* NO `capitalize` HERE. The bearing is a HUD value and the
                  whole ramp (`.hud-label`) is uppercase; the picker's own
                  readout says NORTHWEST, so the pill must not say Northwest.
                  One fact, one type register — and the pill must not change
                  register between its own CHOOSE and set states either. */}
              <span>{entry.current}</span>
            </>
          ) : (
            <>
              {/* Opacity-only pulse (`hud-breathe`) — the pinned decoration
                  rule forbids animating filters, shadows or geometry. */}
              <span className="w-1.5 h-1.5 rounded-full bg-parchment-100 hud-breathe" aria-hidden="true" />
              <span>Choose</span>
            </>
          )}
          {canPick && (
            <svg width="8" height="12" viewBox="0 0 8 12" aria-hidden="true" className="opacity-60">
              <path d="M2 1L6.5 6L2 11" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="square" />
            </svg>
          )}
        </span>
      </>
    );
    // Read-only (a placed hero, or a disabled panel) renders the same plate
    // without the button role — nothing to press, so nothing claims to be.
    if (!canPick) {
      return <div key={entry.key} className={className}>{body}</div>;
    }
    return (
      <button
        key={entry.key}
        type="button"
        onClick={(e) => { e.stopPropagation(); setPickerKey(entry.key); }}
        className={className}
        aria-haspopup="dialog"
        aria-expanded={pickerKey === entry.key}
      >
        {body}
      </button>
    );
  };

  // Slot list for the strip + sliding selection overlay: only ids that
  // resolve to real characters render cards, so the overlay's slot math
  // must index within the same filtered list.
  const stripCharacterIds = availableCharacterIds.filter((id) => !!getCharacter(id));
  const selectedStripIndex = selectedCharacterId ? stripCharacterIds.indexOf(selectedCharacterId) : -1;

  // Trash icon — identical glyph in both chromes, different envelope: the
  // inline header row needs the -my-1 trick so the button can't grow the row
  // it sits in, while the plate cap is out of flow and can afford a real 32px
  // plate. `.hit-44` finishes both to a 44px target.
  const trashIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
  const canClearAll = !!onClearAll && placedCharacterIds.length > 0 && !disabled;

  // PLATE CAPS — identity engraved on the frame instead of a 28px header row.
  // Two iron tabs (`.hero-cap`, index.css) standing on the plate's top rail:
  // `absolute` + translateY rests the band's BOTTOM on that rail, so the
  // whole band costs ZERO layout pixels. It is the frame talking, not a row.
  //
  // THE TABS ARE FORGED, NOT BOXED, and that is the fix for the version
  // before this one. They stand in front of the quest banner's hanging
  // cloth because there is nowhere else: the cloth fills the banner's whole
  // `pb-4` and only 4px separate the band's bottom edge from the plate's
  // top, so a cap that clears the cloth does not exist. Drawn as near-black
  // rectangles with a 1px stone border they sliced the cloth's torn hem and
  // read as a z-index accident. Drawn in `.nav-pill`'s stock — the same
  // iron, bevels and forge bolts as the portcullis signage, and the same
  // metal as the rod the banner hangs from — they read as mounted hardware
  // and the dags terminate INTO them. `border-bottom:0` plus a top-only
  // radius makes each tab rise OUT of the plate rather than float on the
  // banner.
  //
  // WHY THE LEFT TAB HAS NO CONTROLS. It is not symmetry for its own sake.
  // The quest banner's own help button rides a CENTRED flex row, so its x
  // drifts with viewport width (centre 87 at 393px, 111 at 440px) and lands
  // inside the left tab's column on every phone. Two identical circled-'?'
  // glyphs 12px apart at one width and 37px apart at another is the
  // accidental-frame tell; worse, a cap control there needs a 44px upward
  // slop and would swallow the banner's button whole. Moving the roster's
  // help into the RIGHT tab puts >=150px between them at every width from
  // 320 to 1280 and buys the full 44px vertical axis for all the cap
  // controls (see `.hit-44-up`). Left tab = who this is. Right tab = the
  // roster cluster.
  //
  // NOTHING IN THE BAND CAN HIT-TEST INTO THE STRIP. Three things:
  //   1. pointer-events-none on the band AND on both tab wrappers. Only the
  //      real controls opt back in (see CAP_BTN). An earlier cut put
  //      `pointer-events-auto` on the wrappers, which made the static
  //      counter block the top 14px of hero card 3 and the `Heroes` h3
  //      block the top 8px of card 1 — non-interactive chrome eating taps
  //      on the page's most common target.
  //   2. `.hit-44-up` anchors each control's slop to its own bottom edge,
  //      so the slop grows into the banner's cloth margin, never down.
  //   3. Belt and braces: the strip below is raised to the SAME z-30 and
  //      comes later in the DOM, so it paints — and hit-tests — above this
  //      band. Even a future cap that overhangs cannot steal a card tap.
  //
  // z-30 also clears the quest band's z-20 so the tabs are never painted
  // over by the banner they stand in front of.
  const plateCaps = isPlate ? (
    <div
      className="absolute inset-x-0 top-0 z-30 flex items-end justify-between gap-2 px-3 pointer-events-none"
      // -100% + 1px: the tab's bottom edge overlaps the plate's top bevel
      // by a hair, so there is no hairline of page ground between the
      // hardware and the stone it is bolted to.
      style={{ transform: 'translateY(calc(-100% + 1px))' }}
    >
      <div className="hero-cap" style={{ textShadow: CAP_ENGRAVING }}>
        {/* `carved-header`, matching EnemyDisplay's 'Enemies' h3 exactly
            (same theme-sized step, same font, opposite identity colour).
            An earlier cut used `hud-display`, which pinned this to 17px
            while the sibling roster's header 200px below stayed at the
            theme's 20px — the PRIMARY panel's identity rendering smaller
            and dimmer than the secondary one. The band is out of flow, so
            matching the sibling costs 0 layout px. Exactly ONE of
            `carved-header` / `hud-display` per element (index.css ramp
            note) — this element takes `carved-header`.
            `lg:leading-none` is not redundant: `lg:text-xl` ships a
            1.75rem line-height in a LATER cascade layer than plain
            `leading-none`, so without it the left tab grew to 30px on
            desktop while the right stayed 22px. */}
        <h3 className="carved-header carved-header-arcane font-medieval text-lg lg:text-xl leading-none lg:leading-none">Heroes</h3>
      </div>
      {/* RIGHT tab = the roster cluster, and it is deliberately TWO classes
          of thing with a groove between them: a flat engraved readout, then
          recessed gold wells that mean "you can touch this". Before the
          groove and the wells, `N/M` sat 4px from a destructive clear-all
          at the same size, weight and colour, and the trash read as a
          decorative glyph bookending a counter. */}
      <div className="hero-cap gap-2.5" style={{ textShadow: CAP_ENGRAVING }}>
        <span
          className={`hud-num whitespace-nowrap ${
            isAtMaxPlaced ? 'text-copper-400' : 'text-stone-400'
          }`}
          title={`${placedCharacterIds.length} of ${effectiveMaxPlaceable} heroes placed`}
        >
          {placedCharacterIds.length}/{effectiveMaxPlaceable}
        </span>
        <span className="hero-cap__groove" aria-hidden="true" />
        <HelpButton sectionId="characters" hitMode="up" className={`${CAP_BTN} !p-0 hover:text-parchment-100`} />
        {canClearAll && (
          <button
            onClick={onClearAll}
            className={`${CAP_BTN} hover:text-blood-400`}
            title="Remove all placed heroes"
            aria-label="Remove all placed heroes"
          >
            {trashIcon}
          </button>
        )}
      </div>
    </div>
  ) : null;

  const content = (
    <>
      {plateCaps}
      {/* Header row — inline chrome only. In plate chrome its three jobs
          (Test / identity / counter + trash) are carried by the control rail
          and the frame caps above, for 28px less layout. */}
      {!isPlate && (
      <div className="relative flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-[60px]">
          {onTest && !disabled && (
            themeAssets.actionButtonTestHeroesImage ? (
              <button
                onClick={onTest}
                className="transition-all hover:scale-105 active:scale-95 hit-44"
                title="Test your heroes without enemies for 5 turns"
              >
                <img
                  src={themeAssets.actionButtonTestHeroesImage}
                  alt="Test Heroes"
                  className="h-5 lg:h-6 w-auto"
                  style={{ imageRendering: 'pixelated' }}
                  loading="lazy" decoding="async"
                />
              </button>
            ) : (
              <button
                onClick={onTest}
                className="gem-btn px-2 lg:px-2.5 py-px text-xs transition-colors flex items-center gap-1 hit-44"
                title="Test your heroes without enemies for 5 turns"
              >
                {/* Amethyst stone — supersedes the legacy flat theme colors
                    (custom theme IMAGES still win via the branch above) */}
                <GemMesh tone="amethyst" phase={130} />
                <span className="flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  Test
                </span>
              </button>
            )
          )}
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center">
          <div className="absolute right-full mr-1">
            <HelpButton sectionId="characters" />
          </div>
          <h3 className="carved-header carved-header-arcane font-medieval text-lg lg:text-xl">Heroes</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm lg:text-base ${isAtMaxPlaced ? 'text-copper-400' : 'text-stone-400'}`}>
            {placedCharacterIds.length}/{effectiveMaxPlaceable} placed
          </span>
          {canClearAll && (
            <button
              onClick={onClearAll}
              // -my-1: the 28px hit box is taller than the row's natural
              // ~20px text height — negative margin keeps the touch target
              // without growing the row when the button appears (the panel
              // below must not shift on hero placement)
              // hit-44 finishes the job the -my-1 started: 28px of paint,
              // a 44x44 target. Uncapped is safe on both axes here — the
              // panel keeps a measured 20px gutter to its right at 320px
              // (the slop needs 8), and the 8px it reaches left only meets
              // the placed-counter, which is text, not a target.
              className="p-1 -my-1 text-stone-400 hover:text-blood-400 hover:bg-stone-700 rounded-pixel transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center hit-44"
              title="Remove all placed heroes"
            >
              {trashIcon}
            </button>
          )}
        </div>
      </div>
      )}

      {/* Hero strip — equal-width slots separated by vertical dividers.
          The selection tint + caret live in a SlidingSelection overlay (in a
          relative wrapper OUTSIDE the divide-x flex row, so the dividers
          don't paint borders on the overlay divs) and glide between slots
          instead of snapping card-to-card.

          z-30 IN PLATE CHROME ONLY, and it is load-bearing: it ties the
          strip with the cap band above it and, being later in the DOM,
          wins — so the half of each cap that visually straddles a card's
          top edge hit-tests as the CARD. Without it the clear-all trash
          fired on taps meant for the third hero. Inline chrome keeps a
          bare `relative` so TrainingGrounds is byte-identical. */}
      <div className={isPlate ? 'relative z-30' : 'relative'}>
      <SlidingSelection
        slotCount={stripCharacterIds.length}
        selectedIndex={selectedStripIndex}
        caretClass="text-copper-400"
      />
      <div data-hud="hero-strip" className="flex divide-x divide-stone-700">
        {stripCharacterIds.map((charId, charIndex) => {
          const character = getCharacter(charId);
          if (!character) return null;

          const isSelected = selectedCharacterId === charId;
          const isPlaced = placedCharacterIds.includes(charId);
          // Placed heroes are still clickable so the player can re-read their
          // card info after placing them. Placement itself is blocked
          // separately by Game.tsx's handleTileClick (alreadyPlaced check),
          // so selecting a placed hero just opens the info area.
          const cannotSelect = disabled || (isAtMaxPlaced && !isSelected && !isPlaced);
          const moveInfo = getMovementInfo(character.behavior);

          return (
            <div
              key={charId}
              onClick={() => {
                if (cannotSelect) return;
                // First-ever tap retires the coach line for good (plate
                // chrome only — the inline hint row is permanent by design).
                if (isPlate && !isHeroHintDismissed()) dismissHeroHint();
                if (showTapHint) setShowTapHint(false);
                onSelectCharacter(isSelected ? null : charId);
              }}
              className={`flex-1 flex flex-col items-center px-1 pt-1 pb-1.5 relative transition-colors ${
                cannotSelect
                  ? 'opacity-40 cursor-not-allowed'
                  : isPlaced && isSelected
                  // Placed AND actively viewed: full brightness so the
                  // sprite/name/HP match the (full-brightness) info area
                  // below. The flat tint exactly matches the info area's
                  // bg-copper-900/15 so card + info read as ONE surface;
                  // transition-colors crossfades it between cards (the
                  // tint deliberately does not slide — see the design
                  // record in SlidingSelection).
                  ? 'cursor-pointer bg-copper-900/15'
                  : isPlaced
                  // Placed but NOT viewed: dim with opacity-50 + a hover
                  // tint. "Already placed, can't re-place" signal — the
                  // checkmark + dimmed sprite carry that.
                  ? 'opacity-50 cursor-pointer [@media(hover:hover)]:hover:bg-stone-700/30'
                  : isSelected
                  ? 'bg-copper-900/15 cursor-pointer'
                  : '[@media(hover:hover)]:hover:bg-stone-700/30 cursor-pointer'
              }`}
            >
              {/* Sprite — takes full card width, uniform height across the row */}
              <div className="relative w-full">
                <SpriteThumbnail
                  sprite={character.customSprite}
                  size={cardSpriteHeight}
                  fillWidth
                  previewType="entity"
                  noBackground
                  pixelScale={CARD_PIXEL_SCALE}
                  bottomAlign={!character.isFloating}
                  cardRole="hero"
                  cardSelected={isSelected}
                  cardPlaced={isPlaced}
                  canvasStyle={(isSelected && !isPlaced) ? { filter: 'drop-shadow(0 0 2px rgba(0,0,0,1)) drop-shadow(0 0 3px rgba(212,165,116,0.9)) drop-shadow(0 0 7px rgba(212,165,116,0.5))' } : undefined}
                />
                {isPlaced && (
                  // Just the centered ✓ — no dark dim overlay. The outer
                  // card's opacity-50 already carries the "this hero is
                  // placed and can't be placed again" signal; adding a
                  // bg-black/40 dim on top of the sprite area produced a
                  // visible dark rectangle that read as a sprite container
                  // boundary, especially against the copper-tinted backdrop
                  // when a hero is selected for info re-read.
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-copper-400 text-base">✓</span>
                  </div>
                )}
              </div>

              {/* Name + Title (below sprite).
                  Separate block divs for tight vertical spacing control.
                  Container carries a ref + shared minHeight so all cards
                  in the row have the same name-block height, aligning the
                  HP/info/caret rows below across cards. */}
              <div
                ref={(el) => { nameBlockRefs.current[charIndex] = el; }}
                className="text-center w-full mt-0.5 mb-0.5"
                style={{ minHeight: maxNameBlockHeight || undefined }}
              >
                <div className="text-[12px] font-medium break-words text-arcane-400 leading-none">
                  {character.name}
                </div>
                {character.title && (
                  <div className="text-[10px] italic text-parchment-300 leading-none mt-0.5">
                    {character.title}
                  </div>
                )}
              </div>

              {/* Attribute row: HP + movement */}
              <div className="flex items-center justify-center mt-0.5 w-full">
                <div className="flex items-center gap-0.5 pr-1.5 border-r border-stone-600">
                  <span className="text-xs font-medium text-copper-400">HP:</span>
                  <span className="text-xs font-bold" style={{ color: '#4ade80' }}>
                    {character.health}
                  </span>
                </div>
                <div className="flex items-center gap-1 pl-1.5 text-copper-400">
                  {moveInfo ? (() => {
                    // Input heroes have no meaningful default — the arrow
                    // live-binds to the player's compass choice (pending or
                    // placed) and shows "?" until one is made.
                    const isInputFacing = !!character.facingAcceptsUserInput;
                    const arrowDir = isInputFacing
                      ? (placedCharacters.find(pc => pc.characterId === character.id)?.facing
                          ?? pendingFacingOverrides[character.id])
                      : character.defaultFacing;
                    return (
                      <>
                        {moveInfo.tilesPerMove > 1 && (
                          <span className="text-xs font-medium">{moveInfo.tilesPerMove}</span>
                        )}
                        {arrowDir ? (
                          <MovementArrow direction={arrowDir} className={isInputFacing ? 'text-purple-300' : 'text-copper-400'} size={13} />
                        ) : (
                          <span className="text-[11px] font-bold text-purple-300/80 leading-none">?</span>
                        )}
                      </>
                    );
                  })() : (
                    <span className="text-xs text-stone-500">—</span>
                  )}
                </div>
              </div>

              {/* No per-card "more info" affordance (design decision,
                  2026-07-29): the old reserved "More Info" row cost ~22px
                  per card, and even a pinned caret proved redundant — the
                  first tap teaches that every card opens. The words live in
                  the shared hint line below the strip; the selected amber
                  up caret rides the SlidingSelection overlay, height-free. */}
            </div>
          );
        })}
      </div>
      </div>

      {/* Info area — grid height animation so easing applies to real content height.
          Only rendered when the hero actually HAS info content: an info-less
          hero used to open an empty tinted box holding just the placement
          hint, expanding the panel at selection (read as the trash button
          displacing the layout). The hint now lives in a static row below. */}
      {renderedCharId && renderedCharacter && (hasActionSteps || hasAttributes || hasDirectionInputs) && (
        <div style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          transition: isOpen
            ? 'grid-template-rows 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)'
            : 'grid-template-rows 0.28s ease-in',
        }}>
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
        <div
          data-hud="hero-info"
          className="pt-2.5 pb-3 mt-0 bg-copper-900/15 rounded-b-pixel-md"
          style={{
            opacity: isOpen ? 1 : 0,
            transform: isOpen ? 'translateY(0)' : 'translateY(-8px)',
            transition: isOpen
              ? 'opacity 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)'
              : 'opacity 0.2s ease-in, transform 0.3s ease-in',
          }}
        >

          {/* ORDERS BAR — plate chrome. Full measure, above the brief, because
              it is the one thing in this panel that BLOCKS the next action.
              Each pill opens the portalled 48px compass. */}
          {isPlate && hasDirectionInputs && (
            <div className="px-2 mb-2 space-y-1">
              {directionInputEntries.map(renderOrderPill)}
            </div>
          )}

          {/* Actions | Choose | Attributes — the text columns split the
              remaining space. In PLATE chrome the compass column is gone (its
              orders moved to the bar above) and so are the dashed rules, so
              the two text columns take the whole measure — which is where
              most of this slice's height actually comes from: the columns
              stop wrapping every third word.

              THE INLINE FORK IS DELIBERATE AND TEMPORARY. TrainingGrounds and
              the editor playtest mount share this component and are held to
              pixel-identity for the duration of the layout work, so they keep
              the legacy 17px compass column. Everything gating that fork is
              `showInlineDirections`; when the pixel-identity hold is lifted,
              delete this branch and let both chromes use the picker — the
              17px cells are a WCAG 2.5.8 failure wherever they render. */}
          {(hasActionSteps || hasAttributes || showInlineDirections) && (
          <div className={`flex mb-2 px-2 ${[hasActionSteps, showInlineDirections, hasAttributes].filter(Boolean).length === 1 ? 'justify-center' : 'gap-0'}`}>
              {hasActionSteps && (
                <div className={`${hasAttributes || showInlineDirections ? 'flex-1 pr-2' : 'w-full'}`}>
                  <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1 text-center">Actions</p>
                  <ol className="text-xs lg:text-sm text-stone-300 space-y-1 pl-2">
                    {renderedCharacter.actionSteps!.map((step, idx) => (
                      <li key={idx} className="flex items-baseline gap-1">
                        <span className="font-semibold text-stone-400 flex-shrink-0">{idx + 1}.</span>
                        <span>
                          <RichTextRenderer html={step.text} />
                          {step.subSteps && step.subSteps.length > 0 && (
                            <ul className="mt-0.5 space-y-1 text-stone-400">
                              {step.subSteps.map((sub, subIdx) => (
                                <li key={subIdx} className="flex items-baseline gap-1">
                                  <span className="flex-shrink-0">•</span>
                                  <RichTextRenderer html={sub} />
                                </li>
                              ))}
                            </ul>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {/* The dashed rules are INLINE-ONLY now. Nothing else in this
                  dark-fantasy theme is dashed, and with the compass column
                  gone the two remaining columns are separated by their own
                  padding — one divider language on the surface, and 33px of
                  measure handed back to the text. */}
              {showInlineDirections && hasActionSteps && (
                <div className="self-stretch mx-2 flex-shrink-0 border-l border-dashed border-stone-600/40" />
              )}
              {!isPlate && !hasDirectionInputs && hasActionSteps && hasAttributes && (
                <div className="self-stretch mx-2 flex-shrink-0 border-l border-dashed border-stone-600/40" />
              )}

              {/* DIRECTIONS — the legacy 17px compass column, INLINE CHROME
                  ONLY (see the fork note above). Player direction input
                  (starting facing and/or spell compasses), titled as a
                  hero-subject noun to stay parallel with Actions/Attributes.
                  Fixed width so the text columns keep the flex space; entries
                  stack when a hero has more than one. */}
              {showInlineDirections && (
                <div className="flex-shrink-0 px-1" style={{ minWidth: '76px' }}>
                  <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1 text-center">Directions</p>
                  {directionInputEntries.map(entry => {
                    if (disabled || !entry.onPick) {
                      return (
                        <div key={entry.key} className="flex flex-col items-center mb-2">
                          <span className="text-[9px] text-purple-300 font-medium text-center">{entry.caption}</span>
                          {entry.current ? (
                            <div className="flex items-center gap-1 mt-0.5">
                              <CompassArrow direction={entry.current} size={14} className="text-purple-300" />
                              <span className="text-[10px] text-purple-300 capitalize">{entry.current}</span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-stone-500 mt-0.5">—</span>
                          )}
                        </div>
                      );
                    }
                    return (
                      <div key={entry.key} className="flex flex-col items-center gap-1 mb-2">
                        <span className="text-[9px] text-purple-300 font-medium text-center">{entry.caption}</span>
                        <div className="grid grid-cols-3 gap-px" style={{ width: '54px' }}>
                          {[
                            ...COMPASS_DIRS.slice(0, 4),
                            null,
                            ...COMPASS_DIRS.slice(4),
                          ].map((d, i) => d ? (
                            entry.allowed.includes(d.value) ? (
                              <button
                                key={d.value}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  entry.onPick?.(d.value);
                                }}
                                className={`w-[17px] h-[17px] rounded-sm transition-colors flex items-center justify-center ${
                                  entry.current === d.value
                                    ? 'bg-purple-600 text-white border border-purple-400'
                                    : 'bg-stone-700 text-stone-400 border border-stone-600 hover:bg-stone-600'
                                }`}
                              >
                                <CompassArrow direction={d.dir} size={9} />
                              </button>
                            ) : (
                              // Creator-disallowed direction — hold the grid
                              // shape but read as inert.
                              <div
                                key={d.value}
                                className="w-[17px] h-[17px] rounded-sm flex items-center justify-center bg-stone-800/60 text-stone-700 border border-stone-700/40"
                              >
                                <CompassArrow direction={d.dir} size={9} />
                              </div>
                            )
                          ) : (
                            <div key={`center-${i}`} className="w-[17px] h-[17px]" />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {showInlineDirections && hasAttributes && (
                <div className="self-stretch mx-2 flex-shrink-0 border-l border-dashed border-stone-600/40" />
              )}
              {hasAttributes && (
                <div className={`${hasActionSteps || showInlineDirections ? 'flex-1 pl-2' : 'w-full'}`}>
                  <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1 text-center">Attributes</p>
                  <ul className="text-xs lg:text-sm text-stone-300 space-y-1">
                    {renderedCharacter.attributes!.map((attr, idx) => (
                      <li key={idx}>
                        <div className="flex items-baseline gap-1">
                          <span className="text-stone-400 flex-shrink-0">•</span>
                          <RichTextRenderer html={attributeText(attr)} />
                        </div>
                        {(attributeSubItems(attr) || []).map((sub, subIdx) => (
                          <div key={subIdx} className="flex items-baseline gap-1 ml-3 mt-0.5">
                            <span className="text-stone-500 flex-shrink-0">◦</span>
                            <RichTextRenderer html={sub} />
                          </div>
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
          </div>
          )}

        </div>
        </div>
        </div>
      )}

      {/* Placement hint — INLINE chrome only. Statically sized (min-h
          reserves the line) so the text swap never moves the panel below. */}
      {!isPlate && !disabled && (
        <div className="mt-1.5 text-sm font-medium text-center min-h-[20px]">
          {isAtMaxPlaced ? null : selectedCharacterId && !placedCharacterIds.includes(selectedCharacterId) ? (
            <span className="text-copper-400">Click on the dungeon to place your hero</span>
          ) : (
            <span className="text-stone-500">Select a hero for details</span>
          )}
        </div>
      )}

      {/* PLATE chrome: one-shot coach line in place of the permanent row.
          Retires on the first-ever card tap and costs nothing thereafter.
          The other half of the old row — "Click on the dungeon to place your
          hero" — is not a hint but a live instruction, so it moved ONTO the
          board where the instruction actually points (Game.tsx). */}
      {isPlate && showTapHint && !disabled && (
        <div className="mt-1.5 text-sm font-medium text-center min-h-[20px]">
          <span className="text-stone-500">Tap a hero for details</span>
        </div>
      )}

      {/* The compass, portalled to <body>. Costs 0 layout px here — it is
          only ever in the DOM while an order is being aimed, and it is
          anchored to the VIEWPORT, not to this panel's transformed,
          clipped, z-stacked chrome. */}
      <DirectionPicker
        entry={activePickerEntry}
        sprite={renderedCharacter?.customSprite}
        onClose={() => setPickerKey(null)}
      />
    </>
  );

  // data-hud="hero-panel": stable measurement hook for the layout harness.
  // It sits on the EXISTING outermost element of each branch (rather than a
  // new wrapper) so the measured box is byte-identical to what the harness
  // used to reach via `heroStrip.parentElement.parentElement`.
  // `relative` in plate chrome is what the absolutely-positioned caps anchor
  // to. It is a no-op for layout height, so the measured box is unchanged.
  // `hero-plate` paints the frame the caps cap — inset bevels only, so it is
  // also a no-op for layout height (see index.css). With `noPanel` set there
  // is otherwise no background, border, radius or shadow on this element at
  // all, and the band read as an accident floating in black.
  const rootClass = `${isPlate ? 'hero-plate relative ' : ''}${disabled ? 'opacity-60' : ''}`.trim();

  if (noPanel) {
    return <div data-hud="hero-panel" className={rootClass}>{content}</div>;
  }

  return (
    <div data-hud="hero-panel" className={`dungeon-panel p-2 lg:p-3 ${rootClass}`}>
      {content}
    </div>
  );
};
