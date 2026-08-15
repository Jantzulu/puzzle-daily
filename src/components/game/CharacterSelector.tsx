import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getCharacter } from '../../data/characters';
import type { CharacterAction, PlacedCharacter, Direction } from '../../types/game';
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

const MOVEMENT_TYPES = new Set([
  'move_forward', 'move_backward', 'move_left', 'move_right',
  'move_diagonal_ne', 'move_diagonal_nw', 'move_diagonal_se', 'move_diagonal_sw',
]);

function getMovementInfo(behavior: CharacterAction[]) {
  const moveAction = behavior.find(a => MOVEMENT_TYPES.has(a.type));
  return moveAction ? { tilesPerMove: moveAction.tilesPerMove || 1 } : null;
}

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

  const directionInputSpells = getDirectionInputSpells(renderedCharacter);
  const hasFacingInput = !!renderedCharacter?.facingAcceptsUserInput;
  const hasDirectionInputs = hasFacingInput || directionInputSpells.length > 0;

  const placedSelectedChar = placedCharacters.find(pc => pc.characterId === renderedCharId);

  // Which order the player is currently aiming, if any. Held as a KEY, not
  // as the entry object: the entries are rebuilt on every render, so an
  // object here would re-latch the picker's open animation on every update.
  const [pickerKey, setPickerKey] = useState<string | null>(null);

  // Changing hero (or closing the panel) closes the picker. The sheet
  // belongs to ONE order on ONE hero, and a stale sheet would write the new
  // hero's facing from the old hero's rose.
  useEffect(() => { setPickerKey(null); }, [renderedCharId]);

  // The Directions column's entries — starting facing first, then each
  // direction-input spell. `current` stays undefined until the player has
  // actually picked (no phantom default: the engine has no fallback to
  // display, placement is gated on every entry being chosen).
  const directionInputEntries: DirectionPickerEntry[] = [
    ...(hasFacingInput && renderedCharacter ? [{
      key: '__facing',
      caption: FACING_CAPTION,
      // isFacing: the picker stays open on pick and turns its hub hero to
      // the chosen bearing (see DirectionPickerEntry).
      isFacing: true,
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

  const activePickerEntry = pickerKey
    ? directionInputEntries.find(e => e.key === pickerKey) ?? null
    : null;

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
        onClick={(e) => { e.stopPropagation(); setPickerKey(entry.key); }}
        className={className}
        style={{ fontSize: '10px' }}
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
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center">
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
          {/* relative z-[46]: one step above the quest anchor's z-45, so
              a TALL rolled scroll tucked behind the seal hangs BENEATH
              this title instead of covering it (user call 2026-08-13).
              Deliberately on the h3 alone — lifting the whole header row
              would trap the (?)'s fixed help overlay in a z-46 stacking
              context under the z-50 navbar. */}
          <h3 className="carved-header carved-header-arcane font-medieval text-lg lg:text-xl uppercase whitespace-nowrap relative z-[46]">Heroes</h3>
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

          // Card layout ported from the experiment at the user's request
          // (2026-07-31): fixed-height bands (sprite / 38px name+epithet /
          // 14px stat line), the Pick chip and Set corner plate, art-only dim
          // for placed cards — with the classic skin kept (copper tint,
          // divide-x strip, purple hero identity).
          return (
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
              className={`flex-1 flex flex-col items-center px-1 pt-0.5 pb-2 relative transition-colors ${
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
                  className="hud-title text-arcane-300 text-center break-words line-clamp-1"
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
              <div className="flex items-center justify-center gap-3 w-full h-[14px]">
                <div className="flex items-center gap-1">
                  <span className="hud-label text-copper-400">HP</span>
                  <span className="hud-num" style={{ color: 'var(--hud-vital)' }}>
                    {character.health}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-copper-400">
                  {moveInfo ? (
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
          className="hero-drawer pt-2.5 pb-0 mt-0 bg-copper-900/15 rounded-b-pixel-md"
          style={{
            opacity: isOpen ? 1 : 0,
            transform: isOpen ? 'translateY(0)' : 'translateY(-8px)',
            transition: isOpen
              ? 'opacity 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)'
              : 'opacity 0.2s ease-in, transform 0.3s ease-in',
          }}
        >
          <div>
          <div className={`flex mb-2 px-2 ${[hasActionSteps, hasDirectionInputs, hasAttributes].filter(Boolean).length === 1 ? 'justify-center' : 'gap-0'}`}>
              {hasActionSteps && (
                <div className={`${hasAttributes || hasDirectionInputs ? 'flex-1 min-w-0 pr-2' : 'w-full'}`}>
                  <p className="hud-label text-stone-400 mb-1 text-center">Actions</p>
                  <ol className="hud-body text-stone-300 space-y-1 pl-2">
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
              {hasActionSteps && (hasDirectionInputs || hasAttributes) && (
                <div className="self-stretch mx-2 flex-shrink-0 border-l border-dashed border-stone-600/40" />
              )}

              {/* DIRECTIONS — the new selector in the classic column: each
                  entry is its caption plus a compact order pill (loud brass
                  when unset — the blocking state — quiet arcane outline once
                  chosen). Tapping the pill opens the DirectionPicker sheet,
                  whose 56px cells are why the 17px in-panel compass could
                  retire. */}
              {hasDirectionInputs && (
                // 84px HARD (user call round 2, 2026-08-01: "shrink even
                // further, even if FACING DIRECTION wraps to two lines") —
                // real action/attribute sentences were wrapping 6 deep while
                // this column held one short pill. 84 = the SET pill's floor
                // (arrow + NORTHWEST at 10px, chevron dropped in that
                // state); captions wrap freely above it.
                <div className="flex-shrink-0 px-1" style={{ width: '84px' }}>
                  <p className="hud-label text-stone-400 mb-1 text-center">Directions</p>
                  {directionInputEntries.map(entry => (
                    <div key={entry.key} className="mb-1.5 last:mb-0">
                      {/* 10px (inline — .theme-root .hud-label's 11px outranks
                          utilities): the size cut that pays for the narrower
                          column, caption and pill text together. */}
                      <p className="hud-label text-arcane-300 text-center mb-1 leading-tight" style={{ fontSize: '10px' }}>{entry.caption}</p>
                      {renderOrderPill(entry)}
                    </div>
                  ))}
                </div>
              )}

              {hasDirectionInputs && hasAttributes && (
                <div className="self-stretch mx-2 flex-shrink-0 border-l border-dashed border-stone-600/40" />
              )}
              {hasAttributes && (
                <div className={`${hasActionSteps || hasDirectionInputs ? 'flex-1 min-w-0 pl-2' : 'w-full'}`}>
                  <p className="hud-label text-stone-400 mb-1 text-center">Attributes</p>
                  <ul className="hud-body text-stone-300 space-y-1">
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
          </div>

        </div>
        </div>
        </div>
      )}

      {/* The picker sheet — portalled to <body>, one entry at a time. */}
      <DirectionPicker
        entry={activePickerEntry}
        sprite={renderedCharacter?.customSprite}
        onClose={() => setPickerKey(null)}
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
