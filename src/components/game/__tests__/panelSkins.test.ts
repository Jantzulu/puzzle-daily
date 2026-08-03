import { describe, it, expect } from 'vitest';
import { buildSkin, skinFromSlices, nomW, nomH } from '../panelSkins';

// The forge's live preview (PortcullisLive) feeds freshly-cut slices into
// the game's own draw routines through this adapter — it must behave
// exactly like the committed-JSON path (same validation, same halo rules).

const px = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('skinFromSlices (forge live-preview adapter)', () => {
  it('maps forge slices onto the skin shape, dropping empties and keeping halos', () => {
    const skin = skinFromSlices('control-rail', [
      { pieceId: 'rail-face', w: 24, h: 22, url: px },
      { pieceId: 'rail-spike', w: 24, h: 8, url: px, halo: { l: 8, t: 0, r: 8, b: 0 } },
      { pieceId: 'forge-plate', w: 4, h: 4, url: px, empty: true },
    ]);
    expect(skin.has('rail-face')).toBe(true);
    expect(skin.has('forge-plate')).toBe(false);
    const spike = skin.get('rail-spike');
    expect(spike).toBeDefined();
    expect(nomW(spike!)).toBe(8);
    expect(nomH(spike!)).toBe(8);
  });

  it('buildSkin rejects a foreign kitId wholesale (the committed-path guard; the adapter stamps its own kit id so it cannot mismatch)', () => {
    const foreign = { version: 1, kitId: 'quest-box', pieces: [{ id: 'rail-face', w: 24, h: 22, empty: false, png: px }] };
    expect(buildSkin(foreign, 'control-rail').size).toBe(0);
  });

  it('drops malformed pieces without poisoning the rest', () => {
    const skin = skinFromSlices('control-rail', [
      { pieceId: 'rail-face', w: 24, h: 22, url: px },
      { pieceId: 'rail-spike', w: Number.NaN, h: 8, url: px },
      { pieceId: 'rail-cap-l', w: 8, h: 22, url: 'not-a-data-url' },
    ]);
    expect([...skin.keys()]).toEqual(['rail-face']);
  });
});
