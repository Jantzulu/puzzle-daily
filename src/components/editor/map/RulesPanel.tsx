// Rules tab: everything that constrains how the puzzle plays — hero counts,
// turn/life limits, win conditions (incl. noble warnings + per-type kill
// curation), par, and side quests. Split out of PuzzleInfoPanel (Phase 2
// layout rework, 2026-07-14); the field markup is unchanged from Phase 1.
import React from 'react';
import type { WinConditionType, SideQuestType } from '../../../types/game';
import { getCharacter } from '../../../data/characters';
import { getEnemy } from '../../../data/enemies';
import type { EditorState } from './editorState';

interface RulesPanelProps {
  state: EditorState;
  setState: React.Dispatch<React.SetStateAction<EditorState>>;
}

export const RulesPanel: React.FC<RulesPanelProps> = ({ state, setState }) => (
  <div className="bg-stone-800 p-4 rounded space-y-3">
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="block text-sm mb-1">Available Heroes</label>
        <input
          type="number"
          min="1"
          max="10"
          value={state.maxCharacters}
          onChange={(e) => setState(prev => ({ ...prev, maxCharacters: Number(e.target.value) }))}
          className="w-full px-3 py-2 bg-stone-700 rounded"
          title="Max heroes in the pool (solver uses this)"
        />
      </div>
      <div>
        <label className="block text-sm mb-1">Max Placeable</label>
        <input
          type="number"
          min="1"
          max={state.maxCharacters}
          value={state.maxPlaceableCharacters ?? state.maxCharacters}
          onChange={(e) => {
            const val = Number(e.target.value);
            setState(prev => ({
              ...prev,
              maxPlaceableCharacters: val === prev.maxCharacters ? undefined : val
            }));
          }}
          className="w-full px-3 py-2 bg-stone-700 rounded"
          title="Max heroes player can place (can be less than available)"
        />
      </div>
    </div>
    <p className="text-xs text-stone-400 mt-1">Player can place up to {state.maxPlaceableCharacters ?? state.maxCharacters} of {state.maxCharacters} available heroes</p>
    <div className="grid grid-cols-2 gap-2 mt-2">
      <div>
        <label className="block text-sm mb-1">Max Turns</label>
        <input
          type="number"
          min="10"
          max="1000"
          value={state.maxTurns}
          onChange={(e) => setState(prev => ({ ...prev, maxTurns: Number(e.target.value) }))}
          className="w-full px-3 py-2 bg-stone-700 rounded"
        />
      </div>
      <div>
        <label className="block text-sm mb-1">Lives</label>
        <input
          type="number"
          min="0"
          max="99"
          value={state.lives ?? 3}
          onChange={(e) => setState(prev => ({ ...prev, lives: Number(e.target.value) }))}
          className="w-full px-3 py-2 bg-stone-700 rounded"
          title="Number of attempts (0 = unlimited)"
        />
      </div>
    </div>
    <p className="text-xs text-stone-400 mt-1">Lives: 0 = unlimited attempts</p>

    {/* Win Conditions */}
    <div className="pt-3 border-t border-stone-700">
      <h3 className="text-sm font-semibold mb-2">Win Conditions</h3>
      <div className="space-y-2">
        {state.winConditions.map((condition, index) => (
          <div key={index} className="bg-stone-700 p-2 rounded">
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1 min-w-0">
                <select
                  value={condition.type}
                  onChange={(e) => {
                    const newType = e.target.value as WinConditionType;
                    setState(prev => {
                      const newConditions = [...prev.winConditions];
                      newConditions[index] = { type: newType, params: {} };
                      return { ...prev, winConditions: newConditions };
                    });
                  }}
                  className="w-full px-2 py-1 bg-stone-600 rounded text-sm mb-1"
                >
                  <option value="defeat_all_enemies">Defeat All Enemies</option>
                  <option value="defeat_boss">Defeat the Boss</option>
                  <option value="collect_all">Collect All Items</option>
                  <option value="collect_keys">Collect All Keys</option>
                  <option value="reach_goal">Reach Goal Tile</option>
                  <option value="survive_turns">Survive X Turns</option>
                  <option value="win_in_turns">Win Within X Turns</option>
                  <option value="max_characters">Use Max X Characters</option>
                  <option value="characters_alive">Keep X Characters Alive</option>
                  <option value="protect_noble">Protect the Noble</option>
                  <option value="noble_survives_turns">Noble Survives X Turns</option>
                  <option value="noble_reaches_goal">Noble Reaches Goal Tile</option>
                  <option value="noble_escapes">Noble Escapes the Dungeon</option>
                  <option value="entity_escapes">Escort Through an Opening</option>
                </select>

                {/* Noble conditions: warn when nothing placed can satisfy them.
                    Any noble condition also makes a Noble death instant defeat
                    (engine implied-protect rule). */}
                {(condition.type === 'protect_noble' || condition.type === 'noble_survives_turns' || condition.type === 'noble_reaches_goal' || condition.type === 'noble_escapes') && (() => {
                  const hasPlacedNoble =
                    state.enemies.some(e => e.party === 'hero' && getEnemy(e.enemyId)?.isNoble) ||
                    state.availableCharacters.some(cid => getCharacter(cid)?.isNoble);
                  return (
                    <>
                      {!hasPlacedNoble && (
                        <p className="text-xs text-amber-400 italic">No Noble on this map — place a Noble ally or add a Noble hero</p>
                      )}
                      <p className="text-xs text-stone-500">If the Noble dies, the puzzle is lost.</p>
                    </>
                  );
                })()}

                {/* Params for conditions that need them */}
                {(condition.type === 'survive_turns' || condition.type === 'win_in_turns' || condition.type === 'noble_survives_turns') && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-stone-400">Turns:</label>
                    <input
                      type="number"
                      min="1"
                      max="999"
                      value={condition.params?.turns ?? 10}
                      onChange={(e) => {
                        setState(prev => {
                          const newConditions = [...prev.winConditions];
                          newConditions[index] = {
                            ...newConditions[index],
                            params: { ...newConditions[index].params, turns: parseInt(e.target.value) || 10 }
                          };
                          return { ...prev, winConditions: newConditions };
                        });
                      }}
                      className="w-20 px-2 py-1 bg-stone-600 rounded text-sm"
                    />
                  </div>
                )}

                {/* Escort (entity_escapes, 2026-07-21): designate WHO to
                    guide out (asset ids — placed enemies/allies + heroes in
                    the pool) and how the exit is detected. Implied-protect:
                    a designated entity dying loses the puzzle. */}
                {condition.type === 'entity_escapes' && (() => {
                  const ids = condition.params?.escortEntityIds ?? [];
                  const setIds = (next: string[]) => {
                    setState(prev => {
                      const newConditions = [...prev.winConditions];
                      newConditions[index] = {
                        ...newConditions[index],
                        params: {
                          ...newConditions[index].params,
                          escortEntityIds: next.length > 0 ? next : undefined,
                        },
                      };
                      return { ...prev, winConditions: newConditions };
                    });
                  };
                  const candidates: Array<{ id: string; name: string; kind: string }> = [
                    ...Array.from(new Set(state.enemies.map(e => e.enemyId))).map(id => ({
                      id,
                      name: getEnemy(id)?.name ?? id,
                      kind: state.enemies.some(e => e.enemyId === id && e.party === 'hero') ? 'Ally' : 'Enemy',
                    })),
                    ...state.availableCharacters.map(id => ({
                      id,
                      name: getCharacter(id)?.name ?? id,
                      kind: 'Hero',
                    })),
                  ];
                  return (
                    <div className="space-y-1 mt-1">
                      <p className="text-xs text-stone-400">Guide out:</p>
                      {candidates.length === 0 && (
                        <p className="text-xs text-amber-400 italic">Place enemies/allies or add heroes to choose escort targets</p>
                      )}
                      {candidates.map(c => (
                        <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ids.includes(c.id)}
                            onChange={(e) => setIds(e.target.checked ? [...ids, c.id] : ids.filter(i => i !== c.id))}
                            className="w-3.5 h-3.5"
                          />
                          <span>{c.name} <span className="text-stone-500">({c.kind})</span></span>
                        </label>
                      ))}
                      {ids.length === 0 && candidates.length > 0 && (
                        <p className="text-xs text-amber-400 italic">Nothing designated — the quest can never complete</p>
                      )}
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-stone-400">Counts when:</label>
                        <select
                          value={condition.params?.escapeRule ?? 'standing'}
                          onChange={(e) => {
                            const v = e.target.value as 'standing' | 'walk_through';
                            setState(prev => {
                              const newConditions = [...prev.winConditions];
                              newConditions[index] = {
                                ...newConditions[index],
                                params: {
                                  ...newConditions[index].params,
                                  escapeRule: v === 'standing' ? undefined : v,
                                },
                              };
                              return { ...prev, winConditions: newConditions };
                            });
                          }}
                          className="flex-1 px-2 py-1 bg-stone-600 rounded text-xs"
                        >
                          <option value="standing">Standing on the opening tile (end of turn)</option>
                          <option value="walk_through">Walking out through the mouth</option>
                        </select>
                      </div>
                      <p className="text-xs text-stone-500">If a designated entity dies, the puzzle is lost. Escaped enemies don't count as kills.</p>
                    </div>
                  );
                })()}

                {/* Noble escape + escort: pick the exit opening (or any).
                    Guiding a living target onto the opening's floor tile
                    (or walking it out, in walk-through mode) ends its run —
                    it walks out and counts as escaped. */}
                {(condition.type === 'noble_escapes' || condition.type === 'entity_escapes') && (() => {
                  const openings = [
                    ...state.hallways.map(h => ({ x: h.x, y: h.y, side: h.side as string, kind: 'Hallway' })),
                    ...state.doors.map(d => ({ x: d.x, y: d.y, side: d.side as string, kind: 'Door' })),
                  ];
                  if (openings.length === 0) return (
                    <p className="text-xs text-amber-400 italic">No hallways or doors on this map — add an opening with the Hallway tool</p>
                  );
                  const eo = condition.params?.escapeOpening;
                  return (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-stone-400">Through:</label>
                      <select
                        value={eo ? `${eo.x},${eo.y},${eo.side}` : ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          let escapeOpening: { x: number; y: number; side: string } | undefined;
                          if (v) {
                            const [x, y, side] = v.split(',');
                            escapeOpening = { x: parseInt(x), y: parseInt(y), side };
                          }
                          setState(prev => {
                            const newConditions = [...prev.winConditions];
                            newConditions[index] = {
                              ...newConditions[index],
                              params: { ...newConditions[index].params, escapeOpening },
                            };
                            return { ...prev, winConditions: newConditions };
                          });
                        }}
                        className="flex-1 px-2 py-1 bg-stone-600 rounded text-xs"
                      >
                        <option value="">Any opening</option>
                        {openings.map(o => (
                          <option key={`${o.kind}:${o.x},${o.y},${o.side}`} value={`${o.x},${o.y},${o.side}`}>
                            {o.kind} at ({o.x}, {o.y}) — {o.side}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })()}

                {/* Per-type kill-requirement curation (user design 2026-07-11):
                    every enemy type placed on the map gets a checkbox; unchecked
                    types go into params.excludedEnemyIds — they neither block
                    victory nor appear in the player's quest text. */}
                {condition.type === 'defeat_all_enemies' && (() => {
                  const placedTypes = Array.from(new Set(state.enemies.map(e => e.enemyId)));
                  if (placedTypes.length === 0) return (
                    <p className="text-xs text-stone-500 italic">Place enemies to choose which count</p>
                  );
                  const excluded = condition.params?.excludedEnemyIds ?? [];
                  return (
                    <div className="space-y-1 mt-1">
                      <p className="text-xs text-stone-400">Counts toward the quest:</p>
                      {placedTypes.map(enemyId => {
                        const counts = !excluded.includes(enemyId);
                        const name = getEnemy(enemyId)?.name ?? enemyId;
                        return (
                          <label key={enemyId} className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={counts}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? excluded.filter(id => id !== enemyId)
                                  : [...excluded, enemyId];
                                setState(prev => {
                                  const newConditions = [...prev.winConditions];
                                  newConditions[index] = {
                                    ...newConditions[index],
                                    params: {
                                      ...newConditions[index].params,
                                      excludedEnemyIds: next.length > 0 ? next : undefined,
                                    },
                                  };
                                  return { ...prev, winConditions: newConditions };
                                });
                              }}
                              className="w-3.5 h-3.5"
                            />
                            <span className={counts ? '' : 'text-stone-500 line-through'}>{name}</span>
                          </label>
                        );
                      })}
                    </div>
                  );
                })()}

                {(condition.type === 'max_characters' || condition.type === 'characters_alive') && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-stone-400">Characters:</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={condition.params?.characterCount ?? 1}
                      onChange={(e) => {
                        setState(prev => {
                          const newConditions = [...prev.winConditions];
                          newConditions[index] = {
                            ...newConditions[index],
                            params: { ...newConditions[index].params, characterCount: parseInt(e.target.value) || 1 }
                          };
                          return { ...prev, winConditions: newConditions };
                        });
                      }}
                      className="w-20 px-2 py-1 bg-stone-600 rounded text-sm"
                    />
                  </div>
                )}

                {/* Quest text override (2026-07-21): authored text replaces
                    the auto-phrased quest banner label verbatim. */}
                <input
                  type="text"
                  value={condition.customLabel ?? ''}
                  onChange={(e) => {
                    setState(prev => {
                      const newConditions = [...prev.winConditions];
                      newConditions[index] = {
                        ...newConditions[index],
                        customLabel: e.target.value || undefined,
                      };
                      return { ...prev, winConditions: newConditions };
                    });
                  }}
                  placeholder="Custom quest text (optional)"
                  className="w-full mt-1 px-2 py-1 bg-stone-600 rounded text-xs placeholder:text-stone-500"
                  title="Shown verbatim in the quest banner instead of the automatic text"
                />
              </div>

              {/* Remove button (only if more than 1 condition) */}
              {state.winConditions.length > 1 && (
                <button
                  onClick={() => {
                    setState(prev => ({
                      ...prev,
                      winConditions: prev.winConditions.filter((_, i) => i !== index)
                    }));
                  }}
                  className="px-2 py-1 bg-blood-600 rounded text-xs hover:bg-blood-700"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Add condition button */}
        <button
          onClick={() => {
            setState(prev => ({
              ...prev,
              winConditions: [...prev.winConditions, { type: 'defeat_all_enemies' }]
            }));
          }}
          className="w-full px-2 py-1 bg-stone-600 rounded text-xs hover:bg-stone-500"
        >
          + Add Condition
        </button>
      </div>
    </div>

    {/* Par (for Trophy Rating) */}
    <div className="pt-3 border-t border-stone-700">
      <h3 className="text-sm font-semibold mb-2">Par (for Trophy Rating)</h3>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-stone-400 mb-1">Character Par</label>
          <input
            type="number"
            min="1"
            max={state.maxCharacters}
            value={state.parCharacters ?? ''}
            placeholder="Auto"
            onChange={(e) => setState(prev => ({
              ...prev,
              parCharacters: e.target.value ? Number(e.target.value) : undefined
            }))}
            className="w-full px-2 py-1 bg-stone-700 rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-stone-400 mb-1">Turn Par</label>
          <input
            type="number"
            min="1"
            max={state.maxTurns || 100}
            value={state.parTurns ?? ''}
            placeholder="Auto"
            onChange={(e) => setState(prev => ({
              ...prev,
              parTurns: e.target.value ? Number(e.target.value) : undefined
            }))}
            className="w-full px-2 py-1 bg-stone-700 rounded text-sm"
          />
        </div>
      </div>
      <p className="text-xs text-stone-500 mt-1">
        Run validator to auto-suggest. 🏆 Gold = meet both pars.
      </p>
    </div>

    {/* Side Quests (Bonus Objectives) */}
    <div className="pt-3 border-t border-stone-700">
      <h3 className="text-sm font-semibold mb-2">Side Quests (Bonus Objectives)</h3>
      <div className="space-y-2">
        {state.sideQuests.map((quest, index) => (
          <div key={quest.id} className="bg-stone-700 p-2 rounded">
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1 min-w-0 space-y-1">
                {/* Title */}
                <input
                  type="text"
                  value={quest.title}
                  placeholder="Quest title"
                  onChange={(e) => {
                    setState(prev => {
                      const newQuests = [...prev.sideQuests];
                      newQuests[index] = { ...newQuests[index], title: e.target.value };
                      return { ...prev, sideQuests: newQuests };
                    });
                  }}
                  className="w-full px-2 py-1 bg-stone-600 rounded text-sm"
                />

                {/* Type dropdown */}
                <select
                  value={quest.type}
                  onChange={(e) => {
                    setState(prev => {
                      const newQuests = [...prev.sideQuests];
                      newQuests[index] = { ...newQuests[index], type: e.target.value as SideQuestType, params: {} };
                      return { ...prev, sideQuests: newQuests };
                    });
                  }}
                  className="w-full px-2 py-1 bg-stone-600 rounded text-sm"
                >
                  <option value="collect_all_items">Collect All Items</option>
                  <option value="no_damage_taken">No Damage Taken</option>
                  <option value="no_deaths">No Deaths</option>
                  <option value="speed_run">Speed Run (X Turns)</option>
                  <option value="minimalist">Minimalist (X Characters)</option>
                  <option value="use_specific_character">Use Specific Character</option>
                  <option value="avoid_character">Avoid Character</option>
                  <option value="custom">Custom (Manual)</option>
                </select>

                {/* Params for speed_run */}
                {quest.type === 'speed_run' && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-stone-400">Max Turns:</label>
                    <input
                      type="number"
                      min="1"
                      max="999"
                      value={quest.params?.turns ?? 5}
                      onChange={(e) => {
                        setState(prev => {
                          const newQuests = [...prev.sideQuests];
                          newQuests[index] = {
                            ...newQuests[index],
                            params: { ...newQuests[index].params, turns: parseInt(e.target.value) || 5 }
                          };
                          return { ...prev, sideQuests: newQuests };
                        });
                      }}
                      className="w-16 px-2 py-1 bg-stone-600 rounded text-sm"
                    />
                  </div>
                )}

                {/* Params for minimalist */}
                {quest.type === 'minimalist' && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-stone-400">Max Characters:</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={quest.params?.characterCount ?? 1}
                      onChange={(e) => {
                        setState(prev => {
                          const newQuests = [...prev.sideQuests];
                          newQuests[index] = {
                            ...newQuests[index],
                            params: { ...newQuests[index].params, characterCount: parseInt(e.target.value) || 1 }
                          };
                          return { ...prev, sideQuests: newQuests };
                        });
                      }}
                      className="w-16 px-2 py-1 bg-stone-600 rounded text-sm"
                    />
                  </div>
                )}

                {/* Params for use_specific_character / avoid_character */}
                {(quest.type === 'use_specific_character' || quest.type === 'avoid_character') && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-stone-400">Character:</label>
                    <select
                      value={quest.params?.characterId ?? ''}
                      onChange={(e) => {
                        setState(prev => {
                          const newQuests = [...prev.sideQuests];
                          newQuests[index] = {
                            ...newQuests[index],
                            params: { ...newQuests[index].params, characterId: e.target.value }
                          };
                          return { ...prev, sideQuests: newQuests };
                        });
                      }}
                      className="flex-1 px-2 py-1 bg-stone-600 rounded text-sm"
                    >
                      <option value="">Select...</option>
                      {state.availableCharacters.filter(id => getCharacter(id) != null).map(charId => {
                        const char = getCharacter(charId)!;
                        return (
                          <option key={charId} value={charId}>
                            {char.name}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {/* Bonus points */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-stone-400">Bonus Pts:</label>
                  <input
                    type="number"
                    min="0"
                    max="9999"
                    value={quest.bonusPoints}
                    onChange={(e) => {
                      setState(prev => {
                        const newQuests = [...prev.sideQuests];
                        newQuests[index] = { ...newQuests[index], bonusPoints: parseInt(e.target.value) || 0 };
                        return { ...prev, sideQuests: newQuests };
                      });
                    }}
                    className="w-20 px-2 py-1 bg-stone-600 rounded text-sm"
                  />
                </div>
              </div>

              {/* Remove button */}
              <button
                onClick={() => {
                  setState(prev => ({
                    ...prev,
                    sideQuests: prev.sideQuests.filter((_, i) => i !== index)
                  }));
                }}
                className="px-2 py-1 bg-blood-600 rounded text-xs hover:bg-blood-700"
              >
                ✕
              </button>
            </div>
          </div>
        ))}

        {/* Add side quest button */}
        <button
          onClick={() => {
            setState(prev => ({
              ...prev,
              sideQuests: [...prev.sideQuests, {
                id: 'quest_' + Date.now(),
                type: 'collect_all_items',
                title: 'New Quest',
                bonusPoints: 100
              }]
            }));
          }}
          className="w-full px-2 py-1 bg-stone-600 rounded text-xs hover:bg-stone-500"
        >
          + Add Side Quest
        </button>
      </div>
    </div>
  </div>
);
