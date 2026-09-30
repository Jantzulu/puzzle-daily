import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getCharacter } from '../../data/characters';
import type { Character, CharacterAction, PlacedCharacter, Direction } from '../../types/game';
import { getDirectionInputSpells, spellDirectionCaption, FACING_CAPTION, allowedFacingDirections, allowedSpellDirections } from '../../utils/directionInput';
import { SpriteThumbnail } from '../editor/SpriteThumbnail';
import { GemMesh } from './GemMesh';
import { RichTextRenderer } from '../editor/RichTextEditor';
import { attributeText, attributeSubItems } from '../../utils/attributeShape';
import { HelpButton } from './HelpOverlay';
import { TapHintChip } from './TapHintChip';
import { MovementArrow } from './DirectionArrow';
import { DirectionPicker, CompassArrow, BEARING_INITIALS, type DirectionPickerEntry } from './DirectionPicker';
import type { ThemeAssets } from '../../utils/themeAssets';
import { CARD_PIXEL_SCALE, computeCardSpriteAreaHeight } from './cardConstants';
import { SlidingSelection } from './SlidingSelection';
import { subscribeToImageLoads } from '../../utils/imageLoader';
import { DIRECTIONS_LAYOUT } from './directionsLayout';

const MOVEMENT_TYPES = new Set([
  'move_forward', 'move_backward', 'move_left', 'move_right',
  'move_diagonal_ne', 'move_diagonal_nw', 'move_diagonal_se', 'move_diagonal_sw',
]);

function getMovementInfo(behavior: CharacterAction[]) {
  const moveAction = behavior.find(a => MOVEMENT_TYPES.has(a.type));
  return moveAction ? { tilesPerMove: moveAction.tilesPerMove || 1 } : null;
}

// Compass for the card layout's aim control: a ring around a four-point
// rose, "this hero has directions to aim" without pointing the way an arrow
// would (an arrow in the stat line reads as the hero's facing). NOT a ring
// with a diagonal needle — at 12px that read as a "prohibited" sign. The
// same glyph is repeated inline in the drawer note that tells the player
// where to tap. A stand-in: this is a natural slot for painted art.
const CompassGlyph: React.FC<{ size?: number; className?: string }> = ({ size = 12, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" className={className}>
    <circle cx="6" cy="6" r="5.3" fill="none" stroke="currentColor" strokeWidth="1" />
    <path d="M6 1.7L7.1 4.9L10.3 6L7.1 7.1L6 10.3L4.9 7.1L1.7 6L4.9 4.9Z" fill="currentColor" />
  </svg>
);

// The compass glyph lives with the picker that owns the compass
// (DirectionPicker.tsx) — the orders pill's "you chose north-east" readout
// and the picker's cells must never drift apart, so both import one arrow.

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
   * ?directions=card — the parent's "ask, don't refuse": set when the player
   * tapped a tile with a hero that still owes direction choices. Each ask is
   * a NEW object (its identity is the ask); the panel opens the picker for
   * that hero with a Place button, which calls onPlacementAimConfirm once
   * nothing is owed. Dismissing the sheet calls onPlacementAimCancel.
   */
  placementAim?: { charId: string } | null;
  onPlacementAimConfirm?: () => void;
  onPlacementAimCancel?: () => void;
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
  placementAim = null,
  onPlacementAimConfirm,
  onPlacementAimCancel,
}) => {
  const effectiveMaxPlaceable = maxPlaceable ?? availableCharacterIds.length;
  const isAtMaxPlaced = placedCharacterIds.length >= effectiveMaxPlaceable;

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

  // (The measured name-block min-height machinery is gone: the card's name
  // band is a fixed 38px box now, so every card is the same height by
  // construction rather than by ResizeObserver.)

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

  const renderedCharacter = renderedCharId ? getCharacter(renderedCharId) : null;
  const hasActionSteps = (renderedCharacter?.actionSteps?.length ?? 0) > 0;
  const hasAttributes = (renderedCharacter?.attributes?.length ?? 0) > 0;

  // Every direction input one hero owes — starting facing first, then each
  // direction-input spell. `current` stays undefined until the player has
  // actually picked (no phantom default: the engine has no fallback to
  // display, placement is gated on every entry being chosen). `pickable`
  // false = read-only entries (no onPick).
  const buildDirectionEntries = (
    character: Character | null | undefined,
    pickable: boolean
  ): DirectionPickerEntry[] => {
    if (!character) return [];
    const placed = placedCharacters.find(pc => pc.characterId === character.id);
    return [
      ...(character.facingAcceptsUserInput ? [{
        key: '__facing',
        caption: FACING_CAPTION,
        // isFacing: the picker stays open on pick and turns its hub hero to
        // the chosen bearing (see DirectionPickerEntry).
        isFacing: true,
        current: placed ? placed.facing : pendingFacingOverrides[character.id],
        allowed: allowedFacingDirections(character),
        onPick: onFacingOverride && pickable
          ? (d: Direction) => onFacingOverride(character.id, d)
          : undefined,
      }] : []),
      ...getDirectionInputSpells(character).map(spell => ({
        key: spell.id,
        caption: spellDirectionCaption(spell),
        current: placed?.spellDirectionOverrides?.[spell.id]
          || pendingSpellDirectionOverrides[character.id]?.[spell.id],
        allowed: allowedSpellDirections(spell),
        onPick: onSpellDirectionOverride && pickable
          ? (d: Direction) => onSpellDirectionOverride(character.id, spell.id, d)
          : undefined,
      })),
    ];
  };

  // The rendered hero's entries (the Directions column).
  const directionInputEntries = buildDirectionEntries(renderedCharacter, !!selectedCharacterId);
  const hasDirectionInputs = directionInputEntries.length > 0;
  // ?directions=card moves the inputs out of the drawer: a compass in the
  // card's stat line opens the picker, and a tile tap with choices still
  // owed opens it too (placementAim). ?directions=rail keeps the column's
  // look but (phones only) parks it at the right edge beside a single text
  // stack. See directionsLayout.ts.
  const showDirections = hasDirectionInputs && DIRECTIONS_LAYOUT !== 'card';
  const railMode = DIRECTIONS_LAYOUT === 'rail' && showDirections && (hasActionSteps || hasAttributes);
  const railTwoText = railMode && hasActionSteps && hasAttributes;

  // Which order the player is currently aiming, if any. Held as KEYS, not as
  // the entry object: the entries are rebuilt on every render, so an object
  // here would re-latch the picker's open animation on every update.
  // `placing` marks a picker opened by a tile tap (the placement ask): it
  // carries the Place button, and closing it any other way cancels the ask.
  const [picker, setPicker] = useState<{ charId: string; key: string; placing?: boolean } | null>(null);

  // An entry still owes a choice when nothing is stored OR the stored choice
  // is outside the creator's allowed subset — the placement gate's own rule
  // (getMissingDirectionInputs).
  const owesChoice = (e: DirectionPickerEntry) => !(e.current && e.allowed.includes(e.current));

  // Changing hero (or closing the panel) closes the picker. The sheet
  // belongs to ONE hero, and a stale sheet would write the new hero's facing
  // from the old hero's rose. (Card layout: the sheet is modal and always
  // opened for the hero already selected, so the rendered hero catching up
  // with the selection is not a reason to close there — the panel going
  // disabled is.)
  useEffect(() => { if (DIRECTIONS_LAYOUT !== 'card') setPicker(null); }, [renderedCharId]);
  useEffect(() => {
    if (!disabled) return;
    setPicker(null);
    if (placementAim) onPlacementAimCancel?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to the panel going disabled only
  }, [disabled]);

  // THE PLACEMENT ASK. A new placementAim object = the player tapped a tile
  // with this hero still owing choices: open the picker on the first one
  // owed. The parent clearing it (confirmed, or cancelled) closes a picker
  // that was opened this way — and only that kind.
  useEffect(() => {
    if (!placementAim) {
      setPicker(p => (p?.placing ? null : p));
      return;
    }
    const entries = buildDirectionEntries(getCharacter(placementAim.charId), true);
    const first = entries.find(owesChoice) ?? entries[0];
    if (first) setPicker({ charId: placementAim.charId, key: first.key, placing: true });
    else onPlacementAimCancel?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per ask (the object's identity)
  }, [placementAim]);

  const pickerCharacter = picker ? getCharacter(picker.charId) : null;
  const pickerEntries = DIRECTIONS_LAYOUT === 'card'
    ? buildDirectionEntries(pickerCharacter, !disabled)
    : directionInputEntries;
  const activePickerEntry = picker
    ? pickerEntries.find(e => e.key === picker.key) ?? null
    : null;
  const pickerOwedCount = pickerEntries.filter(owesChoice).length;

  // The order pill: caption lives above it in the column, so the pill only
  // carries the value. Loud when unset (the one thing blocking placement),
  // quiet once chosen; read-only renders the same plate without the button
  // role. States are .hero-order--open / --done in index.css.
  const renderOrderPill = (entry: DirectionPickerEntry) => {
    const isSet = !!entry.current;
    const canPick = !disabled && !!entry.onPick;
    // 10px text + px-1.5 (was 11px/px-2): pays for the caption-width column
    // (user call, 2026-08-01). h-11 stays — the 44px tap height is the
    // pill's whole reason for existing.
    const className = `hero-order ${isSet ? 'hero-order--done' : 'hero-order--open'} hud-label w-full h-11 px-1.5 justify-center flex items-center gap-1.5 rounded-pixel border transition-colors`;
    const body = (
      <>
        <span className="flex items-center gap-1.5 flex-shrink-0">
          {isSet ? (
            <>
              <CompassArrow direction={entry.current!} size={16} />
              {/* Compass INITIALS (84px-column round): NORTHWEST cannot fit
                  the narrow pill in a themed face at any legible size, and
                  the arrow already carries the bearing — the letters
                  confirm it. Full word in `title` + the picker's readout. */}
              <span title={entry.current}>{BEARING_INITIALS[entry.current!] ?? entry.current}</span>
            </>
          ) : (
            <>
              {/* Opacity-only pulse (hud-breathe) — the pinned decoration
                  rule forbids animating filters, shadows or geometry. */}
              <span className="w-1.5 h-1.5 rounded-full bg-parchment-100 hud-breathe" aria-hidden="true" />
              {/* "Pick", not "Choose" (84px-column round): the same word the
                  card's blocking chip uses for the same state — and CHOOSE
                  overflowed the narrow pill by 16px. */}
              <span>Pick</span>
            </>
          )}
          {/* Chevron on the UNSET state only (84px-column round): the loud
              CHOOSE pill keeps its tap affordance; the quiet set state
              yields those 12px so ARROW + NORTHWEST fits the column. */}
          {canPick && !isSet && (
            <svg width="8" height="12" viewBox="0 0 8 12" aria-hidden="true" className="opacity-60">
              <path d="M2 1L6.5 6L2 11" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="square" />
            </svg>
          )}
        </span>
      </>
    );
    // Inline 10px — the scoped .theme-root .hud-label 11px outranks any
    // Tailwind text utility, so the size cut must ride the style attribute.
    if (!canPick) {
      return <div className={className} style={{ fontSize: '10px' }}>{body}</div>;
    }
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); if (renderedCharId) setPicker({ charId: renderedCharId, key: entry.key }); }}
        className={className}
        style={{ fontSize: '10px' }}
        aria-haspopup="dialog"
        aria-expanded={picker?.key === entry.key}
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

  const content = (
    <>
      {/* Header row — unchanged */}
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
        {/* z-[46]: one step above the quest anchor's 45 so a TALL rolled
            scroll tucked behind the seal hangs BENEATH the title + (?)
            (user call 2026-08-13). The z must live on THIS wrapper: its
            centering TRANSFORM makes it a stacking context, so a z-46 on
            the h3 inside competed only within it and lost to the anchor
            at page level (probe-diagnosed). Safe for the (?)'s modal —
            HelpOverlay portals to <body>. */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center z-[46]">
          <div className="absolute right-full mr-1">
            {/* (?) wears its section title's color (user call 2026-08-13);
              ! beats the button's own text-stone-400. */}
          <HelpButton sectionId="characters" className="!text-[#c084fc]" />
          </div>
          {/* UPPERCASE by user call (2026-07-31): "making titles capital and
              more bold" — the ramp's register applied to the section title
              while it keeps its classic carve, medieval face, themed size
              and the purple hero identity. carved-header already carries
              700 weight + 0.05em tracking; the transform is what changes. */}
          <h3 className="carved-header carved-header-arcane font-medieval text-lg lg:text-xl uppercase whitespace-nowrap">Heroes</h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Counter in the ramp's registers (user call, 2026-07-31): the
              count is a stat value (hud-num, tabular — no reflow as it
              ticks), the word is furniture (hud-label, uppercase). The
              at-max copper highlight stays on the numbers, where the state
              actually lives. */}
          <span className="flex items-baseline gap-1">
            <span className={`hud-num ${isAtMaxPlaced ? 'text-copper-400' : 'text-stone-400'}`}>
              {placedCharacterIds.length}/{effectiveMaxPlaceable}
            </span>
            <span className="hud-label text-stone-400">placed</span>
          </span>
          {onClearAll && placedCharacterIds.length > 0 && !disabled && (
            <button
              onClick={onClearAll}
              // -my-1: the 28px hit box is taller than the row's natural
              // ~20px text height — negative margin keeps the touch target
              // without growing the row when the button appears (the panel
              // below must not shift on hero placement)
              // hit-44 finishes the job the -my-1 started: 28px of paint,
              // 44px of target, still zero layout pixels. --hit-w caps the
              // horizontal slop so this destructive control (clear all placed
              // heroes) cannot reach sideways into a hero card.
              className="p-1 -my-1 text-stone-400 hover:text-blood-400 hover:bg-stone-700 rounded-pixel transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center hit-44 [--hit-w:34px]"
              title="Remove all placed heroes"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Hero strip — equal-width slots separated by vertical dividers.
          The selection tint + caret live in a SlidingSelection overlay (in a
          relative wrapper OUTSIDE the divide-x flex row, so the dividers
          don't paint borders on the overlay divs) and glide between slots
          instead of snapping card-to-card. */}
      <div className="relative">
      <SlidingSelection
        slotCount={stripCharacterIds.length}
        selectedIndex={selectedStripIndex}
        caretClass="text-copper-400"
      />
      <div className="flex divide-x divide-stone-700">
        {stripCharacterIds.map((charId) => {
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

          // Input heroes have no meaningful default — the arrow live-binds to
          // the player's compass choice (pending or placed) and has nothing
          // to point at until one is made.
          const isInputFacing = !!character.facingAcceptsUserInput;
          const arrowDir = isInputFacing
            ? (placedCharacters.find(pc => pc.characterId === character.id)?.facing
                ?? pendingFacingOverrides[character.id])
            : character.defaultFacing;

          // ?directions=card: this hero's direction inputs, for the compass
          // in the stat line. The compass is LOUD (lit brass, breathing)
          // while any choice is owed and quiet arcane once all are made. It
          // lives in the stat line — never on the sprite (user call
          // 2026-09-30: the first cut, a plate on the art's corner, covered
          // the hero). Five or more cards: the boxed chip no longer fits
          // beside HP and the arrow, so it drops to the bare glyph.
          const cardEntries = DIRECTIONS_LAYOUT === 'card' ? buildDirectionEntries(character, true) : [];
          const hasAim = cardEntries.length > 0;
          const owed = cardEntries.filter(owesChoice);
          // Never loud while the panel is disabled: during a run a placed
          // hero's live facing can turn outside the creator's allowed subset,
          // which would read as "a choice is owed" on a panel where nothing
          // can be chosen.
          const aimLoud = !disabled && owed.length > 0;
          const stripSize = stripCharacterIds.length;

          // Card layout ported from the experiment at the user's request
          // (2026-07-31): fixed-height bands (sprite / 38px name+epithet /
          // 14px stat line), the Pick chip and Set corner plate, art-only dim
          // for placed cards — with the classic skin kept (copper tint,
          // divide-x strip, purple hero identity).
          const card = (
            // A real <button>: keyboard-reachable card, correct aria-pressed
            // selection state, the global *:focus-visible ring for free.
            // Valid because the card contains no interactive children (the
            // compass lives in the info area below, not on the card).
            <button
              key={charId}
              type="button"
              aria-pressed={isSelected}
              disabled={cannotSelect}
              onClick={() => !cannotSelect && onSelectCharacter(isSelected ? null : charId)}
              // Card layout only: min-w-0 here and on the slot wrapper, so
              // a stat line made wider by the compass can never widen its
              // card — the slots stay equal and the caret stays centred.
              className={`flex-1 ${DIRECTIONS_LAYOUT === 'card' ? 'min-w-0' : ''} flex flex-col items-center px-1 pt-0.5 pb-2 relative transition-colors ${
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
                  // Placed but NOT viewed: dim only the ART (sprite wrapper
                  // below) — "already placed" is a fact about the unit, not
                  // a reason to make its name and HP harder to read; the
                  // Set corner plate says it in words.
                  ? 'cursor-pointer [@media(hover:hover)]:hover:bg-stone-700/30'
                  : isSelected
                  ? 'bg-copper-900/15 cursor-pointer'
                  : '[@media(hover:hover)]:hover:bg-stone-700/30 cursor-pointer'
              }`}
            >
              {/* Sprite — takes full card width, uniform height across the row */}
              <div className="relative w-full">
                {/* THE PLACED DIM IS OPACITY ON A WRAPPER, NEVER A FILTER ON
                    THE CANVAS. SpriteThumbnail drives a requestAnimationFrame
                    loop whose phases key off `cardPlaced`, so a CSS filter
                    over that canvas would be re-evaluated every frame — the
                    pinned page-decoration rule. Opacity is compositor-only. */}
                <div className={isPlaced && !isSelected ? 'opacity-50' : undefined}>
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
                    // Selection glow is ungated: a placed hero you have
                    // tapped to re-read is still THE SELECTED CARD, and a
                    // different selection language for it made the strip
                    // look like it had two kinds of selection.
                    canvasStyle={isSelected ? { filter: 'drop-shadow(0 0 2px rgba(0,0,0,1)) drop-shadow(0 0 3px rgba(212,165,116,0.9)) drop-shadow(0 0 7px rgba(212,165,116,0.5))' } : undefined}
                  />
                </div>
                {isPlaced && (
                  // A stamped corner plate instead of a system-font dingbat:
                  // the old centred ✓ was drawn by whatever glyph the device
                  // had, sat ON the art it was describing, and said nothing a
                  // stranger to the game could read.
                  <span className="absolute bottom-0 left-0 hud-label px-1 py-0.5 rounded-pixel bg-copper-900/80 border border-copper-700 text-copper-300">
                    Set
                  </span>
                )}
              </div>

              {/* NAME + epithet — a FIXED 38px box, one clamped line each,
                  full text in `title`. Fixed bands keep every card the same
                  height whether its hero is 'Ru' or 'Bartholomew the
                  Unready', which retires the measured-min-height machinery
                  the old two-line block needed. */}
              <div className="w-full h-[38px] flex flex-col items-center justify-center overflow-hidden leading-none">
                <span
                  // Card layout: slots are equal by construction (min-w-0), so
                  // a name wider than its slot must be bounded to it for the
                  // clamp to work — unbounded it was centred and cut on BOTH
                  // sides ("eflecto").
                  className={`hud-title text-arcane-300 text-center break-words line-clamp-1 ${DIRECTIONS_LAYOUT === 'card' ? 'max-w-full' : ''}`}
                  title={character.title ? `${character.name} — ${character.title}` : character.name}
                >
                  {character.name}
                </span>
                {character.title && (
                  // Epithet in the NAME's color (user call 2026-08-13:
                  // "Steve 'the Brave'" — name and title one hue), /90
                  // keeps it a half-step subdued under the solid name.
                  <span className="mt-0.5 text-[10px] italic text-arcane-300/90 text-center line-clamp-1">
                    {character.title}
                  </span>
                )}
              </div>

              {/* STAT LINE — one 14px row. The border-r rule between HP and
                  movement is gone (one divider language per strip); a real
                  12px gap does the separating. */}
              <div className={`flex items-center justify-center ${hasAim ? (stripSize >= 5 ? 'gap-1' : 'gap-2') : 'gap-3'} w-full h-[14px]`}>
                <div className="flex items-center gap-1">
                  <span className="hud-label text-copper-400">HP</span>
                  <span className="hud-num" style={{ color: 'var(--hud-vital)' }}>
                    {character.health}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-copper-400">
                  {hasAim ? (
                    /* Card layout, hero with directions to aim: the heading
                       (once there is one to show) and then the compass. The
                       chip here is PAINT ONLY — the tap target is the
                       .hero-aim button laid over this corner of the card
                       (a card is a <button> and cannot hold another). */
                    <>
                      {moveInfo && arrowDir && (
                        <>
                          {moveInfo.tilesPerMove > 1 && (
                            <span className="hud-num">{moveInfo.tilesPerMove}</span>
                          )}
                          <MovementArrow
                            direction={arrowDir}
                            className={isInputFacing ? 'text-arcane-300' : 'text-copper-400'}
                            size={13}
                          />
                        </>
                      )}
                      <span
                        aria-hidden="true"
                        className={`hero-aim-chip ${aimLoud ? 'hero-aim-chip--owed' : 'hero-aim-chip--done'} ${stripSize >= 5 ? 'hero-aim-chip--bare' : ''}`}
                      >
                        <CompassGlyph className={aimLoud ? 'hud-breathe' : ''} />
                        {/* How many are still owed, once there is more than
                            one to owe and the strip has room for a digit. */}
                        {aimLoud && cardEntries.length > 1 && stripSize <= 3 && (
                          <span className="hud-num">{owed.length}</span>
                        )}
                      </span>
                    </>
                  ) : moveInfo ? (
                    arrowDir ? (
                      <>
                        {moveInfo.tilesPerMove > 1 && (
                          <span className="hud-num">{moveInfo.tilesPerMove}</span>
                        )}
                        {/* Always animated — user call (2026-07-31): the
                            travelling arrow plays on every card, as classic
                            does, not only the selected one. */}
                        <MovementArrow
                          direction={arrowDir}
                          className={isInputFacing ? 'text-arcane-300' : 'text-copper-400'}
                          size={13}
                        />
                      </>
                    ) : (
                      /* A BLOCKING STATE MUST NEVER BE THE SMALLEST THING ON
                         SCREEN. This was an 11px '?' at 80% opacity — the
                         least legible mark in the panel standing in for the
                         one input without which the hero cannot be placed. */
                      <span
                        className="hud-label px-1 rounded-pixel bg-black/35 whitespace-nowrap"
                        style={{ color: 'var(--hud-gold)' }}
                      >
                        Pick
                      </span>
                    )
                  ) : (
                    <span className="hud-num text-stone-400">—</span>
                  )}
                </div>
              </div>
            </button>
          );
          if (DIRECTIONS_LAYOUT !== 'card') return card;

          // AIM CONTROL (?directions=card) — the tap target for the compass
          // painted in the stat line above. A SIBLING of the card inside one
          // slot wrapper, never a child (a card is a <button>, and a button
          // cannot hold another button), transparent, 44px tall, laid over
          // the card's bottom-right corner where the compass sits, and later
          // in the DOM so it wins the tap over the card beneath it. It opens
          // the picker on the first choice still owed, and never reaches the
          // sprite.
          //
          // ONLY ON THE SELECTED CARD (user call 2026-09-30): on any other
          // card that corner is just the card, so "I meant to tap the hero
          // and hit their compass" cannot happen — the first tap always
          // selects. A player who never finds the compass is still asked:
          // tapping a tile with choices owed opens the same picker.
          const canAim = hasAim && isSelected && !disabled && !cannotSelect;
          return (
            <div key={charId} className="flex-1 min-w-0 relative flex">
              {card}
              {canAim && (
                <button
                  type="button"
                  className="hero-aim"
                  aria-haspopup="dialog"
                  aria-expanded={picker?.charId === charId}
                  aria-label={aimLoud
                    ? `Pick directions for ${character.name}, ${owed.length} of ${cardEntries.length} remaining`
                    : `Change directions for ${character.name}`}
                  onClick={() => setPicker({ charId, key: (owed[0] ?? cardEntries[0]).key })}
                />
              )}
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
        {/* THE DRAWER — natural height, page grows with wordy heroes
            (unbounded 2026-08-01 by user call: no nested scroll region on
            a phone). Layout is the classic three columns with dashed
            dividers; the Directions column carries the new order pill,
            which opens the 56px picker sheet ("keep the direction
            selector looking the same"). */}
        <div
          // Box padding comes from .hero-drawer (6px top and bottom) — it is
          // unlayered CSS and outranks any padding utility placed here.
          className="hero-drawer bg-copper-900/15 rounded-b-pixel-md"
          style={{
            opacity: isOpen ? 1 : 0,
            transform: isOpen ? 'translateY(0)' : 'translateY(-8px)',
            transition: isOpen
              ? 'opacity 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)'
              : 'opacity 0.2s ease-in, transform 0.3s ease-in',
          }}
        >
          {/* DIRECTIONS NOTE (?directions=card) — one read-only line where
              the Directions column used to be. While a choice is owed it
              tells the player where to make it (the inline glyph IS the
              compass on the card above); either way it lists every choice
              with its state, so what was picked for a spell stays visible
              on the page and not only inside the picker. Wording is a
              first pass — the user asked for "something like" this. */}
          {DIRECTIONS_LAYOUT === 'card' && hasDirectionInputs && (
            <div className="hud-label px-2 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-center">
              {directionInputEntries.some(owesChoice) ? (
                <span className="inline-flex items-center gap-1" style={{ color: 'var(--hud-gold)' }}>
                  Tap <CompassGlyph size={11} /> above to pick directions:
                </span>
              ) : (
                <span className="text-stone-400">Directions:</span>
              )}
              {directionInputEntries.map(e => (
                <span key={e.key} className="inline-flex items-center gap-1 text-arcane-300">
                  <span className="min-w-0 break-words">{e.caption.replace(/ Direction$/, '')}</span>
                  {owesChoice(e) ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--hud-gold)' }} aria-hidden="true" />
                      <span className="sr-only">not picked</span>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-parchment-300 flex-shrink-0">
                      <CompassArrow direction={e.current!} size={11} />
                      {BEARING_INITIALS[e.current!] ?? e.current}
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}

          {/* RAIL MODE (?directions=rail, phones only): a grid — one text
              stack in column 1 (Actions above Attributes), the Directions
              column spanning both rows at the right edge. From 640px the
              same nodes fall back to the classic flex row, where the grid
              placement classes are inert. */}
          {(hasActionSteps || hasAttributes || showDirections) && (
          <div className={railMode
            ? `grid grid-cols-[minmax(0,1fr)_auto_auto] ${railTwoText ? 'grid-rows-[auto_1fr] gap-y-2' : ''} sm:flex mb-2 px-2`
            : `flex mb-2 px-2 ${[hasActionSteps, showDirections, hasAttributes].filter(Boolean).length === 1 ? 'justify-center' : 'gap-0'}`}>
              {hasActionSteps && (
                <div className={railMode ? 'col-start-1 min-w-0 sm:flex-1' : `${hasAttributes || showDirections ? 'flex-1 min-w-0' : 'w-full'}`}>
                  <p className="hud-label text-stone-400 mb-1 text-center">Actions</p>
                  <ol className="hud-body text-stone-300 space-y-1">
                    {renderedCharacter.actionSteps!.map((step, idx) => (
                      <li key={idx} className="flex items-baseline gap-1">
                        {/* min-w-[1em]: the themed face's digits are not tabular
                            ("1." is 8.6px, "2." is 12.7px measured), so without
                            one shared gutter each step's text started at a
                            different x. */}
                        <span className="font-semibold text-stone-400 flex-shrink-0 min-w-[1em]">{idx + 1}.</span>
                        {/* min-w-0 + break-words on every text cell in the
                            drawer: a flex item will not shrink below its
                            longest word, so one long word used to spill out
                            of a narrow column instead of breaking. */}
                        <span className="min-w-0 break-words">
                          <RichTextRenderer html={step.text} />
                          {step.subSteps && step.subSteps.length > 0 && (
                            <ul className="mt-0.5 space-y-1 text-stone-400">
                              {step.subSteps.map((sub, subIdx) => (
                                <li key={subIdx} className="flex items-baseline gap-1">
                                  <span className="flex-shrink-0">•</span>
                                  <RichTextRenderer html={sub} className="min-w-0 break-words" />
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
              {hasActionSteps && (showDirections || hasAttributes) && (
                <div className={`self-stretch mx-2 flex-shrink-0 border-l border-dashed border-stone-600/40 ${railMode ? 'hidden sm:block' : ''}`} />
              )}
              {railMode && (
                <div aria-hidden className={`col-start-2 row-start-1 ${railTwoText ? 'row-span-2' : ''} ml-2 mr-1 border-l border-dashed border-stone-600/40 sm:hidden`} />
              )}

              {/* DIRECTIONS — the new selector in the classic column: each
                  entry is its caption plus a compact order pill (loud brass
                  when unset — the blocking state — quiet arcane outline once
                  chosen). Tapping the pill opens the DirectionPicker sheet,
                  whose 56px cells are why the 17px in-panel compass could
                  retire. */}
              {showDirections && (
                // 84px HARD (user call round 2, 2026-08-01: "shrink even
                // further, even if FACING DIRECTION wraps to two lines") —
                // real action/attribute sentences were wrapping 6 deep while
                // this column held one short pill. 84 = the SET pill's floor
                // (arrow + NORTHWEST at 10px, chevron dropped in that
                // state); captions wrap freely above it.
                <div className={`flex-shrink-0 px-1 ${railMode ? `col-start-3 row-start-1 ${railTwoText ? 'row-span-2' : ''}` : ''}`} style={{ width: '84px' }}>
                  <p className="hud-label text-stone-400 mb-1 text-center">Directions</p>
                  {directionInputEntries.map(entry => (
                    <div key={entry.key} className="mb-1.5 last:mb-0">
                      {/* 10px (inline — .theme-root .hud-label's 11px outranks
                          utilities): the size cut that pays for the narrower
                          column, caption and pill text together. */}
                      <p className="hud-label text-arcane-300 text-center mb-1 leading-tight break-words" style={{ fontSize: '10px' }}>{entry.caption}</p>
                      {renderOrderPill(entry)}
                    </div>
                  ))}
                </div>
              )}

              {showDirections && hasAttributes && (
                <div className={`self-stretch mx-2 flex-shrink-0 border-l border-dashed border-stone-600/40 ${railMode ? 'hidden sm:block' : ''}`} />
              )}
              {hasAttributes && (
                <div className={railMode ? 'col-start-1 min-w-0 sm:flex-1' : `${hasActionSteps || showDirections ? 'flex-1 min-w-0' : 'w-full'}`}>
                  <p className="hud-label text-stone-400 mb-1 text-center">Attributes</p>
                  <ul className="hud-body text-stone-300 space-y-1">
                    {renderedCharacter.attributes!.map((attr, idx) => (
                      <li key={idx}>
                        <div className="flex items-baseline gap-1">
                          <span className="text-stone-400 flex-shrink-0">•</span>
                          <RichTextRenderer html={attributeText(attr)} className="min-w-0 break-words" />
                        </div>
                        {(attributeSubItems(attr) || []).map((sub, subIdx) => (
                          <div key={subIdx} className="flex items-baseline gap-1 ml-3 mt-0.5">
                            <span className="text-stone-500 flex-shrink-0">◦</span>
                            <RichTextRenderer html={sub} className="min-w-0 break-words" />
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

      {/* The picker sheet — portalled to <body>, one entry at a time. */}
      <DirectionPicker
        entry={activePickerEntry}
        // Card layout only: every entry the hero owes, so the sheet can show
        // one tab per choice and walk to the next unset one after a pick.
        entries={DIRECTIONS_LAYOUT === 'card' ? pickerEntries : undefined}
        onSwitch={(key) => setPicker(p => (p ? { ...p, key } : p))}
        title={pickerCharacter?.name}
        sprite={(pickerCharacter ?? renderedCharacter)?.customSprite}
        // Placement ask: the sheet carries the Place button and waits for it
        // (no auto-dismiss on the last pick); dismissing cancels the ask.
        confirm={picker?.placing ? {
          enabled: pickerOwedCount === 0,
          label: pickerOwedCount === 0 ? 'Place hero' : `${pickerOwedCount} to pick`,
          onConfirm: () => onPlacementAimConfirm?.(),
        } : undefined}
        onClose={() => {
          const wasPlacing = picker?.placing;
          setPicker(null);
          if (wasPlacing) onPlacementAimCancel?.();
        }}
      />

      {/* Hint row — UNMOUNTS when the hint hides (user call, 2026-08-01
          mobile test): the old min-h reservation left a dead gap under the
          drawer once a hero was selected, which read worse than the small
          layout shift it prevented. Same chip grammar as the board's "Tap
          the dungeon" prompt; the PLACEMENT half lives on the board itself
          (see Game.tsx). */}
      {!disabled && !(isAtMaxPlaced || (selectedCharacterId && !placedCharacterIds.includes(selectedCharacterId))) && (
        <div className="mt-1.5 text-center">
          <TapHintChip>Tap a hero for more info</TapHintChip>
        </div>
      )}
    </>
  );

  if (noPanel) {
    return <div className={disabled ? 'opacity-60' : ''}>{content}</div>;
  }

  return (
    <div className={`dungeon-panel p-2 lg:p-3 ${disabled ? 'opacity-60' : ''}`}>
      {content}
    </div>
  );
};
