// Generator Dialog - UI for puzzle generation parameters
import React, { useState, useCallback } from 'react';
import {
  generatePuzzle,
  validateGenerationParams,
  getDifficultyPreset,
  type GenerationParameters,
  type GenerationProgress,
  type GenerationResult,
  type DifficultyLevel,
  type EnemyConfig,
} from '../../engine/puzzleGenerator';
import type { Puzzle, WinCondition, CustomTileType } from '../../types/game';
import type { CharacterWithSprite } from '../../data/characters';
import type { EnemyWithSprite } from '../../data/enemies';

interface GeneratorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (puzzle: Puzzle) => void;
  availableCharacters: CharacterWithSprite[];
  availableEnemies: EnemyWithSprite[];
  customTileTypes: CustomTileType[];
}

const DIFFICULTY_LEVELS: DifficultyLevel[] = ['easy', 'medium', 'hard', 'expert'];

const GeneratorDialog: React.FC<GeneratorDialogProps> = ({
  isOpen,
  onClose,
  onGenerate,
  availableCharacters,
  availableEnemies,
  customTileTypes,
}) => {
  // Generation parameters state
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [width, setWidth] = useState(8);
  const [height, setHeight] = useState(8);
  const [maxCharacters, setMaxCharacters] = useState(3);
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>(
    availableCharacters.slice(0, 1).map(c => c.id)
  );
  const [enemyConfigs, setEnemyConfigs] = useState<EnemyConfig[]>([]);
  const [enableVoidTiles, setEnableVoidTiles] = useState(false);
  const [selectedTileTypes, setSelectedTileTypes] = useState<string[]>([]);
  const [winCondition, setWinCondition] = useState<'defeat_all_enemies' | 'defeat_boss'>('defeat_all_enemies');

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);

  // Apply difficulty preset
  const applyDifficultyPreset = useCallback((level: DifficultyLevel) => {
    setDifficulty(level);
    const preset = getDifficultyPreset(level);
    if (preset.width) setWidth(preset.width);
    if (preset.height) setHeight(preset.height);
    if (preset.maxCharacters) setMaxCharacters(preset.maxCharacters);
    setEnableVoidTiles(preset.enableVoidTiles ?? false);
  }, []);

  // Toggle character selection
  const toggleCharacter = useCallback((charId: string) => {
    setSelectedCharacters(prev =>
      prev.includes(charId)
        ? prev.filter(id => id !== charId)
        : [...prev, charId]
    );
  }, []);

  // Add enemy config
  const addEnemyConfig = useCallback(() => {
    if (availableEnemies.length > 0) {
      setEnemyConfigs(prev => [
        ...prev,
        { enemyId: availableEnemies[0].id, count: 1, placement: 'random' },
      ]);
    }
  }, [availableEnemies]);

  // Update enemy config
  const updateEnemyConfig = useCallback((index: number, updates: Partial<EnemyConfig>) => {
    setEnemyConfigs(prev => {
      const newConfigs = [...prev];
      newConfigs[index] = { ...newConfigs[index], ...updates };
      return newConfigs;
    });
  }, []);

  // Remove enemy config
  const removeEnemyConfig = useCallback((index: number) => {
    setEnemyConfigs(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Toggle special tile type
  const toggleTileType = useCallback((tileId: string) => {
    setSelectedTileTypes(prev =>
      prev.includes(tileId)
        ? prev.filter(id => id !== tileId)
        : [...prev, tileId]
    );
  }, []);

  // Handle generation
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    setResult(null);

    const params: GenerationParameters = {
      width,
      height,
      availableCharacters: selectedCharacters,
      maxCharacters,
      enemyTypes: enemyConfigs,
      difficulty,
      enabledTileTypes: selectedTileTypes,
      enableVoidTiles,
      winConditions: [{ type: winCondition }] as WinCondition[],
      maxTurns: 200,
      lives: 3,
      skinId: 'builtin_dungeon',
    };

    // Validate first
    const validationErrors = validateGenerationParams(params);
    if (validationErrors.length > 0) {
      setError(validationErrors.join('; '));
      setIsGenerating(false);
      return;
    }

    try {
      const genResult = await generatePuzzle(params, {
        maxAttempts: 10,
        progressCallback: setProgress,
      });

      setResult(genResult);

      if (genResult.success && genResult.puzzle) {
        // Auto-close and load the puzzle
        onGenerate(genResult.puzzle);
        onClose();
      } else {
        setError(genResult.error || 'Generation failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    }

    setIsGenerating(false);
    setProgress(null);
  }, [
    width, height, selectedCharacters, maxCharacters, enemyConfigs,
    difficulty, selectedTileTypes, enableVoidTiles, winCondition,
    onGenerate, onClose
  ]);

  if (!isOpen) return null;

  const totalEnemies = enemyConfigs.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-stone-800 rounded-lg p-6 max-w-2xl w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-parchment-100">Generate Puzzle</h2>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="text-stone-400 hover:text-parchment-100 text-xl disabled:opacity-50"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="space-y-5">
          {/* Difficulty Selection */}
          <div>
            <label className="block text-sm font-medium text-parchment-300 mb-2">Difficulty</label>
            <div className="flex gap-2">
              {DIFFICULTY_LEVELS.map(level => (
                <button
                  key={level}
                  onClick={() => applyDifficultyPreset(level)}
                  disabled={isGenerating}
                  className={`px-4 py-2 rounded capitalize text-sm font-medium transition-colors
                    ${difficulty === level
                      ? 'bg-amber-600 text-white'
                      : 'bg-stone-700 text-stone-300 hover:bg-stone-600'
                    } disabled:opacity-50`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Map Size */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-parchment-300 mb-1">Width</label>
              <input
                type="number"
                min={4}
                max={20}
                value={width}
                onChange={e => setWidth(Math.max(4, Math.min(20, parseInt(e.target.value) || 4)))}
                disabled={isGenerating}
                className="w-full px-3 py-2 bg-stone-700 border border-stone-600 rounded text-parchment-100
                  focus:outline-none focus:border-amber-500 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-parchment-300 mb-1">Height</label>
              <input
                type="number"
                min={4}
                max={20}
                value={height}
                onChange={e => setHeight(Math.max(4, Math.min(20, parseInt(e.target.value) || 4)))}
                disabled={isGenerating}
                className="w-full px-3 py-2 bg-stone-700 border border-stone-600 rounded text-parchment-100
                  focus:outline-none focus:border-amber-500 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Characters */}
          <div>
            <label className="block text-sm font-medium text-parchment-300 mb-2">
              Available Characters ({selectedCharacters.length} selected)
            </label>
            <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto bg-stone-700/50 p-2 rounded">
              {availableCharacters.map(char => (
                <button
                  key={char.id}
                  onClick={() => toggleCharacter(char.id)}
                  disabled={isGenerating}
                  className={`px-3 py-1 rounded text-sm transition-colors
                    ${selectedCharacters.includes(char.id)
                      ? 'bg-green-600 text-white'
                      : 'bg-stone-600 text-stone-300 hover:bg-stone-500'
                    } disabled:opacity-50`}
                >
                  {char.name}
                </button>
              ))}
            </div>
            <div className="mt-2">
              <label className="block text-xs text-stone-400 mb-1">Max Characters (1-4)</label>
              <input
                type="range"
                min={1}
                max={4}
                value={maxCharacters}
                onChange={e => setMaxCharacters(parseInt(e.target.value))}
                disabled={isGenerating}
                className="w-32 disabled:opacity-50"
              />
              <span className="ml-2 text-parchment-100 font-bold">{maxCharacters}</span>
            </div>
          </div>

          {/* Enemies */}
          <div>
            <label className="block text-sm font-medium text-parchment-300 mb-2">
              Enemies ({totalEnemies} total)
            </label>
            <div className="space-y-2 max-h-32 overflow-y-auto bg-stone-700/50 p-2 rounded">
              {enemyConfigs.map((config, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    value={config.enemyId}
                    onChange={e => updateEnemyConfig(index, { enemyId: e.target.value })}
                    disabled={isGenerating}
                    className="flex-1 px-2 py-1 bg-stone-600 border border-stone-500 rounded text-sm text-parchment-100
                      disabled:opacity-50"
                  >
                    {availableEnemies.map(enemy => (
                      <option key={enemy.id} value={enemy.id}>{enemy.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={config.count}
                    onChange={e => updateEnemyConfig(index, { count: Math.max(1, parseInt(e.target.value) || 1) })}
                    disabled={isGenerating}
                    className="w-16 px-2 py-1 bg-stone-600 border border-stone-500 rounded text-sm text-parchment-100
                      disabled:opacity-50"
                  />
                  <select
                    value={config.placement || 'random'}
                    onChange={e => updateEnemyConfig(index, { placement: e.target.value as EnemyConfig['placement'] })}
                    disabled={isGenerating}
                    className="w-24 px-2 py-1 bg-stone-600 border border-stone-500 rounded text-sm text-parchment-100
                      disabled:opacity-50"
                  >
                    <option value="random">Random</option>
                    <option value="clustered">Clustered</option>
                    <option value="spread">Spread</option>
                  </select>
                  <button
                    onClick={() => removeEnemyConfig(index)}
                    disabled={isGenerating}
                    className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-sm disabled:opacity-50"
                  >
                    ×
                  </button>
                </div>
              ))}
              {enemyConfigs.length === 0 && (
                <div className="text-stone-500 text-sm text-center py-2">No enemies added</div>
              )}
            </div>
            <button
              onClick={addEnemyConfig}
              disabled={isGenerating || availableEnemies.length === 0}
              className="mt-2 px-3 py-1 bg-stone-600 hover:bg-stone-500 rounded text-sm text-parchment-100
                disabled:opacity-50"
            >
              + Add Enemy
            </button>
          </div>

          {/* Win Condition */}
          <div>
            <label className="block text-sm font-medium text-parchment-300 mb-2">Win Condition</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={winCondition === 'defeat_all_enemies'}
                  onChange={() => setWinCondition('defeat_all_enemies')}
                  disabled={isGenerating}
                  className="text-amber-500 disabled:opacity-50"
                />
                <span className="text-sm text-parchment-100">Defeat All Enemies</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={winCondition === 'defeat_boss'}
                  onChange={() => setWinCondition('defeat_boss')}
                  disabled={isGenerating}
                  className="text-amber-500 disabled:opacity-50"
                />
                <span className="text-sm text-parchment-100">Defeat Boss</span>
              </label>
            </div>
          </div>

          {/* Special Options */}
          <div className="border-t border-stone-600 pt-4">
            <label className="block text-sm font-medium text-parchment-300 mb-2">Special Options</label>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableVoidTiles}
                  onChange={e => setEnableVoidTiles(e.target.checked)}
                  disabled={isGenerating}
                  className="text-amber-500 disabled:opacity-50"
                />
                <span className="text-sm text-parchment-100">Enable Void Tiles (non-rectangular shapes)</span>
              </label>

              {customTileTypes.length > 0 && (
                <div>
                  <label className="block text-xs text-stone-400 mb-1">Special Tile Types</label>
                  <div className="flex flex-wrap gap-2">
                    {customTileTypes.slice(0, 10).map(tileType => (
                      <button
                        key={tileType.id}
                        onClick={() => toggleTileType(tileType.id)}
                        disabled={isGenerating}
                        className={`px-2 py-1 rounded text-xs transition-colors
                          ${selectedTileTypes.includes(tileType.id)
                            ? 'bg-purple-600 text-white'
                            : 'bg-stone-600 text-stone-300 hover:bg-stone-500'
                          } disabled:opacity-50`}
                      >
                        {tileType.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-900/30 border border-red-700 rounded p-3 text-sm">
              <span className="font-semibold text-red-400">Error: </span>
              <span className="text-red-200">{error}</span>
            </div>
          )}

          {/* Progress Display */}
          {isGenerating && progress && (
            <div className="bg-stone-700/50 rounded p-3 text-center">
              <div className="text-parchment-100 mb-1">
                {progress.message || `${progress.phase === 'generating' ? 'Generating' : 'Validating'}...`}
              </div>
              <div className="text-xs text-stone-400">
                Attempt {progress.attempt} of {progress.maxAttempts}
              </div>
            </div>
          )}

          {/* Success Display */}
          {result?.success && result.validationResult && (
            <div className="bg-green-900/30 border border-green-700 rounded p-3 text-sm">
              <div className="font-semibold text-green-400 mb-1">Puzzle Generated!</div>
              <div className="text-stone-300">
                Solved in {result.attemptsUsed} attempt(s), {(result.generationTimeMs / 1000).toFixed(2)}s
              </div>
              <div className="text-stone-300">
                Min characters: {result.validationResult.minCharactersNeeded},
                Optimal turns: {result.validationResult.solutionFound?.turnsToWin}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-stone-600">
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="px-4 py-2 bg-stone-600 hover:bg-stone-500 rounded text-parchment-100
              disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || selectedCharacters.length === 0 || totalEnemies === 0}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 rounded text-white font-medium
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span> Generating...
              </span>
            ) : (
              'Generate Puzzle'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GeneratorDialog;
