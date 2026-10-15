import React, { useEffect, useRef } from 'react';
import { Direction, SpellTemplate, TURN_INTERVAL_MS } from '../../types/game';
import type { SpellAsset, SpriteReference } from '../../types/game';
import type { CustomSprite } from '../../utils/assetStorage';
import { drawSprite } from '../editor/SpriteEditor';
import { drawProjectileArt, drawParticleArt, getRotationForDirection } from './spellArt';
import { drawFacingArrow } from './facingArrow';
import { turnAround } from '../../engine/utils';
import { drawLightGlow } from './lightGlow';
import { satellitesPaused } from './frameProfiler';
import { DESPAWN_SHRINK_MS } from '../../engine/simulation';

/**
 * THE PICKER HUB — the hero being aimed, on every tab. On the FACING tab the
 * hero idles toward the chosen bearing. On a SPELL tab (user design
 * 2026-10-14) they idle toward their facing (the facing tab's choice, or the
 * authored one) until the spell is aimed; once it is, a loop: the hero casts
 * toward the aim while the spell's own art goes that way — a bolt flies out
 * over the chosen button, a melee strike lands on it — then a beat idling
 * toward the aim, then again. Area spells (and the other no-art casts) play
 * the cast alone.
 *
 * Everything is drawn by the board's own routines: drawSprite for the hero
 * (pixel-perfect, as drawSpritePixelPerfect does), spellArt.ts for the bolt
 * and the strike. ONE renderer for every tab: the facing tab once drew its
 * hero through the card thumbnail, which places sprites differently (offsets
 * at 1 CSS px per art px instead of the board's zoom, odd sizes unsnapped),
 * so the hero jumped sideways between tabs (user report 2026-10-14). One
 * canvas spans the whole rose, so the art can leave the hub; the hero stays
 * in a 52px window in the hub, as the thumbnail did.
 */

// The rose's geometry (index.css .dir-rose: 56px cells, 8px gaps).
const CELL = 56;
const GAP = 8;
const PITCH = CELL + GAP; // one board tile, in rose pixels
const ROSE = CELL * 3 + GAP * 2;
const C = ROSE / 2; // the hub's centre
const HUB_TILE = 48; // a board tile in the hub: the hero at 2x art scale
const WINDOW = 52; // the hero's window in the 56px hub — clipped to it

// One loop: the cast (the board holds the pose for the whole turn a spell is
// cast), then a beat idling toward the aim.
const CAST_MS = TURN_INTERVAL_MS;
const IDLE_MS = TURN_INTERVAL_MS;
// Strikes and cast flashes live this long on the board (effectDuration).
const EFFECT_MS = 300;
// THE BOLT'S FLIGHT — the knobs to tune by eye on a phone (user, 2026-10-14:
// "how much would require me to view it"). Distance in board tiles from the
// hero: 1 is the chosen button's centre, which spans 0.56 to 1.44. And a
// slow-motion factor on the spell's own speed: a board bolt crosses a tile
// in 800/speed ms (200ms at the default 4), too brief to read its art in a
// single tile of flight.
const FLIGHT_TILES = 1.25;
const FLIGHT_SLOWMO = 2;
// The bolt flies under Reduce Motion too (user call 2026-10-15: minimal movement, in a project full of it); it used to fade in and
// out over the button instead.

// THE REDIRECT SCENE (user design 2026-10-15): a redirect's choice turns its
// TARGET, so a redirect tab shows the target, not the caster — fading in
// idling in its own facing (the board's facing arrow beside it), then the
// spell landing on it, then the target and its arrow turned to the pick,
// then a fade out that resets the loop. Times in ms.
const R_FADE = 250;
const R_HOLD_BEFORE = 700;
const R_HOLD_AFTER = 1000;
const R_PERIOD = R_FADE + R_HOLD_BEFORE + R_HOLD_AFTER + R_FADE;
const R_IMPACT_AT = R_FADE + R_HOLD_BEFORE;
// The spell's bolt pops onto the target at impact: this long to arrive
// (half size to full), then it fades out over the hit effect's life.
const R_POP_MS = 120;
// The facing arrow: the board's own drawing at 3x (it is 3px on a 48px
// tile), riding the hub window's top-right corner.
const R_ARROW_SCALE = 3;
const R_ARROW_X = 19;
const R_ARROW_Y = -19;

/**
 * What a redirect tab shows: the target the spell turns (CharacterSelector
 * picks it — an enemy, or a teammate when the casting step auto-targets its
 * own team), where it faces now, and whether it moves (the arrow's colour).
 */
export interface RedirectTarget {
  sprite: CustomSprite;
  facing?: Direction;
  moving: boolean;
}

const STEP: Record<string, [number, number]> = {
  north: [0, -1], northeast: [1, -1], east: [1, 0], southeast: [1, 1],
  south: [0, 1], southwest: [-1, 1], west: [-1, 0], northwest: [-1, -1],
};

type SpriteData = SpriteReference['spriteData'];

type HubArt =
  | { kind: 'bolt'; sprite: SpriteData; tileMs: number; scale: number; castFlash: SpriteData }
  | { kind: 'strike'; sprite: SpriteData }
  | { kind: 'cast' };

// The engine's "is this melee sprite usable" test (executeMeleeAttack)...
const usable = (ref: SpriteReference | undefined) =>
  !!ref?.spriteData && !!(ref.spriteData.shape || ref.spriteData.idleImageData || ref.spriteData.spriteSheet);
// ...and its stand-in when a melee spell has none.
const DEFAULT_STRIKE = { shape: 'star', primaryColor: '#ffcc00', type: 'simple' };

/**
 * What the board shows when this spell is cast toward the aim — the same
 * choices the engine makes (actions.ts executeSpellInDirection). Null =
 * nothing to preview toward the aim: a redirect's choice turns the TARGET,
 * while the cast itself goes where the spell's own config sends it.
 */
function hubArtFor(spell: SpellAsset): HubArt | null {
  const t = spell.templateType;
  if (t === SpellTemplate.REDIRECT) return null;
  if (t === SpellTemplate.LINEAR || (t === SpellTemplate.AOE && spell.projectileBeforeAOE)) {
    return {
      kind: 'bolt',
      sprite: spell.sprites.projectile?.spriteData,
      tileMs: TURN_INTERVAL_MS / (spell.projectileSpeed || 4),
      scale: spell.projectileScale ?? 1,
      // spawnProjectile plays the cast flash on the caster.
      castFlash: spell.sprites.castEffect?.spriteData,
    };
  }
  if (t === SpellTemplate.MELEE || t === SpellTemplate.MELEE_CONE) {
    // The first tile's part: a stitched long weapon's base, else the strike.
    const begin = spell.sprites.meleeAttackBegin;
    const stitched = t === SpellTemplate.MELEE && (spell.meleeRange || 1) >= 2
      && (usable(begin) || usable(spell.sprites.meleeAttackEnd));
    const strike = stitched && usable(begin) ? begin : spell.sprites.meleeAttack;
    return { kind: 'strike', sprite: usable(strike) ? strike!.spriteData : DEFAULT_STRIKE };
  }
  return { kind: 'cast' };
}

interface HubPreviewProps {
  sprite: CustomSprite;
  /** Spell tabs: the spell being aimed. Unset = the facing tab. */
  spell?: SpellAsset;
  /** The spell's aim; unset = not aimed yet (the hero idles toward `facing`). */
  aim?: Direction;
  /**
   * What the hero idles toward: the facing tab's choice there; on a spell
   * tab, the hero's facing until the spell is aimed. Unset = default art.
   */
  facing?: Direction;
  /**
   * The step's "Face Cast Direction" (faceTargetOnCast): 'keep' = the hero
   * turns to the aim and stays; 'revert' = turns for the cast, back next
   * turn; unset = never turns (it casts in its own facing while the art
   * still goes to the aim). The hub shows exactly that.
   */
  faceOnCast?: 'keep' | 'revert';
  /** REDIRECT tabs: the target the redirect turns (see RedirectTarget). */
  redirectTarget?: RedirectTarget;
}

export const HubPreview: React.FC<HubPreviewProps> = ({ sprite, spell, aim, facing, faceOnCast, redirectTarget }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(ROSE * dpr);
    canvas.height = Math.round(ROSE * dpr);

    const art = aim && spell ? hubArtFor(spell) : null;
    const redirect = spell?.templateType === SpellTemplate.REDIRECT && redirectTarget ? redirectTarget : null;
    // The target starts in its own facing — or, when that already IS the
    // pick, the opposite way, so the turn always shows.
    const redirectFrom = redirect
      ? ((redirect.facing ?? Direction.SOUTH) === aim ? turnAround(aim!) : (redirect.facing ?? Direction.SOUTH))
      : undefined;
    const redirectBolt = spell?.sprites.projectile?.spriteData;
    const redirectHit = spell?.sprites.damageEffect?.spriteData;
    const step = aim ? STEP[aim] : undefined;
    const rotation = aim ? getRotationForDirection(aim) : undefined;
    const flightMs = art?.kind === 'bolt' ? FLIGHT_TILES * art.tileMs * FLIGHT_SLOWMO : 0;
    const period = Math.max(CAST_MS, flightMs, EFFECT_MS) + IDLE_MS;
    // The board's clock (wall time): the sprite-sheet states are shared.
    const origin = Date.now();
    // The hero in physical pixels, like the board's drawSpritePixelPerfect.
    const physC = Math.round(C * dpr);
    const physTile = Math.round(HUB_TILE * dpr);
    const win0 = Math.round((C - WINDOW / 2) * dpr);
    const winSize = Math.round(WINDOW * dpr);

    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (satellitesPaused()) return;
      const now = Date.now();
      // Time into the loop; the cast restarts at the top of each one.
      const t = art ? (now - origin) % period : 0;
      const castStart = now - t;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;

      if (redirect) {
        // THE REDIRECT SCENE — unaimed: the target idles in its own facing.
        const rt = aim ? (now - origin) % R_PERIOD : R_FADE;
        const turned = !!aim && rt >= R_IMPACT_AT;
        const dir = turned ? aim! : redirectFrom!;
        ctx.globalAlpha = !aim ? 1
          : rt < R_FADE ? rt / R_FADE
            : rt >= R_PERIOD - R_FADE ? (R_PERIOD - rt) / R_FADE
              : 1;
        ctx.save();
        ctx.beginPath();
        ctx.rect(win0, win0, winSize, winSize);
        ctx.clip();
        drawSprite(ctx, redirect.sprite, physC, physC, physTile, dir, false, now);
        ctx.restore();
        // The landing: the spell's bolt pops onto the target and fades as
        // its hit effect plays (the board's redirect hit vfx), drawn over
        // the target so the moment reads.
        const sinceImpact = rt - R_IMPACT_AT;
        if (aim && sinceImpact >= 0 && sinceImpact < EFFECT_MS) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          const impactStart = now - sinceImpact;
          if (redirectHit) drawParticleArt(ctx, redirectHit, C, C, impactStart, now, EFFECT_MS, 1, HUB_TILE);
          const pop = Math.min(1, sinceImpact / R_POP_MS);
          const fadeOut = 1 - sinceImpact / EFFECT_MS;
          const sceneAlpha = ctx.globalAlpha;
          ctx.globalAlpha = sceneAlpha * fadeOut;
          drawProjectileArt(ctx, redirectBolt, C, C, now, 0.5 + 0.5 * pop);
          ctx.globalAlpha = sceneAlpha;
        }
        // The board's facing arrow, turning with the target.
        ctx.setTransform(dpr * R_ARROW_SCALE, 0, 0, dpr * R_ARROW_SCALE, (C + R_ARROW_X) * dpr, (C + R_ARROW_Y) * dpr);
        drawFacingArrow(ctx, 0, 0, dir, redirect.moving);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        return;
      }

      // THE SPELL'S ART, in the board's logical units (CSS px here), drawn
      // under the hero as the board draws bolts and particles before entities.
      if (art && step) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (art.kind === 'bolt') {
          if (art.castFlash && t < EFFECT_MS) {
            drawParticleArt(ctx, art.castFlash, C, C, castStart, now, EFFECT_MS, 1, HUB_TILE);
          }
          if (t < flightMs) {
            const dist = t / (art.tileMs * FLIGHT_SLOWMO);
            let scale = art.scale;
            // The board's fizzle: ease-in cubic over the flight's last stretch.
            const left = flightMs - t;
            if (left <= DESPAWN_SHRINK_MS) {
              const p = 1 - left / DESPAWN_SHRINK_MS;
              scale *= 1 - p * p * p;
            }
            if (scale > 0.01) {
              const px = C + step[0] * dist * PITCH;
              const py = C + step[1] * dist * PITCH;
              drawLightGlow(ctx, art.sprite, px, py, HUB_TILE, now, scale);
              drawProjectileArt(ctx, art.sprite, px, py, now, scale, rotation);
            }
            ctx.globalAlpha = 1;
          }
        } else if (art.kind === 'strike' && t < EFFECT_MS) {
          drawParticleArt(ctx, art.sprite, C + step[0] * PITCH, C + step[1] * PITCH, castStart, now, EFFECT_MS, 1, HUB_TILE, undefined, rotation);
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }

      // THE HERO: casting toward the aim for the turn, then idling toward it;
      // otherwise (the facing tab, an unaimed spell, a redirect) idling
      // toward `facing`.
      const casting = !!art && t < CAST_MS;
      ctx.save();
      ctx.beginPath();
      ctx.rect(win0, win0, winSize, winSize);
      ctx.clip();
      // Which way: the step's Face Cast Direction decides (user call
      // 2026-10-15 — a real facing change or none, never cosmetic, so the
      // preview shows the hero turning only when the game will).
      const castDir = faceOnCast ? aim : facing;
      const restDir = faceOnCast === 'keep' ? aim : facing;
      drawSprite(ctx, sprite, physC, physC, physTile, art ? (casting ? castDir : restDir) : facing, false, now, casting, casting ? castStart : undefined);
      ctx.restore();
    };
    frame();
    return () => cancelAnimationFrame(raf);
    // spell?.id, not spell: spell assets are re-parsed from storage on every
    // read, so the object is new on each parent render and would restart the
    // loop. Its content cannot change while the picker is up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprite, spell?.id, aim, facing, faceOnCast, redirectTarget]);

  return <canvas ref={canvasRef} className="dir-rose__fx" aria-hidden="true" />;
};
