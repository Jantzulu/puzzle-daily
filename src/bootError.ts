// Last-resort message when the app can't start (before React exists).
// Plain DOM on purpose: nothing else has loaded yet.
export function showBootError(error: unknown): void {
  console.error('[boot] failed to start:', error);
  const root = document.getElementById('root');
  if (!root) return;
  root.textContent = '';
  const box = document.createElement('div');
  box.style.cssText = 'max-width:32rem;margin:20vh auto 0;padding:1rem;font:16px/1.5 system-ui,sans-serif;color:#f2e0b5;text-align:center';
  const title = document.createElement('p');
  title.textContent = "The game couldn't open its saved data on this device.";
  const hint = document.createElement('p');
  hint.textContent = 'Reloading usually fixes it. If it keeps happening, close other tabs of this site and try again.';
  hint.style.opacity = '0.8';
  const button = document.createElement('button');
  button.textContent = 'Reload';
  button.style.cssText = 'margin-top:1rem;padding:0.5rem 1.25rem;font:inherit;color:#1a1410;background:#d4a574;border:0;border-radius:4px;cursor:pointer';
  button.onclick = () => window.location.reload();
  box.append(title, hint, button);
  root.append(box);
}
