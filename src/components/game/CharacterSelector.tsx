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
import { DirectionPicker, CompassArrow, CompassGlyph, COMPASS_ART_PX, BEARING_INITIALS, type DirectionPickerEntry } from './DirectionPicker';
import type { ThemeAssets } from '../../utils/themeAssets';
import { CARD_PIXEL_SCALE, computeCardSpriteAreaHeight } from './cardConstants';
import { StripDividers } from './StripDividers';
import { SelectionStrip, SelectionDrawer } from './SelectionShape';
import placedBannerIcon from '../../assets/icons/placed-banner.png';
import { useElementWidth, artGridSlotStyle } from '../../hooks/useElementWidth';
import { subscribeToImageLoads } from '../../utils/imageLoader';

const MOVEMENT_TYPES = new Set([
  'move_forward', 'move_backward', 'move_left', 'move_right',
  'move_diagonal_ne', 'move_diagonal_nw', 'move_diagonal_se', 'move_diagonal_sw',
]);

function getMovementInfo(behavior: CharacterAction[]) {
  const moveAction = behavior.find(a => MOVEMENT_TYPES.has(a.type));
  return moveAction ? { tilesPerMove: moveAction.tilesPerMove || 1 } : null;
}

/**
 * Whether this hero opens a drawer at all: action steps, attributes, or a
 * direction choice (the drawer's note line). The drawer's own render
 * condition, the open/close choreography and the selection shape's closed
 * card all use this one test.
 */
function hasDrawerContent(character: Character | null | undefined): boolean {
  return !!character && (
    (character.actionSteps?.length ?? 0) > 0
    || (character.attributes?.length ?? 0) > 0
    || !!character.facingAcceptsUserInput
    || getDirectionInputSpells(character).length > 0
  );
}


// The bearing ARROW lives with the picker that owns the rose
// (DirectionPicker.tsx) — the drawer note's "you chose north-east" readout
// and the picker's cells must never drift apart, so both import one arrow.

/**
 * WHERE A HERO'S DIRECTION CHOICES LIVE (settled 2026-09-30, user call after
 * comparing three layouts on a phone behind a temporary ?directions= flag).
 *
 * They are NOT in the drawer. The drawer is Actions | Attributes, the same
 * pair the enemy drawer shows, plus one read-only note line that lists each
 * choice and its state. The choices are made in the DirectionPicker sheet,
 * which opens two ways:
 *   - the COMPASS in the selected card's stat line (pre-aim / re-aim);
 *   - tapping a tile with choices still owed — the parent's placement ask
 *     (`placementAim`), which adds a Place button to the sheet.
 *
 * What this replaced, and must not come back: a Directions column in the
 * middle of the drawer (84px of a ~340px row — action text wrapped one or
 * two words a line on phones), and a plate on the sprite's corner (it
 * covered the hero). A full-width direction row above the text was rejected
 * back on 2026-07-30 and costs ~50px per extra choice.
 */

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
   * The parent's "ask, don't refuse": set when the player tapped a tile with
   * a hero that still owes direction choices. Each ask is
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

    // A hero with nothing to show opens no drawer, so moving to or from one
    // is an open or a close, not a swap: a drawer that popped in (or out) at
    // full strength ran ahead of the selection shape's 300ms card fade.
    // Decided by the NEXT hero first: a drawer-less hero always lets
    // whatever drawer is showing (or still closing from a quick earlier
    // tap) finish closing, then takes over.
    const prevHadDrawer = hasDrawerContent(prev ? getCharacter(prev) : null);
    const nextHasDrawer = hasDrawerContent(selectedCharacterId ? getCharacter(selectedCharacterId) : null);

    if (selectedCharacterId !== null && !nextHasDrawer) {
      // → drawer-less hero: animate any drawer closed, then hand over (the
      // new hero renders none; with nothing mounted this only defers an
      // invisible change)
      setIsOpen(false);
      exitTimerRef.current = setTimeout(() => setRenderedCharId(selectedCharacterId), 300);
    } else if (selectedCharacterId !== null && (prev === null || !prevHadDrawer)) {
      // null (or a drawer-less hero) → hero: mount closed, then animate open
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

  // The rendered hero's entries (the drawer's note line).
  const directionInputEntries = buildDirectionEntries(renderedCharacter, !!selectedCharacterId);
  // Whether the note can point at the compass: the chip's tap target exists
  // only on a selected card in an enabled panel, with a way to store a pick.
  const canChangeDirections = !disabled && directionInputEntries.some(e => !!e.onPick);
  const hasDirectionInputs = directionInputEntries.length > 0;

  // Which choice the player is currently aiming, if any. Held as KEYS, not as
  // the entry object: the entries are rebuilt on every render, so an object
  // here would re-latch the picker's open animation on every update.
  // `placing` marks a picker opened by a tile tap (the placement ask): it
  // carries the Place button, and closing it any other way cancels the ask.
  const [picker, setPicker] = useState<{ charId: string; key: string; placing?: boolean } | null>(null);

  // An entry still owes a choice when nothing is stored OR the stored choice
  // is outside the creator's allowed subset — the placement gate's own rule
  // (getMissingDirectionInputs).
  const owesChoice = (e: DirectionPickerEntry) => !(e.current && e.allowed.includes(e.current));

  // The panel going disabled (a run starts) closes the picker. The sheet is
  // keyed by its own hero (picker.charId), so it always writes that hero's
  // choices, whatever the rendered hero is doing.
  useEffect(() => {
    if (!disabled) return;
    setPicker(null);
    if (placementAim) onPlacementAimCancel?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to the panel going disabled only
  }, [disabled]);

  // The ask belongs to the hero it was opened for. The sheet is modal to a
  // finger but not to a keyboard, so the selection CAN move under it; the
  // moment it does, the ask is off (the parent also refuses to place for a
  // hero other than the one asked about).
  useEffect(() => {
    if (placementAim && selectedCharacterId !== placementAim.charId) onPlacementAimCancel?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to the selection changing only
  }, [selectedCharacterId]);

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
  const pickerEntries = buildDirectionEntries(pickerCharacter, !disabled);
  const activePickerEntry = picker
    ? pickerEntries.find(e => e.key === picker.key) ?? null
    : null;
  const pickerOwedCount = pickerEntries.filter(owesChoice).length;

  // Slot list for the strip and its overlays: only ids that resolve to real
  // characters render cards, so the overlays' slot math must index within
  // the same filtered list.
  const stripCharacterIds = availableCharacterIds.filter((id) => !!getCharacter(id));
  const selectedStripIndex = selectedCharacterId ? stripCharacterIds.indexOf(selectedCharacterId) : -1;
  // The strip's measured width: the cards, the posts and the selection
  // shape all sit on the same art-grid slot boundaries.
  const [stripRef, stripWidth] = useElementWidth<HTMLDivElement>();
  // The selection shape: the drawer half follows the RENDERED hero (it
  // outlives the selection through the close animation). Each card's half
  // is open or closed by ITS OWN hero — a hero with nothing to show opens no
  // drawer, so its card closes — so a card fading out keeps its shape.
  const renderedStripIndex = renderedCharId ? stripCharacterIds.indexOf(renderedCharId) : -1;
  const heroOpensDrawer = (id: string) => hasDrawerContent(getCharacter(id));
  // Shaped only while the drawer's hero still has a slot (the roster can
  // change under an open drawer); otherwise it falls back to a plain wash.
  const drawerShaped = renderedStripIndex >= 0;

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
            HelpOverlay portals to <body>.
            heroes-title-layer: while the menu gate is lowered the 46 DROPS
            below the riding rail (z-40), like the quest anchor's 45 — on a
            long (signed-in) menu the rail docks right over this title, and
            the title painted over its PLAY stone (user report 2026-10-07).
            See index.css. */}
        <div className="heroes-title-layer absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center z-[46]">
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

      {/* Hero strip — equal-width slots on the art grid. The selection
          shape's card half (SelectionStrip) and the posts between cards
          (StripDividers) are overlays in this relative wrapper, placed from
          its measured width and rendered BEFORE the card row so the cards
          paint over them. */}
      <div ref={stripRef} className="relative">
      <SelectionStrip ids={stripCharacterIds} selectedIndex={selectedStripIndex} width={stripWidth} tone="copper" opensDrawer={heroOpensDrawer} />
      <StripDividers slotCount={stripCharacterIds.length} selectedIndex={selectedStripIndex} width={stripWidth} />
      <div className="flex">
        {stripCharacterIds.map((charId, slot) => {
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

          // This hero's direction inputs, for the compass in the stat line. The compass is LOUD (lit brass, breathing)
          // while any choice is owed and quiet arcane once all are made. It
          // lives in the stat line — never on the sprite (user call
          // 2026-09-30: the first cut, a plate on the art's corner, covered
          // the hero). Five or more cards: the boxed chip no longer fits
          // beside HP and the arrow, so it drops to the bare glyph.
          const cardEntries = buildDirectionEntries(character, true);
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
          // 14px stat line), the Set corner plate, art-only dim for placed
          // cards — with the classic skin kept (copper tint, purple hero
          // identity).
          const card = (
            // A real <button>: keyboard-reachable card, correct aria-pressed
            // selection state, the global *:focus-visible ring for free.
            // Valid because the card contains no interactive children — the
            // compass in its stat line is paint; its tap target is a SIBLING
            // button (.hero-aim) laid over the card.
            <button
              key={charId}
              type="button"
              aria-pressed={isSelected}
              disabled={cannotSelect}
              onClick={() => !cannotSelect && onSelectCharacter(isSelected ? null : charId)}
              // min-w-0 here and on the slot wrapper: a card can never be
              // widened by its own content (a long name, a stat line with
              // the compass), so the slots stay equal and on the boundaries
              // the selection shape and the posts use.
              className={`flex-1 min-w-0 flex flex-col items-center px-1 pt-0.5 pb-2 relative transition-colors ${
                cannotSelect
                  ? 'opacity-40 cursor-not-allowed'
                  : isPlaced && isSelected
                  // Placed AND actively viewed: full brightness so the
                  // sprite/name/HP match the (full-brightness) info area
                  // below. No background of its own: the selected look is
                  // the selection shape laid under the row (SelectionShape).
                  ? 'cursor-pointer'
                  : isPlaced
                  // Placed but NOT viewed: dim only the ART (sprite wrapper
                  // below) — "already placed" is a fact about the unit, not
                  // a reason to make its name and HP harder to read; the
                  // Set corner plate says it in words.
                  ? 'cursor-pointer unit-card-glow'
                  : isSelected
                  ? 'cursor-pointer'
                  : 'unit-card-glow cursor-pointer'
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
                  // PLACED: the user's painted banner (13×13, a centre pixel
                  // on the pole) in the sprite band's TOP-LEFT corner,
                  // opposite the compass and inset the same way (user call
                  // 2026-10-03; it replaces a "Set" text plate). 2× like the
                  // card sprites, 1× on a crowded strip. Outside the
                  // placed-dim wrapper, so it stays at full strength. The
                  // words survive for screen readers.
                  <span className="placed-banner">
                    <img
                      src={placedBannerIcon}
                      width={stripSize >= 5 ? COMPASS_ART_PX : COMPASS_ART_PX * 2}
                      height={stripSize >= 5 ? COMPASS_ART_PX : COMPASS_ART_PX * 2}
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      className="compass-glyph"
                    />
                    <span className="sr-only">Placed</span>
                  </span>
                )}
                {hasAim && (
                  /* The compass: the sprite band's top-right corner, where
                     an enemy card wears its count badge (user call
                     2026-10-03 — in the stat line the 26px icon crowded the
                     name). PAINT ONLY: the tap target is the .hero-aim
                     button laid over this corner (a card is a <button> and
                     cannot hold another). Outside the placed-dim wrapper,
                     so it stays at full strength on a placed hero. */
                  <span
                    aria-hidden="true"
                    className={`hero-aim-chip ${aimLoud ? 'hero-aim-chip--owed' : 'hero-aim-chip--done'} ${stripSize >= 5 ? 'hero-aim-chip--bare' : ''}`}
                  >
                    {/* How many are still owed, once there is more than
                        one to owe and the strip has room for a digit. */}
                    {aimLoud && cardEntries.length > 1 && stripSize <= 3 && (
                      <span className="hud-num">{owed.length}</span>
                    )}
                    <span className="hero-aim-icon">
                      <CompassGlyph size={stripSize >= 5 ? COMPASS_ART_PX : COMPASS_ART_PX * 2} />
                    </span>
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
                  // Slots are equal by construction (min-w-0), so a name wider
                  // than its slot must be bounded to it for the clamp to
                  // work — unbounded it was centred and cut on BOTH sides
                  // ("eflecto").
                  className="hud-title text-arcane-300 text-center break-words line-clamp-1 max-w-full"
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
              <div className={`flex items-center justify-center gap-3 w-full h-[14px]`}>
                <div className="flex items-center gap-1">
                  <span className="hud-label text-copper-400">HP</span>
                  <span className="hud-num" style={{ color: 'var(--hud-vital)' }}>
                    {character.health}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-copper-400">
                  {hasAim ? (
                    /* Hero with directions to aim: the heading, once there
                       is one to show (the compass itself sits in the sprite
                       band's top-right corner). */
                    moveInfo && arrowDir ? (
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
                    ) : moveInfo ? (
                      // A mover whose facing is not picked yet: "?" in the
                      // compass's owed gold, never the dash — "—" means
                      // "does not move" on every card (user call 2026-10-03).
                      <span className="hud-num" style={{ color: 'var(--hud-gold)' }}>
                        <span aria-hidden="true">?</span>
                        <span className="sr-only">facing not picked</span>
                      </span>
                    ) : (
                      <span className="hud-num text-stone-400">—</span>
                    )
                  ) : moveInfo ? (
                    <>
                      {moveInfo.tilesPerMove > 1 && (
                        <span className="hud-num">{moveInfo.tilesPerMove}</span>
                      )}
                      {/* Always animated — user call (2026-07-31): the
                          travelling arrow plays on every card, as classic
                          does, not only the selected one. (No hero reaches
                          here without a heading: a player-chosen facing
                          takes the compass branch above, and every other
                          hero has an authored defaultFacing.) */}
                      <MovementArrow direction={arrowDir ?? character.defaultFacing} className="text-copper-400" size={13} />
                    </>
                  ) : (
                    <span className="hud-num text-stone-400">—</span>
                  )}
                </div>
              </div>
            </button>
          );
          // AIM CONTROL — the tap target for the compass painted in the sprite
          // band's top-right corner. A SIBLING of the card inside one
          // slot wrapper, never a child (a card is a <button>, and a button
          // cannot hold another button), transparent, 44px tall, laid over
          // the card's top-right corner where the compass sits, and later
          // in the DOM so it wins the tap over the card beneath it. It opens
          // the picker on the first choice still owed.
          //
          // ONLY ON THE SELECTED CARD (user call 2026-09-30): on any other
          // card that corner is just the card, so "I meant to tap the hero
          // and hit their compass" cannot happen — the first tap always
          // selects. A player who never finds the compass is still asked:
          // tapping a tile with choices owed opens the same picker.
          const canAim = hasAim && isSelected && !disabled && !cannotSelect;
          return (
            <div key={charId} className="flex-1 min-w-0 relative flex" style={artGridSlotStyle(stripWidth, stripCharacterIds.length, slot)}>
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
      {renderedCharId && renderedCharacter && hasDrawerContent(renderedCharacter) && (
        <div style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          transition: isOpen
            ? 'grid-template-rows 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)'
            : 'grid-template-rows 0.28s ease-in',
        }}>
        {/* The 2px pad (one art px) with an equal negative margin widens the
            clip on every side by the selection corner pieces' outer rim,
            without moving the drawer or the height animation. */}
        <div style={{ overflow: 'hidden', minHeight: 0, margin: -2, padding: 2 }}>
        {/* THE DRAWER — natural height, page grows with wordy heroes
            (unbounded 2026-08-01 by user call: no nested scroll region on
            a phone). Actions | Attributes with a dashed divider, the same
            pair the enemy drawer shows; direction choices are NOT here
            (see the note at the top of this file). */}
        <div
          // Box padding comes from .hero-drawer (6px top and bottom) — it is
          // unlayered CSS and outranks any padding utility placed here.
          // relative: the selection shape's drawer half anchors here (and
          // paints under the text: the drawer's transform makes it a
          // stacking context). The wash and the corners are the shape's
          // own; the plain wash is only a fallback for a hero with no slot.
          // The slide eases out WITHOUT overshoot: the old spring carried
          // the drawer (and its half of the shape) ~0.8px below the seam
          // mid-open, splitting the outline's sides for a moment.
          className={`hero-drawer relative ${drawerShaped ? '' : 'bg-copper-900/15 rounded-b-pixel-md'}`}
          style={{
            opacity: isOpen ? 1 : 0,
            transform: isOpen ? 'translateY(0)' : 'translateY(-8px)',
            transition: isOpen
              ? 'opacity 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)'
              : 'opacity 0.2s ease-in, transform 0.3s ease-in',
          }}
        >
          <SelectionDrawer ids={stripCharacterIds} index={renderedStripIndex} width={stripWidth} tone="copper" />
          {/* DIRECTIONS NOTE — one read-only line. While a choice is owed
              it tells the player where to make it (the inline glyph IS the
              compass on the card above); either way it lists every choice
              with its state, so what was picked for a spell stays visible
              on the page and not only inside the picker. The wording is a
              first pass — the user asked for "something like" this. */}
          {hasDirectionInputs && (
            <div className="hud-label px-2 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-center">
              {directionInputEntries.some(owesChoice) ? (
                <span className="inline-flex items-center gap-1" style={{ color: 'var(--hud-gold)' }}>
                  Tap <CompassGlyph /> above to pick directions:
                </span>
              ) : canChangeDirections ? (
                // All chosen, still changeable: keep naming the compass (it
                // said only "Directions:" — a player who chose through the
                // placement ask had never been told where the choices live;
                // user report 2026-09-30). Quiet stone, with the glyph in the
                // card chip's "all chosen" arcane.
                <span className="inline-flex items-center gap-1 text-stone-400">
                  Tap <CompassGlyph className="compass-glyph--done" /> above to change directions:
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

          {(hasActionSteps || hasAttributes) && (
          <div className={`flex mb-2 px-2 ${hasActionSteps && hasAttributes ? 'gap-0' : 'justify-center'}`}>
              {hasActionSteps && (
                <div className={hasAttributes ? 'flex-1 min-w-0' : 'w-full'}>
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
              {hasActionSteps && hasAttributes && (
                <div className="self-stretch mx-2 flex-shrink-0 border-l border-dashed border-stone-600/40" />
              )}
              {hasAttributes && (
                <div className={hasActionSteps ? 'flex-1 min-w-0' : 'w-full'}>
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
        // Every entry the hero owes, so the sheet can show one tab per
        // choice and walk to the next unset one after a pick.
        entries={pickerEntries}
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
