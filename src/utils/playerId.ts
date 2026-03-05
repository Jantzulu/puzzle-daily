const PLAYER_ID_KEY = 'puzzle_daily_player_id';

/**
 * Get or create a persistent anonymous player ID.
 * Stored in localStorage, generated once per browser.
 */
export function getPlayerId(): string {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}
