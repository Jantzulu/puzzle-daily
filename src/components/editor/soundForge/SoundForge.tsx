import React from 'react';
import { toast } from '../../shared/Toast';
import type { SoundAsset } from '../../../types/game';
import { deleteSoundAsset, getSoundAssets, saveSoundAsset } from '../../../utils/assetStorage';
import { newAssetId } from '../../../utils/assetIds';
import { chromeSoundAssetId } from '../../../utils/chromeSounds';
import { clearSoundCache } from '../../../utils/gameSounds';
import { soundManager } from '../../../utils/soundManager';
import { BUILT_IN_SOUNDS } from '../../../utils/synth/builtIn';
import { soundLength, type SynthLayer, type SynthSound } from '../../../utils/synth/types';
import { ForgeChip, ForgeSection, ForgeSlider } from './ForgeControls';
import { ForgeTimeline, LoudnessMeter } from './ForgeTimeline';
import { LayerPanel } from './LayerPanel';
import { LAYER_STARTERS, SOUND_STARTERS, TIPS, cloneSound, layerFromStarter, newLayerId, nudgeLayer } from './forgeModel';
import { builtInKey, forgeReducer, initialForgeState, isUnsaved, keyAssetId, keyBuiltInId, mineKey, savedFor, type SoundKey } from './forgeState';
import { auditionSound, pictureSound, type SoundPicture } from './soundPreview';

// ============================================================================
// SOUND FORGE (user ask 2026-11-15): make the game's sounds by hand.
// ============================================================================
// Every sound here is a recipe, not an audio file (utils/synth): a stack of
// layers, each a little noise or a tone shaped by a few numbers. The Forge
// edits those numbers and plays the result at once, so the ear is in charge.
//
// Built for someone new to sound but serious about learning it (the user's
// brief: friendly, "not a dumbed down version"): plain names with the
// trade's word beside them, a line on what each group does, a picture of the
// sound, a loudness meter against a sound already approved by ear, starting
// points for layers and sounds, and "it sounds like..." advice that is the
// record of how the first six sounds were tuned.
//
// WHERE SOUNDS LIVE
//   Page sounds   the six built-ins (utils/synth/builtIn.ts) ship with the
//                 game. Saving an edit keeps a copy on this device, which
//                 the game here plays at once (chromeSounds.ts); players
//                 get it when builtIn.ts is updated ("Copy recipe").
//   My sounds     ordinary sound assets with a recipe (SoundAsset.synth):
//                 they sync, back up and publish like any other sound, and
//                 every sound slot in the game can use them.

const PICTURE_COLUMNS = 480;

const isRecipe = (value: unknown): value is SynthSound => {
  const v = value as SynthSound | null;
  return !!v && typeof v === 'object' && typeof v.level === 'number' && Array.isArray(v.layers)
    && v.layers.every(l => l && typeof l.id === 'string' && (l.source === 'noise' || l.source === 'tone') && typeof l.length === 'number');
};

export const SoundForge: React.FC = () => {
  const [library, setLibrary] = React.useState<SoundAsset[]>(() => getSoundAssets());
  const [state, dispatch] = React.useReducer(forgeReducer, library, initialForgeState);
  const [selectedKey, setSelectedKey] = React.useState<SoundKey>(() => builtInKey('torch-out'));
  const [selectedLayerId, setSelectedLayerId] = React.useState<string | null>(null);
  const [autoPlay, setAutoPlay] = React.useState(true);
  const [picture, setPicture] = React.useState<SoundPicture | null>(null);
  const [soundOff, setSoundOff] = React.useState(() => !soundManager.getSettings().enabled);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [pasteText, setPasteText] = React.useState<string | null>(null);

  const builtInId = keyBuiltInId(selectedKey);
  const builtIn = builtInId ? BUILT_IN_SOUNDS.find(b => b.id === builtInId) ?? null : null;
  const saved = savedFor(selectedKey, library);
  const work = state.work[selectedKey];
  const sound = work?.sound ?? saved?.sound ?? null;
  const name = work?.name ?? saved?.name ?? '';
  const unsaved = isUnsaved(work, saved, !!builtIn);
  const layer = sound?.layers.find(l => l.id === selectedLayerId) ?? sound?.layers[0] ?? null;

  // ---- hearing and seeing ---------------------------------------------------
  const play = (which: SynthSound | null, solo?: string) => {
    if (!which) return;
    setSoundOff(!soundManager.getSettings().enabled);
    auditionSound(which, solo ? { solo } : {});
  };

  // Play shortly after each change, so a dragged slider is heard as it moves.
  React.useEffect(() => {
    if (!autoPlay || state.tick === 0 || !sound) return;
    const id = window.setTimeout(() => auditionSound(sound), 180);
    return () => window.clearTimeout(id);
  }, [autoPlay, state.tick, sound]);

  // Redraw the picture and re-measure after each change.
  React.useEffect(() => {
    if (!sound) return;
    let stale = false;
    void pictureSound(sound, PICTURE_COLUMNS).then(p => { if (!stale) setPicture(p); }).catch(() => { /* no picture this time */ });
    return () => { stale = true; };
  }, [sound]);

  // ---- editing --------------------------------------------------------------
  const edit = (next: SynthSound, tag: string) =>
    dispatch({ type: 'edit', key: selectedKey, sound: next, tag, time: performance.now() });
  const editLayer = (next: SynthLayer, tag: string) => {
    if (!sound) return;
    edit({ ...sound, layers: sound.layers.map(l => (l.id === next.id ? next : l)) }, `${next.id}:${tag}`);
  };
  const once = (tag: string) => `${tag}:${performance.now()}`; // never merged with the edit before it

  const select = (key: SoundKey) => {
    const open = state.work[key];
    const target = open ? null : savedFor(key, library);
    if (!open && !target) return; // nothing by that name any more
    dispatch({ type: 'open', key, name: target?.name ?? open.name, sound: target?.sound ?? open.sound });
    setSelectedKey(key);
    setSelectedLayerId(null);
    setConfirmDelete(false);
  };

  const startNew = (label: string, fresh: SynthSound) => {
    const key = mineKey(newAssetId('sound'));
    dispatch({ type: 'open', key, name: label, sound: fresh });
    setSelectedKey(key);
    setSelectedLayerId(null);
    setConfirmDelete(false);
  };

  // Undo and redo from the keyboard (not while typing in a box, which has
  // its own).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); dispatch({ type: 'undo', key: selectedKey }); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); dispatch({ type: 'redo', key: selectedKey }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedKey]);

  // ---- saving ---------------------------------------------------------------
  const refresh = () => {
    clearSoundCache(); // the game's sound slots pick the new version up
    setLibrary(getSoundAssets());
  };

  const save = () => {
    if (!sound) return;
    const id = builtIn ? chromeSoundAssetId(builtIn.id) : keyAssetId(selectedKey)!;
    const existing = library.find(a => a.id === id);
    const ok = saveSoundAsset({
      ...existing,
      id,
      name: builtIn ? `Page sound: ${builtIn.name}` : (name.trim() || 'Untitled sound'),
      description: builtIn
        ? 'An edited copy of a built-in page sound, made in the Sound Forge. On this device it plays in place of the shipped one.'
        : existing?.description,
      synth: sound,
      duration: soundLength(sound),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });
    if (!ok) {
      toast.error('Could not save: storage is full');
      return;
    }
    refresh();
    toast.success(builtIn ? `Saved. "${builtIn.name}" now plays this way on this device.` : `Saved "${name.trim() || 'Untitled sound'}"`);
  };

  const revert = () => {
    if (saved) edit(cloneSound(saved.sound), once('revert'));
  };

  const resetToShipped = () => {
    if (!builtIn) return;
    deleteSoundAsset(chromeSoundAssetId(builtIn.id));
    refresh();
    edit(cloneSound(builtIn.sound), once('reset'));
    toast.success(`"${builtIn.name}" is back to the shipped version`);
  };

  const remove = () => {
    const id = keyAssetId(selectedKey);
    if (!id) return;
    if (library.some(a => a.id === id)) deleteSoundAsset(id);
    dispatch({ type: 'drop', key: selectedKey });
    refresh();
    select(builtInKey('torch-out'));
  };

  const copyRecipe = async () => {
    if (!sound) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify({ name, builtIn: builtIn?.id, sound }, null, 2));
      toast.success('Recipe copied');
    } catch {
      toast.error('Could not copy to the clipboard');
    }
  };

  const loadPasted = () => {
    try {
      const parsed = JSON.parse(pasteText ?? '') as { sound?: unknown };
      const recipe = isRecipe(parsed.sound) ? parsed.sound : isRecipe(parsed) ? parsed : null;
      if (!recipe) throw new Error('not a recipe');
      edit({ ...cloneSound(recipe), version: 1 }, once('paste'));
      setPasteText(null);
      toast.success('Recipe loaded. Undo brings the old one back.');
    } catch {
      toast.error('That is not a sound recipe');
    }
  };

  // ---- the lists ---------------------------------------------------------------
  const mine = library.filter(a => a.synth && !a.id.startsWith('chrome_'));
  const unsavedNew = Object.keys(state.work).filter(k => keyAssetId(k) && !library.some(a => a.id === keyAssetId(k)));
  const row = (key: SoundKey, label: string, chip?: string) => {
    const dirty = isUnsaved(state.work[key], savedFor(key, library), !!keyBuiltInId(key));
    return (
      <button
        key={key}
        type="button"
        onClick={() => select(key)}
        className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-sm border-t border-stone-700/60 first:border-t-0 ${
          key === selectedKey ? 'bg-stone-700 text-parchment-100' : 'text-stone-300 hover:bg-stone-800/50'
        }`}
      >
        <span className="flex-1 min-w-0 truncate">{label}</span>
        {chip && <span className="px-1.5 rounded border text-[10px] bg-copper-900/40 text-copper-300 border-copper-700/50">{chip}</span>}
        {dirty && <span className="w-1.5 h-1.5 rounded-full bg-arcane-400" title="Unsaved changes" />}
      </button>
    );
  };

  if (!sound) {
    return <div className="p-4 text-sm text-stone-400">That sound is gone. Pick another from the list.</div>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3 md:p-4 max-w-6xl mx-auto grid gap-4 md:grid-cols-[230px_minmax(0,1fr)] items-start">
        {/* ---- the library ---- */}
        <div className="space-y-3">
          <div className="border border-stone-700 rounded overflow-hidden">
            <div className="px-2 py-1.5 bg-stone-800 text-xs uppercase text-stone-400">Page sounds</div>
            {BUILT_IN_SOUNDS.map(b => row(builtInKey(b.id), b.name, savedFor(builtInKey(b.id), library)?.edited ? 'edited' : undefined))}
          </div>
          <div className="border border-stone-700 rounded overflow-hidden">
            <div className="px-2 py-1.5 bg-stone-800 text-xs uppercase text-stone-400">My sounds</div>
            {mine.length + unsavedNew.length === 0 && <div className="px-2 py-2 text-xs text-stone-500">None yet. Start one below.</div>}
            {mine.map(a => row(mineKey(a.id), state.work[mineKey(a.id)]?.name ?? a.name))}
            {unsavedNew.map(k => row(k, state.work[k].name, 'new'))}
          </div>
          <div className="border border-stone-700 rounded">
            <div className="px-2 py-1.5 bg-stone-800 text-xs uppercase text-stone-400">New sound from</div>
            <div className="p-2 flex flex-wrap gap-1.5">
              {SOUND_STARTERS.map(s => (
                <ForgeChip key={s.id} onClick={() => startNew(s.label, s.make())} title={s.hint}>{s.label}</ForgeChip>
              ))}
              <ForgeChip onClick={() => startNew(`${name} copy`, cloneSound(sound))} title="A copy of the sound you are looking at">Copy of this</ForgeChip>
            </div>
            <div className="px-2 pb-2 text-[11px] text-stone-500">Rough sketches to start from, not finished sounds.</div>
          </div>
        </div>

        {/* ---- the sound ---- */}
        <div className="space-y-3 min-w-0">
          {soundOff && (
            <div className="px-3 py-2 rounded border border-copper-700/50 bg-copper-900/30 text-copper-300 text-sm">
              Sound is switched off, so nothing here will be heard. Turn it on with the speaker button in the menu.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {builtIn ? (
              <div className="text-base text-parchment-100 font-medium">{builtIn.name}</div>
            ) : (
              <input
                type="text"
                value={name}
                onChange={e => dispatch({ type: 'rename', key: selectedKey, name: e.target.value })}
                aria-label="Sound name"
                className="bg-stone-900 border border-stone-700 rounded px-2 py-1 text-sm text-parchment-100 w-56"
              />
            )}
            <ForgeChip tone="go" onClick={() => play(sound)} title="Play the sound as it is now">▶ Play</ForgeChip>
            {unsaved && saved && <ForgeChip onClick={() => play(saved.sound)} title="Play the saved version, to compare">▶ Saved</ForgeChip>}
            <ForgeChip active={autoPlay} onClick={() => setAutoPlay(a => !a)} title="Play after every change">Play as I change</ForgeChip>
            <span className="flex gap-1.5 ml-auto">
              <ForgeChip onClick={() => dispatch({ type: 'undo', key: selectedKey })} disabled={!work || work.past.length === 0} title="Undo (Ctrl+Z)">Undo</ForgeChip>
              <ForgeChip onClick={() => dispatch({ type: 'redo', key: selectedKey })} disabled={!work || work.future.length === 0} title="Redo (Ctrl+Shift+Z)">Redo</ForgeChip>
              <ForgeChip tone="go" onClick={save} disabled={!unsaved}>Save</ForgeChip>
            </span>
          </div>

          <div className="text-xs text-stone-400">
            {builtIn ? (
              <>
                Plays when: {builtIn.where.toLowerCase()}. It ships with the game. Saving keeps your version on this device, where the game
                uses it straight away; to send it to players, use Copy recipe and pass it on.
              </>
            ) : (
              <>One of your sounds. Once saved it can be picked in any sound slot (spells, enemies, the global sounds) and syncs like other assets.</>
            )}
          </div>

          <LoudnessMeter picture={picture} />

          <ForgeTimeline
            sound={sound}
            picture={picture}
            selectedId={layer?.id ?? null}
            onSelect={setSelectedLayerId}
            onToggleMute={id => {
              const l = sound.layers.find(x => x.id === id);
              if (l) editLayer({ ...l, muted: !l.muted }, once('mute'));
            }}
            onSolo={id => play(sound, id)}
            onDragLayer={(id, change, dragId) => {
              dispatch({
                type: 'edit', key: selectedKey, tag: dragId, time: performance.now(), sticky: true,
                sound: { ...sound, layers: sound.layers.map(l => (l.id === id ? { ...l, ...change } : l)) },
              });
            }}
          />

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-stone-400 mr-1">Add a layer:</span>
            {LAYER_STARTERS.map(s => (
              <ForgeChip
                key={s.id}
                title={s.hint}
                onClick={() => {
                  const added = layerFromStarter(s.id);
                  edit({ ...sound, layers: [...sound.layers, added] }, once('add'));
                  setSelectedLayerId(added.id);
                }}
              >
                + {s.label}
              </ForgeChip>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px] items-start">
            <div className="space-y-3 min-w-0">
              {layer ? (
                <>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-stone-400">Layer</span>
                    <input
                      type="text"
                      value={layer.name}
                      onChange={e => editLayer({ ...layer, name: e.target.value }, 'name')}
                      aria-label="Layer name"
                      className="bg-stone-900 border border-stone-700 rounded px-2 py-1 text-sm text-parchment-100 w-40"
                    />
                    <ForgeChip onClick={() => play(sound, layer.id)} title="Hear this layer alone">▶ Alone</ForgeChip>
                    <ForgeChip
                      title="Bend this layer's pitch, colour and timing a little, at random. Undo if you do not like it."
                      onClick={() => editLayer(nudgeLayer(layer, 0.2, Math.random), once('nudge'))}
                    >
                      Surprise me
                    </ForgeChip>
                    <ForgeChip
                      onClick={() => {
                        const copy: SynthLayer = { ...(JSON.parse(JSON.stringify(layer)) as SynthLayer), id: newLayerId(), name: `${layer.name} copy` };
                        edit({ ...sound, layers: [...sound.layers, copy] }, once('duplicate'));
                        setSelectedLayerId(copy.id);
                      }}
                    >
                      Duplicate
                    </ForgeChip>
                    <ForgeChip
                      tone="danger"
                      onClick={() => {
                        edit({ ...sound, layers: sound.layers.filter(l => l.id !== layer.id) }, once('remove'));
                        setSelectedLayerId(null);
                      }}
                    >
                      Remove
                    </ForgeChip>
                  </div>
                  <LayerPanel
                    layer={layer}
                    onChange={editLayer}
                    onShuffle={() => editLayer({ ...layer, noiseSeed: Math.random() * 2 }, once('shuffle'))}
                  />
                </>
              ) : (
                <div className="px-3 py-4 rounded border border-stone-700 text-sm text-stone-400">
                  This sound has no layers. Add one above to begin.
                </div>
              )}
            </div>

            <div className="space-y-3">
              <ForgeSection title="The whole sound" hint="Level turns every layer up or down together. Set the balance between layers first, then use this to place the sound next to the others.">
                <ForgeSlider
                  label="Level" term="master" stacked value={sound.level} min={0.005} max={1.5} scale="log" show={{ decimals: 3 }}
                  onChange={level => edit({ ...sound, level }, 'sound-level')}
                />
                <div className="text-[11px] text-stone-500 tabular-nums">Length: {Math.round(soundLength(sound) * 1000)} ms · {sound.layers.length} layer{sound.layers.length === 1 ? '' : 's'}</div>
              </ForgeSection>

              <ForgeSection title="Keep or share">
                <div className="flex flex-wrap gap-1.5">
                  <ForgeChip onClick={revert} disabled={!unsaved || !saved} title="Go back to the saved version (Undo brings your edits back)">Revert to saved</ForgeChip>
                  <ForgeChip onClick={() => void copyRecipe()} title="Copy this sound as text, to paste somewhere else">Copy recipe</ForgeChip>
                  <ForgeChip onClick={() => setPasteText(t => (t === null ? '' : null))} active={pasteText !== null}>Paste recipe</ForgeChip>
                  {builtIn && saved?.edited && (
                    <ForgeChip tone="danger" onClick={resetToShipped} title="Forget this device's version and use the one that ships with the game">Reset to shipped</ForgeChip>
                  )}
                  {!builtIn && !confirmDelete && <ForgeChip tone="danger" onClick={() => setConfirmDelete(true)}>Delete</ForgeChip>}
                  {!builtIn && confirmDelete && (
                    <>
                      <ForgeChip tone="danger" onClick={remove}>Really delete</ForgeChip>
                      <ForgeChip onClick={() => setConfirmDelete(false)}>Keep it</ForgeChip>
                    </>
                  )}
                </div>
                {pasteText !== null && (
                  <div className="pt-2 space-y-1.5">
                    <textarea
                      value={pasteText}
                      onChange={e => setPasteText(e.target.value)}
                      rows={4}
                      placeholder="Paste a copied recipe here"
                      className="w-full bg-stone-900 border border-stone-700 rounded px-2 py-1 text-xs text-parchment-100 font-mono"
                    />
                    <ForgeChip tone="go" onClick={loadPasted} disabled={!pasteText.trim()}>Load it into this sound</ForgeChip>
                  </div>
                )}
              </ForgeSection>

              <ForgeSection title="It sounds like..." hint="What to try when a sound is wrong in a way that is hard to name. Each of these came up while the first sounds were tuned by ear.">
                <div className="space-y-2">
                  {TIPS.map(tip => (
                    <details key={tip.hears} className="text-xs">
                      <summary className="cursor-pointer text-parchment-300">...{tip.hears}</summary>
                      <div className="pt-1 pl-3 text-stone-400">{tip.why}</div>
                      <div className="pl-3 text-moss-300">{tip.try}</div>
                    </details>
                  ))}
                </div>
              </ForgeSection>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
