/**
 * lockBodyScroll — the lock lives on <html> (html's `overflow-x: clip` keeps
 * the viewport's scrolling there; a body lock stopped nothing, kept the
 * scrollbar, and its padding shifted the page left), reserves the scrollbar's
 * gutter only while a scrollbar shows, and restores exactly what it found.
 * Node environment: a minimal document/window/CSS stub stands in.
 */
import { vi } from 'vitest';

type Style = Record<string, string>;

const setup = (opts: { innerWidth: number; clientWidth: number; gutterSupported?: boolean; rootStyle?: Style }) => {
  const root = { style: { overflow: '', scrollbarGutter: '', ...opts.rootStyle } as Style, clientWidth: opts.clientWidth };
  const body = { style: { overflow: '', paddingRight: '' } as Style };
  vi.stubGlobal('document', { documentElement: root, body });
  vi.stubGlobal('window', { innerWidth: opts.innerWidth });
  vi.stubGlobal('CSS', { supports: () => opts.gutterSupported ?? true });
  return { root, body };
};

let lockBodyScroll: typeof import('../scrollLock').lockBodyScroll;

beforeEach(async () => {
  vi.resetModules(); // fresh refcount per test
  ({ lockBodyScroll } = await import('../scrollLock'));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lockBodyScroll', () => {
  it('locks the root, never the body (a hidden body would trap sticky children)', () => {
    const { root, body } = setup({ innerWidth: 1280, clientWidth: 1265 });
    const release = lockBodyScroll();
    expect(root.style.overflow).toBe('hidden');
    expect(body.style.overflow).toBe('');
    release();
    expect(root.style.overflow).toBe('');
  });

  it('with a desktop scrollbar showing: keeps its gutter reserved, adds no padding', () => {
    const { root, body } = setup({ innerWidth: 1280, clientWidth: 1265 });
    const release = lockBodyScroll();
    expect(root.style.scrollbarGutter).toBe('stable');
    expect(body.style.paddingRight).toBe('');
    release();
    expect(root.style.scrollbarGutter).toBe('');
  });

  it('with no scrollbar (short page, overlay scrollbars): reserves nothing', () => {
    const { root, body } = setup({ innerWidth: 1280, clientWidth: 1280 });
    lockBodyScroll();
    expect(root.style.scrollbarGutter).toBe('');
    expect(body.style.paddingRight).toBe('');
  });

  it('without scrollbar-gutter support: pads the body by the scrollbar width instead', () => {
    const { root, body } = setup({ innerWidth: 1280, clientWidth: 1265, gutterSupported: false });
    const release = lockBodyScroll();
    expect(root.style.scrollbarGutter).toBe('');
    expect(body.style.paddingRight).toBe('15px');
    release();
    expect(body.style.paddingRight).toBe('');
  });

  it('stacked locks hold until the last release; a release is idempotent', () => {
    const { root } = setup({ innerWidth: 1280, clientWidth: 1265 });
    const outer = lockBodyScroll();
    const inner = lockBodyScroll();
    inner();
    inner();
    expect(root.style.overflow).toBe('hidden');
    outer();
    expect(root.style.overflow).toBe('');
  });

  it('restores the inline values it found, not blanks', () => {
    const { root } = setup({ innerWidth: 1280, clientWidth: 1265, rootStyle: { overflow: 'auto', scrollbarGutter: 'auto' } });
    const release = lockBodyScroll();
    release();
    expect(root.style.overflow).toBe('auto');
    expect(root.style.scrollbarGutter).toBe('auto');
  });
});
