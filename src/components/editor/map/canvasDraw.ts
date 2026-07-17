// Canvas drawing helpers for the map editor's edit-mode canvas.
// Extracted verbatim from MapEditor.tsx (Phase 1 decomposition, 2026-07-14).
// These render the static editor view — the live game board has its own
// renderer in AnimatedGameBoard.
import type { TileOrNull, PuzzleSkin } from '../../../types/game';
import { TileType } from '../../../types/game';
import { getEnemy } from '../../../data/enemies';
import { drawSprite, getSpriteDrawHeight, ART_TILE_PX } from '../SpriteEditor';
import { loadTileType, loadObject, loadCollectible, resolveImageSource } from '../../../utils/assetStorage';
import type { CustomTileType } from '../../../utils/assetStorage';
import { loadImage } from '../../../utils/imageLoader';

export const TILE_SIZE = 48;
export const BORDER_SIZE = 48; // Border thickness for top/bottom
export const SIDE_BORDER_SIZE = 16; // Thinner side borders to match pixel art style
// Side hallway corridors match the top/bottom band's depth. The width
// beyond the 16px side band is drawable OVERHANG on the canvas, excluded
// from the editor's scale math so the board renders the same size whether
// or not hallways exist (mirrors the game board's rule).
export const SIDE_HALLWAY_DEPTH = BORDER_SIZE;
export const MAX_DISPLAY_WIDTH_TILES = 15; // Max tiles before scaling down

export function createEmptyGrid(width: number, height: number): TileOrNull[][] {
  const grid: TileOrNull[][] = [];
  for (let y = 0; y < height; y++) {
    const row: TileOrNull[] = [];
    for (let x = 0; x < width; x++) {
      row.push({ x, y, type: TileType.EMPTY });
    }
    grid.push(row);
  }
  return grid;
}

// Use centralized image loader with load notifications
// Alias for backward compatibility with existing code
const loadSkinImage = loadImage;

export function drawDungeonBorder(ctx: CanvasRenderingContext2D, gridWidth: number, gridHeight: number, skin?: PuzzleSkin | null) {
  const gridPixelWidth = gridWidth * TILE_SIZE;
  const gridPixelHeight = gridHeight * TILE_SIZE;
  const totalWidth = gridPixelWidth + (SIDE_BORDER_SIZE * 2);
  const totalHeight = gridPixelHeight + (BORDER_SIZE * 2);

  ctx.save();

  // Background behind border (dark void)
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // Check if skin has custom border sprites
  const hasCustomBorders = skin && Object.keys(skin.borderSprites).length > 0;

  if (hasCustomBorders && skin) {
    // Draw custom border sprites
    const sprites = skin.borderSprites;
    const wallFrontImg = loadSkinImage(sprites.wallFront || '');
    const wallSideImg = loadSkinImage(sprites.wallSide || '');
    const wallBottomOuterImg = loadSkinImage(sprites.wallBottomOuter || sprites.wallFront || '');
    const cornerTLImg = loadSkinImage(sprites.cornerTopLeft || '');
    const cornerTRImg = loadSkinImage(sprites.cornerTopRight || '');
    const cornerBLImg = loadSkinImage(sprites.cornerBottomLeft || '');
    const cornerBRImg = loadSkinImage(sprites.cornerBottomRight || '');

    // Top wall
    if (wallFrontImg?.complete) {
      for (let x = SIDE_BORDER_SIZE; x < SIDE_BORDER_SIZE + gridPixelWidth; x += TILE_SIZE) {
        ctx.drawImage(wallFrontImg, x, 0, TILE_SIZE, BORDER_SIZE);
      }
    }

    // Bottom wall
    if (wallBottomOuterImg?.complete) {
      for (let x = SIDE_BORDER_SIZE; x < SIDE_BORDER_SIZE + gridPixelWidth; x += TILE_SIZE) {
        ctx.drawImage(wallBottomOuterImg, x, BORDER_SIZE + gridPixelHeight, TILE_SIZE, BORDER_SIZE);
      }
    }

    // Left wall
    if (wallSideImg?.complete) {
      for (let y = BORDER_SIZE; y < BORDER_SIZE + gridPixelHeight; y += TILE_SIZE) {
        ctx.drawImage(wallSideImg, 0, y, SIDE_BORDER_SIZE, TILE_SIZE);
      }
    }

    // Right wall (mirrored)
    if (wallSideImg?.complete) {
      for (let y = BORDER_SIZE; y < BORDER_SIZE + gridPixelHeight; y += TILE_SIZE) {
        ctx.save();
        ctx.translate(SIDE_BORDER_SIZE + gridPixelWidth + SIDE_BORDER_SIZE, y);
        ctx.scale(-1, 1);
        ctx.drawImage(wallSideImg, 0, 0, SIDE_BORDER_SIZE, TILE_SIZE);
        ctx.restore();
      }
    }

    // Corners
    if (cornerTLImg?.complete) ctx.drawImage(cornerTLImg, 0, 0, SIDE_BORDER_SIZE, BORDER_SIZE);
    if (cornerTRImg?.complete) ctx.drawImage(cornerTRImg, SIDE_BORDER_SIZE + gridPixelWidth, 0, SIDE_BORDER_SIZE, BORDER_SIZE);
    if (cornerBLImg?.complete) ctx.drawImage(cornerBLImg, 0, BORDER_SIZE + gridPixelHeight, SIDE_BORDER_SIZE, BORDER_SIZE);
    if (cornerBRImg?.complete) ctx.drawImage(cornerBRImg, SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE + gridPixelHeight, SIDE_BORDER_SIZE, BORDER_SIZE);
  } else {
    // Default dungeon style rendering
    // Top wall (front-facing with depth)
    ctx.fillStyle = '#3a3a4a'; // Stone color
    ctx.fillRect(0, 0, totalWidth, BORDER_SIZE);

    // Add stone texture/depth to top wall
    ctx.fillStyle = '#2a2a3a'; // Shadow
    for (let x = 0; x < totalWidth; x += TILE_SIZE) {
      ctx.fillRect(x, BORDER_SIZE - 12, TILE_SIZE - 2, 12);
    }

    // Top wall highlight
    ctx.fillStyle = '#4a4a5a';
    for (let x = 0; x < totalWidth; x += TILE_SIZE) {
      ctx.fillRect(x, 0, TILE_SIZE - 2, 8);
    }

    // Bottom wall (simpler, just top edge visible)
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(0, BORDER_SIZE + gridPixelHeight, totalWidth, BORDER_SIZE);

    // Bottom wall top edge
    ctx.fillStyle = '#3a3a4a';
    ctx.fillRect(0, BORDER_SIZE + gridPixelHeight, totalWidth, 8);

    // Left wall (side view - THINNER)
    ctx.fillStyle = '#323242';
    ctx.fillRect(0, BORDER_SIZE, SIDE_BORDER_SIZE, gridPixelHeight);

    // Left wall inner edge
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(SIDE_BORDER_SIZE - 6, BORDER_SIZE, 6, gridPixelHeight);

    // Right wall (side view - THINNER)
    ctx.fillStyle = '#323242';
    ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE, SIDE_BORDER_SIZE, gridPixelHeight);

    // Right wall inner edge
    ctx.fillStyle = '#3a3a4a';
    ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE, 6, gridPixelHeight);

    // Corners (darker, showing depth)
    ctx.fillStyle = '#1a1a2a';
    // Top-left
    ctx.fillRect(0, 0, SIDE_BORDER_SIZE, BORDER_SIZE);
    // Top-right
    ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, 0, SIDE_BORDER_SIZE, BORDER_SIZE);
    // Bottom-left
    ctx.fillRect(0, BORDER_SIZE + gridPixelHeight, SIDE_BORDER_SIZE, BORDER_SIZE);
    // Bottom-right
    ctx.fillRect(SIDE_BORDER_SIZE + gridPixelWidth, BORDER_SIZE + gridPixelHeight, SIDE_BORDER_SIZE, BORDER_SIZE);
  }

  ctx.restore();
}

export function drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, tile: TileOrNull, skin?: PuzzleSkin | null) {
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;

  if (!tile) {
    // Void tile
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    ctx.strokeStyle = '#151515';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + TILE_SIZE, py + TILE_SIZE);
    ctx.moveTo(px + TILE_SIZE, py);
    ctx.lineTo(px, py + TILE_SIZE);
    ctx.stroke();
    return;
  }

  // Check for custom tile type
  let customTileType: CustomTileType | null = null;
  if (tile.customTileTypeId) {
    customTileType = loadTileType(tile.customTileTypeId);
  }

  // Determine base tile color for transparency support
  const isWall = tile.type === TileType.WALL;
  const baseColor = isWall ? '#4a4a4a' : '#2a2a2a';

  // Priority 1: Check for skin-specific custom tile sprite
  const customTileSprites = skin?.customTileSprites;
  if (tile.customTileTypeId && customTileSprites?.[tile.customTileTypeId]) {
    const skinSpriteEntry = customTileSprites[tile.customTileTypeId];
    let spriteData: string | undefined;
    if (typeof skinSpriteEntry === 'string') {
      spriteData = skinSpriteEntry;
    } else {
      // In editor, default to "on" state sprite
      spriteData = skinSpriteEntry.onSprite || skinSpriteEntry.offSprite;
    }

    if (spriteData) {
      const customImg = loadSkinImage(spriteData);
      if (customImg?.complete) {
        ctx.fillStyle = baseColor;
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        ctx.drawImage(customImg, px, py, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
        if (customTileType) {
          drawTileBehaviorIndicators(ctx, px, py, customTileType, tile);
        }
        return;
      }
    }
  }

  // Priority 2: Draw tile type's default custom sprite if available (supports both data URLs and HTTP URLs)
  const tileTypeSpriteSource = resolveImageSource(customTileType?.customSprite?.idleImageData, customTileType?.customSprite?.idleImageUrl);
  if (tileTypeSpriteSource) {
    const customImg = loadSkinImage(tileTypeSpriteSource);
    if (customImg?.complete) {
      // Draw base color first for transparency support
      ctx.fillStyle = baseColor;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.drawImage(customImg, px, py, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
      if (customTileType) {
        drawTileBehaviorIndicators(ctx, px, py, customTileType, tile);
      }
      return;
    }
  }

  // Second: Use skin tile sprites if available
  const tileSprites = skin?.tileSprites;
  const spriteKey = isWall ? 'wall' : 'empty';
  const spriteUrl = tileSprites?.[spriteKey];

  if (spriteUrl) {
    const tileImg = loadSkinImage(spriteUrl);
    if (tileImg?.complete) {
      // Draw base color first for transparency support
      ctx.fillStyle = baseColor;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.drawImage(tileImg, px, py, TILE_SIZE, TILE_SIZE);
    } else {
      // Fallback while image loads
      ctx.fillStyle = baseColor;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    }
  } else {
    // Default colors
    ctx.fillStyle = baseColor;
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  }

  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

  // Draw behavior indicators if this is a custom tile
  if (customTileType) {
    drawTileBehaviorIndicators(ctx, px, py, customTileType, tile);
  }
}

/**
 * Draw visual indicators for tile behaviors in the map editor
 */
function drawTileBehaviorIndicators(ctx: CanvasRenderingContext2D, px: number, py: number, tileType: CustomTileType, tile: TileOrNull) {
  const centerX = px + TILE_SIZE / 2;
  const centerY = py + TILE_SIZE / 2;

  for (const behavior of tileType.behaviors) {
    switch (behavior.type) {
      case 'damage':
        // Red tint overlay
        ctx.fillStyle = 'rgba(255, 0, 0, 0.25)';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        // Fire icon
        ctx.font = '16px Arial';
        ctx.fillStyle = 'rgba(255, 100, 0, 0.9)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔥', centerX, centerY);
        break;

      case 'teleport': {
        // Purple glow
        ctx.fillStyle = 'rgba(128, 0, 255, 0.25)';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        // Show teleport group letter
        const groupId = tile?.teleportGroupId || behavior.teleportGroupId || 'A';
        ctx.font = 'bold 20px Arial';
        ctx.fillStyle = 'rgba(200, 100, 255, 1)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(groupId, centerX, centerY);
        break;
      }

      case 'direction_change': {
        // Arrow showing forced direction
        ctx.fillStyle = 'rgba(0, 200, 255, 0.25)';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        const arrow = getDirectionArrow(behavior.newFacing);
        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = 'rgba(0, 200, 255, 1)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(arrow, centerX, centerY);
        break;
      }

      case 'ice':
        // Blue tint with diagonal lines
        ctx.fillStyle = 'rgba(100, 200, 255, 0.3)';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        // Draw diagonal lines pattern
        ctx.save();
        ctx.beginPath();
        ctx.rect(px, py, TILE_SIZE, TILE_SIZE);
        ctx.clip();
        ctx.strokeStyle = 'rgba(150, 220, 255, 0.6)';
        ctx.lineWidth = 1;
        for (let i = -TILE_SIZE; i < TILE_SIZE * 2; i += 8) {
          ctx.beginPath();
          ctx.moveTo(px + i, py);
          ctx.lineTo(px + i + TILE_SIZE, py + TILE_SIZE);
          ctx.stroke();
        }
        ctx.restore();
        break;

      case 'pressure_plate':
        // Button-like appearance
        ctx.fillStyle = 'rgba(100, 100, 100, 0.4)';
        ctx.fillRect(px + 8, py + 8, TILE_SIZE - 16, TILE_SIZE - 16);
        ctx.strokeStyle = 'rgba(60, 60, 60, 0.9)';
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 8, py + 8, TILE_SIZE - 16, TILE_SIZE - 16);
        break;
    }
  }
}

/**
 * Get arrow character for direction
 */
function getDirectionArrow(direction?: string): string {
  switch (direction) {
    case 'north': return '↑';
    case 'northeast': return '↗';
    case 'east': return '→';
    case 'southeast': return '↘';
    case 'south': return '↓';
    case 'southwest': return '↙';
    case 'west': return '←';
    case 'northwest': return '↖';
    default: return '→';
  }
}

export function drawEnemy(ctx: CanvasRenderingContext2D, x: number, y: number, enemyId?: string) {
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;

  // Try to get enemy data and draw custom sprite if available
  if (enemyId) {
    const enemyData = getEnemy(enemyId);
    if (enemyData && 'customSprite' in enemyData && enemyData.customSprite) {
      drawSprite(ctx, enemyData.customSprite, px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE);
      return;
    }
  }

  // Fallback to red circle if no custom sprite
  ctx.fillStyle = '#f44336';
  ctx.beginPath();
  ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE / 3, 0, Math.PI * 2);
  ctx.fill();
}

export function drawCollectibleInEditor(
  ctx: CanvasRenderingContext2D,
  collectible: { x: number; y: number; collectibleId?: string; type?: 'coin' | 'gem' }
) {
  const { x, y, collectibleId, type } = collectible;
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;

  // Try to load custom collectible data
  const collectibleData = collectibleId ? loadCollectible(collectibleId) : null;

  // If we have custom collectible data with a sprite, draw it
  if (collectibleData?.customSprite) {
    // Calculate center position based on anchor point
    const centerX = px + TILE_SIZE / 2;
    let centerY = py + TILE_SIZE / 2;

    if (collectibleData.anchorPoint === 'bottom_center') {
      const spriteHeight = getSpriteDrawHeight(collectibleData.customSprite, TILE_SIZE);
      centerY = py + TILE_SIZE / 2 - spriteHeight / 2;
    }

    // Draw the sprite (without animation/imageCache for editor simplicity)
    drawSprite(ctx, collectibleData.customSprite, centerX, centerY, TILE_SIZE);
    return;
  }

  // Legacy fallback: draw based on type
  if (type === 'gem') {
    ctx.fillStyle = '#9c27b0';
    ctx.beginPath();
    const cx = px + TILE_SIZE / 2;
    const cy = py + TILE_SIZE / 2;
    const size = TILE_SIZE / 3;
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx + size, cy);
    ctx.lineTo(cx, cy + size);
    ctx.lineTo(cx - size, cy);
    ctx.closePath();
    ctx.fill();
    return;
  }

  // Default: draw a star shape (original behavior for coins and unknown types)
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  const cx = px + TILE_SIZE / 2;
  const cy = py + TILE_SIZE / 2;
  const spikes = 5;
  const outerRadius = TILE_SIZE / 4;
  const innerRadius = TILE_SIZE / 8;

  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (i * Math.PI) / spikes - Math.PI / 2;
    const sx = cx + Math.cos(angle) * radius;
    const sy = cy + Math.sin(angle) * radius;

    if (i === 0) {
      ctx.moveTo(sx, sy);
    } else {
      ctx.lineTo(sx, sy);
    }
  }

  ctx.closePath();
  ctx.fill();
}

export function drawObject(ctx: CanvasRenderingContext2D, x: number, y: number, objectId: string) {
  const objectData = loadObject(objectId);
  if (!objectData) return;

  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;

  // Offsets are whole art pixels (native-size rule); legacy tile-fraction
  // offsets and the old scale knob are migrated away in assetStorage.
  const zoom = TILE_SIZE / ART_TILE_PX;
  const offsetX = (objectData.offsetX ?? 0) * zoom;
  const offsetY = (objectData.offsetY ?? 0) * zoom;

  // Calculate center position based on anchor point, then apply offsets.
  let centerX = px + TILE_SIZE / 2;
  let centerY = py + TILE_SIZE / 2;

  if (objectData.anchorPoint === 'bottom_center' && objectData.customSprite) {
    // For bottom_center: sprite's bottom edge aligns with tile's center
    // So sprite center is offset upward by half the sprite height
    const spriteHeight = getSpriteDrawHeight(objectData.customSprite, TILE_SIZE);
    centerY = py + TILE_SIZE / 2 - spriteHeight / 2;
  }

  centerX += offsetX;
  centerY += offsetY;

  // Draw custom sprite if available
  if (objectData.customSprite) {
    // Use drawSprite which handles images, spritesheets, and shape fallbacks
    drawSprite(ctx, objectData.customSprite, centerX, centerY, TILE_SIZE);
  } else {
    // Fallback: draw a simple brown square (centered, with offsets applied)
    const fallback = TILE_SIZE / 2;
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(centerX - fallback / 2, centerY - fallback / 2, fallback, fallback);
  }
}
