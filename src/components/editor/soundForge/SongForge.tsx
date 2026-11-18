import React from 'react';
import { toast } from '../../shared/Toast';
import type { SoundAsset } from '../../../types/game';
import { deleteSoundAsset, getSoundAssets, saveSoundAsset } from '../../../utils/assetStorage';
import { newAssetId } from '../../../utils/assetIds';
import { clearSoundCache } from '../../../utils/gameSounds';
import { soundManager } from '../../../utils/soundManager';
import {
  BEATS_PER_BAR, HIGHEST_KEY, LOWEST_KEY, MAX_BARS, MAX_TEMPO, MIN_TEMPO, STEPS_PER_BAR, STEPS_PER_BEAT,
  isSong, notePitch, noteSound, songSeconds, soundRoot, stepSeconds, type SongDrum, type SongNote, type SongTrack, type SynthSong,
} from '../../../utils/synth/song';
import { playSong, type SongPlayback } from '../../../utils/synth/songPlayer';
import { ForgeChip, ForgeSection, ForgeSlider, ForgeToggle } from './ForgeControls';
import { NOTE_NAMES, cloneSound } from './forgeModel';
import { MAX_MIDI_BYTES, songFromMidiFile } from './importMidi';
import { MidiError } from '../../../utils/synth/midi';
import { PianoRoll } from './PianoRoll';
import { DRUM_KIT, INSTRUMENTS, SCALES, cloneSong, drumTrack, gridRows, kitRows, newSong, noteCount, sameSong, scaleById, songReducer, trackFrom, withBars } from './songModel';
import { auditionSound } from './soundPreview';

// ============================================================================
// SONGS (user ask 2026-11-17): the other half of the Sound Forge.
// ============================================================================
// "The next step seems to be some kind of music maker ... Right now we can
// work with small soundbytes, but not longer songs." A song is notes on a
// grid, played on instruments that are sounds from the Sounds half
// (utils/synth/song.ts). Nothing here is audio: a song is a few kilobytes.
//
// A song is saved as an ordinary sound asset (SoundAsset.song), so it syncs,
// backs up and publishes like every other sound, and any sound slot in the
// game can take one (played once through: a jingle), and a music slot (a
// puzzle's Background Music, the game's background, victory and defeat
// music) plays it as music: looped for as long as the level lasts.
//
// This screen follows the Sounds screen's habits: a list on the left, the
// thing being made on the right, plain names with the trade's word beside
// them, undo for everything, and nothing lost by switching between songs.

const DEFAULT_VIEW = { home: 0, scale: 'major', low: 48, high: 84 };

/** How long a tapped-in note is: in steps, by its plain name and the trade's. */
const LENGTHS: ReadonlyArray<{ steps: number; label: string; term: string }> = [
  { steps: 1, label: '¼ beat', term: 'A sixteenth note' },
  { steps: 2, label: '½ beat', term: 'An eighth note' },
  { steps: 4, label: '1 beat', term: 'A quarter note' },
  { steps: 8, label: '2 beats', term: 'A half note' },
  { steps: 16, label: '4 beats', term: 'A whole note: one bar' },
];

interface Playing { playback: SongPlayback; song: SynthSong; loop: boolean; step: number }

export const SongForge: React.FC<{ /** False while the Sounds half is on show: its keys are not this screen's. */ active?: boolean }> = ({ active = true }) => {
  const [library, setLibrary] = React.useState<SoundAsset[]>(() => getSoundAssets());
  // The first song to show: the first saved one, or a new empty one.
  const [first] = React.useState(() => {
    const saved = getSoundAssets().find(a => a.song);
    return saved ? { id: saved.id, name: saved.name, song: saved.song! } : { id: newAssetId('sound'), name: 'My first song', song: newSong() };
  });
  const [state, dispatch] = React.useReducer(songReducer, first, f => songReducer({ work: {}, stamp: null }, { type: 'open', ...f }));
  const [selectedId, setSelectedId] = React.useState(first.id);
  const [trackIndex, setTrackIndex] = React.useState(0);
  const [noteLength, setNoteLength] = React.useState(4);
  const [loop, setLoop] = React.useState(true);
  const [playing, setPlaying] = React.useState(false);
  const [soundOff, setSoundOff] = React.useState(() => !soundManager.getSettings().enabled);
  const [deleteAsk, setDeleteAsk] = React.useState<string | null>(null);
  const [pasteText, setPasteText] = React.useState<string | null>(null);
  /** True while a MIDI file is being read. */
  const [importing, setImporting] = React.useState(false);
  const midiInput = React.useRef<HTMLInputElement>(null);
  const now = React.useRef<Playing | null>(null);

  const saved = library.find(a => a.id === selectedId && a.song) ?? null;
  const work = state.work[selectedId];
  const song = work?.song ?? saved?.song ?? null;
  const name = work?.name ?? saved?.name ?? '';
  const unsaved = !!work && (!saved?.song || !sameSong(work.song, saved.song) || work.name !== saved.name);
  const track = song ? song.tracks[Math.min(trackIndex, song.tracks.length - 1)] ?? null : null;
  const view = song?.view ?? DEFAULT_VIEW;
  const scale = scaleById(view.scale);

  // ---- hearing --------------------------------------------------------------
  const stop = React.useCallback(() => {
    now.current?.playback.stop();
    now.current = null;
    setPlaying(false);
  }, []);

  const begin = React.useCallback((which: SynthSong, looped: boolean, from = 0) => {
    now.current?.playback.stop();
    now.current = null;
    setSoundOff(!soundManager.getSettings().enabled);
    soundManager.playSynth((ctx, out) => {
      const playback = playSong(ctx, out, which, {
        loop: looped,
        from,
        onEnd: () => { if (now.current?.playback === playback) { now.current = null; setPlaying(false); } },
      });
      now.current = { playback, song: which, loop: looped, step: stepSeconds(which) };
    });
    setPlaying(!!now.current);
  }, []);

  // Changed while it plays: carry on from where it is, with the change in.
  React.useEffect(() => {
    if (!playing || !song) return;
    const current = now.current;
    if (!current || (current.song === song && current.loop === loop)) return;
    const id = window.setTimeout(() => {
      const at = current.playback.position();
      begin(song, loop, at < 0 ? 0 : at);
    }, 200);
    return () => window.clearTimeout(id);
  }, [playing, song, loop, begin]);

  // Leaving the screen, or the page: the music stops.
  React.useEffect(() => () => { now.current?.playback.stop(); now.current = null; }, []);
  React.useEffect(() => {
    if (active) return;
    const id = window.setTimeout(stop, 0);
    return () => window.clearTimeout(id);
  }, [active, stop]);

  /** Where the song is now (steps), for the grid's moving line. */
  const playhead = React.useCallback(() => {
    const current = now.current;
    if (!current) return -1;
    const seconds = current.playback.position();
    return seconds < 0 ? -1 : seconds / current.step;
  }, []);

  /** Sound one key on the track being edited. */
  const soundKey = (key: number, steps: number) => {
    if (!song || !track) return;
    const seconds = steps * stepSeconds(song);
    const note: SongNote = { at: 0, length: steps, key };
    auditionSound(noteSound(track, note, seconds, song.level), { pitch: notePitch(track, key) });
  };

  // ---- editing --------------------------------------------------------------
  const once = (tag: string) => `${tag}:${performance.now()}`;
  const edit = (next: SynthSong, tag: string, sticky?: boolean) =>
    dispatch({ type: 'edit', id: selectedId, song: next, tag, time: performance.now(), sticky });
  const editTrack = (next: SongTrack, tag: string, sticky?: boolean) => {
    if (!song) return;
    edit({ ...song, tracks: song.tracks.map(t => (t.id === next.id ? next : t)) }, `${next.id}:${tag}`, sticky);
  };
  const setView = (change: Partial<typeof DEFAULT_VIEW>) => song && edit({ ...song, view: { ...view, ...change } }, once('view'));

  const open = (id: string) => {
    const asset = library.find(a => a.id === id);
    if (!state.work[id] && !asset?.song) return;
    stop();
    if (!state.work[id] && asset?.song) dispatch({ type: 'open', id, name: asset.name, song: asset.song });
    setSelectedId(id);
    setTrackIndex(0);
    setDeleteAsk(null);
  };

  const startNew = (label: string, fresh: SynthSong) => {
    stop();
    const id = newAssetId('sound');
    dispatch({ type: 'open', id, name: label, song: fresh });
    setSelectedId(id);
    setTrackIndex(0);
  };

  // A MIDI file, made into a new song of its own.
  const importMidi = (file: File) => {
    if (file.size > MAX_MIDI_BYTES) {
      toast.error('That file is too large to be a MIDI file of a song.');
      return;
    }
    setImporting(true);
    songFromMidiFile(file).then(
      made => {
        startNew(file.name.replace(/\.[^.]+$/, '') || 'Imported song', made.song);
        toast.success(made.summary);
      },
      (error: unknown) => {
        const message = (error as Error)?.message;
        toast.error(error instanceof MidiError ? message
          : message === 'no notes' ? 'That MIDI file has no notes in it.'
          : 'Could not read that as a MIDI file (.mid).');
      },
    ).finally(() => setImporting(false));
  };

  const refresh = () => {
    clearSoundCache(); // the game's sound slots pick the new version up
    setLibrary(getSoundAssets());
  };
  // Coming back from the Sounds half: a sound saved there can be picked as an instrument here.
  React.useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(() => setLibrary(getSoundAssets()), 0);
    return () => window.clearTimeout(id);
  }, [active]);

  const save = () => {
    if (!song) return;
    const existing = library.find(a => a.id === selectedId);
    const label = name.trim() || 'Untitled song';
    const ok = saveSoundAsset({
      ...existing,
      id: selectedId,
      name: label,
      description: existing?.description ?? 'A song written in the Sound Forge.',
      song,
      duration: songSeconds(song),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });
    if (!ok) {
      toast.error('Could not save: storage is full');
      return;
    }
    refresh();
    toast.success(`Saved "${label}"`);
  };

  const remove = (id: string) => {
    const gone = state.work[id]?.name ?? library.find(a => a.id === id)?.name ?? 'the song';
    if (id === selectedId) stop();
    if (library.some(a => a.id === id)) deleteSoundAsset(id);
    dispatch({ type: 'drop', id });
    refresh();
    setDeleteAsk(null);
    if (id === selectedId) {
      const other = getSoundAssets().find(a => a.song && a.id !== id);
      if (other) { dispatch({ type: 'open', id: other.id, name: other.name, song: other.song! }); setSelectedId(other.id); }
      else startNew('New song', newSong());
    }
    toast.success(`Deleted "${gone}"`);
  };

  const copySong = async () => {
    if (!song) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify({ name, song }, null, 2));
      toast.success('Song copied as text');
    } catch {
      toast.error('Could not copy to the clipboard');
    }
  };

  const loadPasted = () => {
    try {
      const parsed = JSON.parse(pasteText ?? '') as { song?: unknown };
      const pasted = isSong(parsed.song) ? parsed.song : isSong(parsed) ? parsed : null;
      if (!pasted) throw new Error('not a song');
      edit({ ...cloneSong(pasted), version: 1 }, once('paste'));
      setTrackIndex(0);
      setPasteText(null);
      toast.success('Song loaded. Undo brings the old one back.');
    } catch {
      toast.error('That is not a song');
    }
  };

  // Space plays and stops; undo and redo (not while typing in a box).
  React.useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (k === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey && tag !== 'BUTTON') {
        e.preventDefault();
        if (now.current) stop();
        else if (song) begin(song, loop);
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); dispatch({ type: 'undo', id: selectedId }); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); dispatch({ type: 'redo', id: selectedId }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, selectedId, song, loop, begin, stop]);

  if (!song || !track) return <div className="p-4 text-sm text-stone-400">That song is gone. Pick another from the list.</div>;

  const kit = track.kit ?? null;
  const rows = kit ? kitRows(track) : gridRows(view.low, view.high, view.home, scale, track.notes);
  const bars = Math.round(song.length / STEPS_PER_BAR);
  const savedSongs = library.filter(a => a.song);
  const unsavedNew = Object.keys(state.work).filter(id => !savedSongs.some(a => a.id === id));
  const mySounds = library.filter(a => a.synth && !a.id.startsWith('chrome_'));
  /** Give one drum of the kit another sound: one of the user's own, or (no `from`) the kit's own back. */
  const setDrum = (drum: SongDrum, sound: SongDrum['sound'], from?: string) => {
    if (!kit) return;
    const next: SongDrum = { key: drum.key, name: drum.name, sound, ...(from ? { from } : {}) };
    editTrack({ ...track, kit: kit.map(d => (d.key === drum.key ? next : d)) }, once('drum'));
  };
  const setInstrument = (label: string, sound: SynthSong['tracks'][number]['instrument'], held: boolean) => {
    const wasNamedForIt = INSTRUMENTS.some(i => i.label === track.name) || mySounds.some(a => a.name === track.name);
    editTrack({ ...track, name: wasNamedForIt ? label : track.name, instrument: sound, root: soundRoot(sound), held }, once('instrument'));
  };

  const listRow = (id: string, label: string, chip?: string) => {
    const w = state.work[id];
    const asset = savedSongs.find(a => a.id === id);
    const dirty = !!w && (!asset?.song || !sameSong(w.song, asset.song) || w.name !== asset.name);
    const asking = deleteAsk === id;
    return (
      <div key={id} className={`flex items-center border-t border-stone-700/60 first:border-t-0 ${id === selectedId ? 'bg-stone-700 text-parchment-100' : 'text-stone-300 hover:bg-stone-800/50'}`}>
        <button type="button" onClick={() => open(id)} className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1.5 text-left text-sm">
          <span className="flex-1 min-w-0 truncate">{label}</span>
          {chip && <span className="px-1.5 rounded border text-[10px] bg-copper-900/40 text-copper-300 border-copper-700/50">{chip}</span>}
          {dirty && <span className="w-1.5 h-1.5 rounded-full bg-arcane-400" title="Unsaved changes" />}
        </button>
        {!asking && (
          <button type="button" onClick={() => setDeleteAsk(id)} className="px-2 py-1.5 text-xs text-stone-500 hover:text-blood-300" title={`Delete "${label}"`} aria-label={`Delete ${label}`}>
            ✕
          </button>
        )}
        {asking && (
          <span className="flex items-center gap-1 pr-1">
            <ForgeChip tone="danger" onClick={() => remove(id)}>Delete</ForgeChip>
            <ForgeChip onClick={() => setDeleteAsk(null)}>Keep</ForgeChip>
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3 md:p-4 max-w-6xl mx-auto grid gap-4 md:grid-cols-[230px_minmax(0,1fr)] items-start">
        {/* ---- the songs ---- */}
        <div className="space-y-3">
          <div className="border border-stone-700 rounded overflow-hidden">
            <div className="px-2 py-1.5 bg-stone-800 text-xs uppercase text-stone-400">My songs</div>
            {savedSongs.map(a => listRow(a.id, state.work[a.id]?.name ?? a.name))}
            {unsavedNew.map(id => listRow(id, state.work[id].name, 'new'))}
          </div>
          <div className="border border-stone-700 rounded">
            <div className="px-2 py-1.5 bg-stone-800 text-xs uppercase text-stone-400">New song</div>
            <div className="p-2 flex flex-wrap gap-1.5">
              <ForgeChip onClick={() => startNew('New song', newSong())} title="Four empty bars and a harp">Empty</ForgeChip>
              <ForgeChip onClick={() => startNew(`${name} copy`, cloneSong(song))} title="A copy of the song you are looking at">Copy of this</ForgeChip>
              <ForgeChip
                onClick={() => midiInput.current?.click()}
                disabled={importing}
                title="Pick a MIDI file (.mid): a song written in any music program, or an old tune found as MIDI. Its notes come in on the grid, one part for each instrument, played on the Forge's instruments, and its drums on the Forge's kit."
              >
                {importing ? 'Reading...' : 'A MIDI file...'}
              </ForgeChip>
              <input
                ref={midiInput}
                type="file"
                accept=".mid,.midi,audio/midi,audio/x-midi"
                className="hidden"
                aria-label="A MIDI file to make a song from"
                onChange={e => {
                  const file = e.target.files?.[0];
                  e.target.value = ''; // the same file can be picked again
                  if (file) importMidi(file);
                }}
              />
            </div>
          </div>
          <div className="text-[11px] text-stone-500 px-1">
            A saved song is one of your sounds (marked ♪ where sounds are picked). As a level's music it goes round for as long as the level lasts: pick it
            as a puzzle's Background Music in the map editor, or as the game's background, victory or defeat music under Sounds → Global Sounds. Any other
            sound slot plays it once through, as a jingle.
          </div>
        </div>

        {/* ---- the song ---- */}
        <div className="space-y-3 min-w-0">
          {soundOff && (
            <div className="px-3 py-2 rounded border border-copper-700/50 bg-copper-900/30 text-copper-300 text-sm">
              Sound is switched off, so nothing here will be heard. Turn it on with the speaker button in the menu.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={e => dispatch({ type: 'rename', id: selectedId, name: e.target.value })}
              aria-label="Song name"
              className="bg-stone-900 border border-stone-700 rounded px-2 py-1 text-sm text-parchment-100 w-56"
            />
            {playing
              ? <ForgeChip tone="danger" onClick={stop} title="Stop (Space)">■ Stop</ForgeChip>
              : <ForgeChip tone="go" onClick={() => begin(song, loop)} title="Play from the start (Space)">▶ Play</ForgeChip>}
            <ForgeChip active={loop} onClick={() => setLoop(l => !l)} title="Go round and round until stopped, so changes can be heard as they are made">Go round</ForgeChip>
            <span className="flex gap-1.5 ml-auto">
              <ForgeChip onClick={() => dispatch({ type: 'undo', id: selectedId })} disabled={!work || work.past.length === 0} title="Undo (Ctrl+Z)">Undo</ForgeChip>
              <ForgeChip onClick={() => dispatch({ type: 'redo', id: selectedId })} disabled={!work || work.future.length === 0} title="Redo (Ctrl+Shift+Z)">Redo</ForgeChip>
              <ForgeChip tone="go" onClick={save} disabled={!unsaved}>Save</ForgeChip>
            </span>
          </div>

          {/* ---- tracks ---- */}
          <div className="border border-stone-700 rounded px-2 py-1.5 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-stone-400 w-16 shrink-0">Parts</span>
              {song.tracks.map((t, i) => (
                <ForgeChip key={t.id} active={t.id === track.id} onClick={() => setTrackIndex(i)} title={`${t.notes.length} note${t.notes.length === 1 ? '' : 's'}${t.muted ? ', silenced' : ''}`}>
                  {t.muted ? '🔇 ' : ''}{t.name}
                </ForgeChip>
              ))}
              <ForgeChip
                title="Another instrument playing along, with notes of its own"
                disabled={song.tracks.length >= 8}
                onClick={() => {
                  const lead = INSTRUMENTS[Math.min(INSTRUMENTS.length - 1, song.tracks.length)];
                  edit({ ...song, tracks: [...song.tracks, trackFrom(lead.label, lead.make(), lead.held)] }, once('add-track'));
                  setTrackIndex(song.tracks.length);
                }}
              >
                + Add a part
              </ForgeChip>
              <ForgeChip
                title="A drum part: a kit of eight drums, one to a row. Tap squares for hits"
                disabled={song.tracks.length >= 8}
                onClick={() => {
                  edit({ ...song, tracks: [...song.tracks, drumTrack()] }, once('add-track'));
                  setTrackIndex(song.tracks.length);
                }}
              >
                + Add drums
              </ForgeChip>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-stone-400 w-16 shrink-0">This part</span>
              <input
                type="text"
                value={track.name}
                onChange={e => editTrack({ ...track, name: e.target.value }, 'name')}
                aria-label="Part name"
                className="bg-stone-900 border border-stone-700 rounded px-2 py-1 text-sm text-parchment-100 w-36"
              />
              <ForgeToggle label="Silenced" on={!!track.muted} onChange={muted => editTrack({ ...track, muted: muted || undefined }, once('mute'))} />
              <ForgeChip onClick={() => editTrack({ ...track, notes: [] }, once('clear'))} disabled={track.notes.length === 0} title="Remove every note of this part (Undo brings them back)">Clear notes</ForgeChip>
              {song.tracks.length > 1 && (
                <ForgeChip
                  tone="danger"
                  onClick={() => {
                    edit({ ...song, tracks: song.tracks.filter(t => t.id !== track.id) }, once('remove-track'));
                    setTrackIndex(0);
                  }}
                >
                  Remove part
                </ForgeChip>
              )}
            </div>
          </div>

          {/* ---- what the grid shows ---- */}
          {kit && (
            <div className="border border-stone-700 rounded px-2 py-1.5 text-[11px] text-stone-500">
              A drum part: each row is one drum of the kit, the cymbals at the top and the kick at the bottom. Tap a square for a hit, tap a hit to remove it;
              tap a drum's name to hear it. A common beat to start from: a kick on beats 1 and 3, a snare on 2 and 4, and a hat on every half beat.
            </div>
          )}
          {!kit && <div className="border border-stone-700 rounded px-2 py-1.5 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-stone-400 w-16 shrink-0">Scale</span>
              {SCALES.map(s => (
                <ForgeChip key={s.id} active={s.id === scale.id} onClick={() => setView({ scale: s.id })} title={s.hint}>{s.label}</ForgeChip>
              ))}
            </div>
            {scale.id !== 'all' && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-xs text-stone-400 w-16 shrink-0">Home note</span>
                {NOTE_NAMES.map((n, i) => (
                  <ForgeChip key={n} active={i === view.home} onClick={() => setView({ home: i })} title={`The scale starts on ${n}: the note the tune feels at rest on`}>{n}</ForgeChip>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-stone-400 w-16 shrink-0">Note length</span>
              {LENGTHS.map(l => (
                <ForgeChip key={l.steps} active={l.steps === noteLength} onClick={() => setNoteLength(l.steps)} title={l.term}>{l.label}</ForgeChip>
              ))}
              <span className="ml-auto flex items-center gap-1.5">
                <span className="text-xs text-stone-400">Keys shown</span>
                <ForgeChip disabled={view.low - 12 < LOWEST_KEY} onClick={() => setView({ low: view.low - 12, high: view.high - 12 })} title="Show an octave lower">▼ Lower</ForgeChip>
                <ForgeChip disabled={view.high + 12 > HIGHEST_KEY} onClick={() => setView({ low: view.low + 12, high: view.high + 12 })} title="Show an octave higher">▲ Higher</ForgeChip>
              </span>
            </div>
            <div className="text-[11px] text-stone-500">
              {scale.hint}. Only the scale's keys have rows, so no square is a wrong note. Tap a square for a note, tap a note to remove it; with a mouse, drag a
              note to move it and drag its right end to stretch it.
            </div>
          </div>}

          <PianoRoll
            notes={track.notes}
            rows={rows}
            length={song.length}
            noteLength={kit ? 1 : noteLength}
            hits={!!kit}
            playhead={playhead}
            onChange={(notes, tag, sticky) => editTrack({ ...track, notes }, tag, sticky)}
            onSound={soundKey}
            showing={`${selectedId}:${track.id}`}
          />
          <div className="text-[11px] text-stone-500 tabular-nums">
            {bars} bar{bars === 1 ? '' : 's'} of {BEATS_PER_BAR} beats · {songSeconds(song).toFixed(1)} s once through · {noteCount(song)} note{noteCount(song) === 1 ? '' : 's'}
            {song.tracks.length > 1 ? ` in ${song.tracks.length} parts` : ''}
          </div>

          <div className="grid gap-3 lg:grid-cols-2 items-start">
            {kit && (
              <ForgeSection
                title="The kit"
                term="this part's drums"
                hint="One drum to a row of the grid. Any sound made in the Sounds half can stand in for a drum: it is played as it is, not higher or lower."
              >
                <div className="space-y-1">
                  {kit.map(drum => (
                    <div key={drum.key} className="flex items-center gap-1.5">
                      <ForgeChip tone="go" onClick={() => soundKey(drum.key, 1)} title={`Hear the ${drum.name.toLowerCase()}`}>▶</ForgeChip>
                      <span className="text-xs text-parchment-100 w-16 shrink-0">{drum.name}</span>
                      <select
                        value={drum.from ? 'mine' : 'kit'}
                        aria-label={`The sound of the ${drum.name.toLowerCase()}`}
                        title={DRUM_KIT.find(d => d.key === drum.key)?.hint}
                        onChange={e => {
                          const own = DRUM_KIT.find(d => d.key === drum.key);
                          const mine = mySounds.find(a => a.id === e.target.value);
                          if (mine?.synth) setDrum(drum, cloneSound(mine.synth), mine.name);
                          else if (e.target.value === 'kit' && own) setDrum(drum, own.make());
                        }}
                        className="flex-1 min-w-0 px-2 py-1 bg-stone-900 border border-stone-700 rounded text-parchment-100 text-xs"
                      >
                        <option value="kit">The kit's own</option>
                        {drum.from && <option value="mine">{drum.from} (a copy kept in the song)</option>}
                        {mySounds.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <ForgeSlider label="Level" term="this part" value={track.level} min={0} max={2} show={{ decimals: 2 }} onChange={level => editTrack({ ...track, level }, 'level')} />
              </ForgeSection>
            )}
            {!kit && <ForgeSection
              title="Instrument"
              term="this part's voice"
              hint="What plays this part's notes. Any sound made in the Sounds half can be an instrument: every note plays it higher or lower."
            >
              <div className="flex flex-wrap gap-1.5">
                {INSTRUMENTS.map(i => (
                  <ForgeChip key={i.id} title={i.hint} onClick={() => setInstrument(i.label, i.make(), i.held)}>{i.label}</ForgeChip>
                ))}
              </div>
              {mySounds.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                  <span className="text-[11px] text-stone-400">My sounds</span>
                  {mySounds.map(a => (
                    <ForgeChip key={a.id} title="Use this sound as the instrument (a copy is kept in the song)" onClick={() => setInstrument(a.name, cloneSound(a.synth!), false)}>{a.name}</ForgeChip>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                <ForgeChip tone="go" onClick={() => soundKey(track.root, 4)} title="Hear the instrument on its own note">▶ Hear it</ForgeChip>
                <ForgeToggle label="Held notes" on={!!track.held} onChange={held => editTrack({ ...track, held: held || undefined }, once('held'))} />
              </div>
              <div className="text-[11px] text-stone-500">
                {track.held
                  ? 'Held: a note sounds for as long as it is drawn, like an organ or a flute.'
                  : 'Not held: every note rings out its own length however long it is drawn, like a harp, a bell or a drum.'}
              </div>
              <ForgeSlider label="Level" term="this part" value={track.level} min={0} max={2} show={{ decimals: 2 }} onChange={level => editTrack({ ...track, level }, 'level')} />
            </ForgeSection>}

            <div className="space-y-3">
              <ForgeSection title="The whole song">
                <ForgeSlider
                  label="Speed" term="tempo" value={song.tempo} min={MIN_TEMPO} max={MAX_TEMPO} show={{ unit: 'bpm', decimals: 0 }}
                  onChange={tempo => edit({ ...song, tempo: Math.round(tempo) }, 'tempo')}
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-parchment-300 w-28">Length</span>
                  <ForgeChip disabled={bars <= 1} onClick={() => edit(withBars(song, bars - 1), once('bars'))} title="One bar shorter (notes in the last bar go)">− Bar</ForgeChip>
                  <span className="text-xs text-parchment-100 tabular-nums w-14 text-center">{bars} bar{bars === 1 ? '' : 's'}</span>
                  <ForgeChip disabled={bars >= MAX_BARS} onClick={() => edit(withBars(song, bars + 1), once('bars'))} title="One bar longer">+ Bar</ForgeChip>
                  <ForgeChip disabled={bars * 2 > MAX_BARS} onClick={() => edit(withBars(song, bars * 2), once('bars'))} title="Twice as long">× 2</ForgeChip>
                </div>
                <ForgeSlider label="Level" term="master" value={song.level} min={0.05} max={2} scale="log" show={{ decimals: 2 }} onChange={level => edit({ ...song, level }, 'song-level')} />
                <div className="text-[11px] text-stone-500">
                  A beat is what a foot taps; {song.tempo} of them go by in a minute. A bar is {BEATS_PER_BAR} beats, and each beat is {STEPS_PER_BEAT} squares wide.
                </div>
              </ForgeSection>

              <ForgeSection title="Keep or share">
                <div className="flex flex-wrap gap-1.5">
                  <ForgeChip onClick={() => saved?.song && edit(cloneSong(saved.song), once('revert'))} disabled={!unsaved || !saved} title="Go back to the saved version (Undo brings your edits back)">Revert to saved</ForgeChip>
                  <ForgeChip onClick={() => void copySong()} title="Copy this song as text, to keep somewhere or pass on">Copy song</ForgeChip>
                  <ForgeChip onClick={() => setPasteText(t => (t === null ? '' : null))} active={pasteText !== null}>Paste song</ForgeChip>
                </div>
                {pasteText !== null && (
                  <div className="pt-2 space-y-1.5">
                    <textarea
                      value={pasteText}
                      onChange={e => setPasteText(e.target.value)}
                      rows={4}
                      placeholder="Paste a copied song here"
                      className="w-full bg-stone-900 border border-stone-700 rounded px-2 py-1 text-xs text-parchment-100 font-mono"
                    />
                    <ForgeChip tone="go" onClick={loadPasted} disabled={!pasteText.trim()}>Load it into this song</ForgeChip>
                  </div>
                )}
              </ForgeSection>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
