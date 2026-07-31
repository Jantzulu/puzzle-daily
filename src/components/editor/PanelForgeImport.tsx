import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '../shared/Toast';
import type { Assembly, KitSpec } from './PanelForge';
import { PanelNineSlice } from './PanelNineSlice';

// ============================================================================
// PANEL FORGE — PHASE 2: SLICE + LIVE PREVIEW
// ============================================================================
// Phase 1 exports a template and a manifest; the artist paints the assembled
// element in place and then... had to hand the sheet to someone else to cut
// up and wire in. That handoff was the whole problem: you painted blind and
// only saw the result minutes later, through another person. Iteration speed
// IS quality in visual work, and a loop that runs through a second party
// cannot get below minutes.
//
// This closes it:
//   1. Point at the painted PNG (the assembled sample, painted over).
//   2. It is sliced HERE, using the kit's own live assembly regions — not the
//      exported manifest. The manifest can drift from the kit after a size
//      edit; the in-memory regions cannot.
//   3. WATCH keeps the file handle and re-reads it when it changes on disk,
//      so saving in Aseprite repaints this page. That is the actual loop:
//      paint, ctrl+S, look, repeat, with nobody in the middle.
//
// SLICING RULE: every piece is cut from its FIRST region (rep === 0). Tiled
// pieces repeat in the assembled sample specifically so the artist can check
// the seam, but only the first period is the source of truth.
//
// PIXEL RULE: everything here renders at INTEGER zoom with smoothing off.
// Panel art has to obey the same law the board obeys, or the two grammars
// fight — which is exactly what made the CSS chrome read as "sterile" beside
// the dungeon. A fractional preview would lie about the result.

interface Props {
  kit: KitSpec;
  assembly: Assembly | null;
}

interface Slice {
  pieceId: string;
  label: string;
  w: number;
  h: number;
  url: string;
  /** True when the cut region is entirely transparent — i.e. unpainted. */
  empty: boolean;
}

/** Minimal shape of the File System Access API bits we use. */
interface FilePickerHandle {
  getFile: () => Promise<File>;
  name: string;
}

const ZOOMS = [1, 2, 3, 4, 6, 8];

export const PanelForgeImport: React.FC<Props> = ({ kit, assembly }) => {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [slices, setSlices] = useState<Slice[]>([]);
  const [zoom, setZoom] = useState(4);
  const [watching, setWatching] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [sizeWarning, setSizeWarning] = useState<string | null>(null);
  // Live-render controls. 361x274 is the real hero panel at a 393px phone —
  // start there so the first thing you see is the size that actually matters.
  const [panelW, setPanelW] = useState(361);
  const [panelH, setPanelH] = useState(274);
  const [showContent, setShowContent] = useState(true);

  const handleRef = useRef<FilePickerHandle | null>(null);
  const lastModifiedRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const supportsFsAccess = typeof window !== 'undefined' && 'showOpenFilePicker' in window;

  // ---- loading -------------------------------------------------------------

  const loadFile = useCallback(
    async (file: File, announce: boolean) => {
      const url = URL.createObjectURL(file);
      try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error('not an image'));
          el.src = url;
        });
        setImg(image);
        setFileName(file.name);
        setLastLoadedAt(Date.now());
        lastModifiedRef.current = file.lastModified;
        if (announce) toast.success(`Loaded ${file.name} (${image.width}×${image.height})`);
      } catch {
        toast.error('That file could not be read as an image.');
      } finally {
        // The <img> has decoded by now; the blob URL is no longer needed.
        URL.revokeObjectURL(url);
      }
    },
    [],
  );

  const pickFile = useCallback(async () => {
    if (supportsFsAccess) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- File System Access API is not in the TS DOM lib here
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{ description: 'Painted sheet', accept: { 'image/png': ['.png'] } }],
          multiple: false,
        });
        handleRef.current = handle as FilePickerHandle;
        await loadFile(await handleRef.current.getFile(), true);
      } catch {
        /* user cancelled */
      }
    } else {
      inputRef.current?.click();
    }
  }, [supportsFsAccess, loadFile]);

  // ---- watch: re-read the handle when the file changes on disk -------------

  useEffect(() => {
    if (!watching || !handleRef.current) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const file = await handleRef.current!.getFile();
        if (!cancelled && file.lastModified !== lastModifiedRef.current) {
          await loadFile(file, false);
        }
      } catch {
        /* handle revoked — the toggle below will surface it on next pick */
      }
    };
    const id = setInterval(tick, 700);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [watching, loadFile]);

  // ---- slicing -------------------------------------------------------------

  const expected = assembly ? `${assembly.width}×${assembly.height}` : null;

  useEffect(() => {
    if (!img || !assembly) {
      setSlices([]);
      setSizeWarning(null);
      return;
    }

    // The painted sheet should be the assembled sample's own size. A mismatch
    // is usually an export at the wrong zoom — say so rather than silently
    // cutting from the wrong coordinates, which would look like bad art.
    if (img.width !== assembly.width || img.height !== assembly.height) {
      const scale = img.width / assembly.width;
      const clean = scale === Math.round(scale) && img.height === assembly.height * scale;
      setSizeWarning(
        clean
          ? `Sheet is ${img.width}×${img.height} — exactly ${scale}× the ${expected} sample. Export at 1× (art pixels), not ${scale}×.`
          : `Sheet is ${img.width}×${img.height} but this kit assembles to ${expected}. Slicing will be misaligned.`,
      );
    } else {
      setSizeWarning(null);
    }

    const scale = img.width / assembly.width;
    const usable = scale > 0 && Number.isFinite(scale) ? scale : 1;
    const next: Slice[] = [];

    for (const piece of kit.pieces) {
      // First region only — later repeats exist so the artist can verify the
      // seam, not to be cut.
      const region = assembly.regions.find(r => r.pieceId === piece.id && r.rep === 0)
        ?? assembly.regions.find(r => r.pieceId === piece.id);
      if (!region) continue;

      const sx = Math.round(region.x * usable);
      const sy = Math.round(region.y * usable);
      const sw = Math.max(1, Math.round(region.w * usable));
      const sh = Math.max(1, Math.round(region.h * usable));

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, region.w);
      canvas.height = Math.max(1, region.h);
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

      // An untouched slot is fully transparent — flag it so a half-painted
      // kit is obvious here instead of as a hole in the game.
      let empty = true;
      try {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 8) { empty = false; break; }
        }
      } catch {
        empty = false; // tainted canvas shouldn't masquerade as unpainted
      }

      next.push({
        pieceId: piece.id,
        label: piece.label,
        w: canvas.width,
        h: canvas.height,
        url: canvas.toDataURL('image/png'),
        empty,
      });
    }

    setSlices(next);
  }, [img, assembly, kit, expected]);

  const paintedCount = useMemo(() => slices.filter(s => !s.empty).length, [slices]);

  // ---- export --------------------------------------------------------------

  const downloadSlices = () => {
    if (!slices.length) return;
    // One JSON carrying every cut piece as a data URL — the shape the renderer
    // will consume, and something you can hand back for wiring without a zip.
    const payload = {
      version: 1,
      kitId: kit.id,
      kitName: kit.name,
      cutAt: new Date().toISOString(),
      pieces: slices.map(s => ({ id: s.pieceId, w: s.w, h: s.h, empty: s.empty, png: s.url })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `panel-forge-${kit.id}-slices.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`Exported ${slices.length} pieces.`);
  };

  // ---- render --------------------------------------------------------------

  return (
    <div className="border border-stone-700 rounded p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-parchment-100">Slice a painted sheet</h3>
        <span className="text-xs text-stone-400">
          Paint the assembled sample in place, then cut it here.
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={pickFile} className="px-3 py-1.5 text-sm rounded border border-stone-600 bg-stone-800 hover:bg-stone-700">
          {fileName ? 'Choose another sheet' : 'Choose painted sheet…'}
        </button>

        {supportsFsAccess && handleRef.current && (
          <label className="flex items-center gap-1.5 text-sm text-stone-300">
            <input
              type="checkbox"
              checked={watching}
              onChange={e => {
                setWatching(e.target.checked);
                if (e.target.checked) toast.success('Watching — save in your art tool and this updates.');
              }}
              className="w-4 h-4"
            />
            Watch file
          </label>
        )}

        {!supportsFsAccess && (
          <span className="text-xs text-stone-500">
            (This browser can&apos;t watch files — re-pick after each save.)
          </span>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/png"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) void loadFile(f, true);
          }}
        />

        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-stone-400">Zoom</span>
          {ZOOMS.map(z => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={`px-2 py-0.5 text-xs rounded border ${
                zoom === z ? 'border-arcane-500 text-arcane-300' : 'border-stone-600 text-stone-400 hover:bg-stone-700'
              }`}
            >
              {z}×
            </button>
          ))}
        </div>
      </div>

      {fileName && (
        <div className="text-xs text-stone-400">
          {fileName}
          {img && ` — ${img.width}×${img.height}`}
          {expected && ` · kit assembles to ${expected}`}
          {lastLoadedAt && ` · reloaded ${new Date(lastLoadedAt).toLocaleTimeString()}`}
          {slices.length > 0 && ` · ${paintedCount}/${slices.length} pieces painted`}
        </div>
      )}

      {sizeWarning && (
        <div className="text-xs px-2 py-1.5 rounded border border-amber-700/60 bg-amber-900/25 text-amber-200">
          {sizeWarning}
        </div>
      )}

      {slices.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            {slices.map(s => (
              <div
                key={s.pieceId}
                className={`border rounded p-1 flex flex-col items-center gap-1 ${
                  s.empty ? 'border-stone-700 opacity-50' : 'border-stone-600'
                }`}
                title={`${s.label} — ${s.w}×${s.h}${s.empty ? ' (unpainted)' : ''}`}
              >
                <div
                  className="bg-[repeating-conic-gradient(#2a2a2a_0%_25%,#1c1c1c_0%_50%)] bg-[length:8px_8px]"
                  style={{ width: s.w * zoom, height: s.h * zoom }}
                >
                  <img
                    src={s.url}
                    alt={s.label}
                    width={s.w * zoom}
                    height={s.h * zoom}
                    style={{ imageRendering: 'pixelated', display: 'block' }}
                  />
                </div>
                <span className="text-[10px] text-stone-400 max-w-[90px] truncate">{s.label}</span>
              </div>
            ))}
          </div>

          {/* THE RIGHT-HAND SIDE OF THE LOOP. The strip above shows the pieces
              you cut; this shows the PANEL they make. Only this can tell you
              whether the seams work, because a nine-slice is honest only at
              sizes other than the sample's own. */}
          <div className="border-t border-stone-700 pt-3 space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h4 className="text-sm font-semibold text-parchment-100">Live panel</h4>
              <label className="flex items-center gap-1.5 text-xs text-stone-300">
                <input
                  type="checkbox"
                  checked={showContent}
                  onChange={e => setShowContent(e.target.checked)}
                  className="w-3.5 h-3.5"
                />
                Sample text
              </label>
              <button
                onClick={() => { setPanelW(361); setPanelH(274); }}
                className="px-2 py-0.5 text-xs rounded border border-stone-600 text-stone-300 hover:bg-stone-700"
                title="The real hero panel on a 393px phone"
              >
                Hero panel @393
              </button>
            </div>

            <div className="flex items-center gap-3 flex-wrap text-xs text-stone-400">
              <label className="flex items-center gap-2">
                W
                <input
                  type="range" min={64} max={720} value={panelW}
                  onChange={e => setPanelW(Number(e.target.value))}
                  className="w-40"
                />
                <span className="w-10 tabular-nums">{panelW}</span>
              </label>
              <label className="flex items-center gap-2">
                H
                <input
                  type="range" min={48} max={520} value={panelH}
                  onChange={e => setPanelH(Number(e.target.value))}
                  className="w-40"
                />
                <span className="w-10 tabular-nums">{panelH}</span>
              </label>
              <span className="text-stone-500">drag to an awkward size — that is where seams fail</span>
            </div>

            <PanelNineSlice
              pieces={slices}
              zoom={zoom}
              width={panelW}
              height={panelH}
              showContent={showContent}
              ground="#040403"
            />
          </div>

          <button
            onClick={downloadSlices}
            className="px-3 py-1.5 text-sm rounded border border-stone-600 bg-stone-800 hover:bg-stone-700"
          >
            Export cut pieces (JSON)
          </button>
        </>
      )}
    </div>
  );
};

export default PanelForgeImport;
