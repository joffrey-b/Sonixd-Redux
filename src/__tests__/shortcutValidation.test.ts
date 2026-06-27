import { captureKey, formatKey } from '../components/settings/ConfigPanels/KeyboardShortcutsConfig';

// ─── Helper to create fake keyboard events ────────────────────────────────────

const fakeEvent = (
  key: string,
  modifiers: { ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean } = {}
): React.KeyboardEvent =>
  ({
    key,
    ctrlKey: modifiers.ctrlKey ?? false,
    altKey: modifiers.altKey ?? false,
    shiftKey: modifiers.shiftKey ?? false,
    metaKey: modifiers.metaKey ?? false,
    preventDefault: jest.fn(),
  }) as unknown as React.KeyboardEvent;

// ─── captureKey ───────────────────────────────────────────────────────────────

describe('captureKey', () => {
  it('returns lowercase letter for a plain letter key', () => {
    expect(captureKey(fakeEvent('a'))).toBe('a');
    expect(captureKey(fakeEvent('z'))).toBe('z');
  });

  it('returns null for modifier-only presses (Control)', () => {
    expect(captureKey(fakeEvent('Control', { ctrlKey: true }))).toBeNull();
  });

  it('returns null for modifier-only presses (Alt)', () => {
    expect(captureKey(fakeEvent('Alt', { altKey: true }))).toBeNull();
  });

  it('returns null for modifier-only presses (Shift)', () => {
    expect(captureKey(fakeEvent('Shift', { shiftKey: true }))).toBeNull();
  });

  it('returns null for modifier-only presses (Meta)', () => {
    expect(captureKey(fakeEvent('Meta', { metaKey: true }))).toBeNull();
  });

  it('returns null for Escape key (cancel)', () => {
    expect(captureKey(fakeEvent('Escape'))).toBeNull();
  });

  it('includes ctrl modifier prefix', () => {
    expect(captureKey(fakeEvent('a', { ctrlKey: true }))).toBe('ctrl+a');
  });

  it('includes alt modifier prefix', () => {
    expect(captureKey(fakeEvent('b', { altKey: true }))).toBe('alt+b');
  });

  it('includes shift modifier prefix', () => {
    expect(captureKey(fakeEvent('c', { shiftKey: true }))).toBe('shift+c');
  });

  it('includes multiple modifiers in order ctrl+alt+shift+meta', () => {
    const result = captureKey(fakeEvent('x', { ctrlKey: true, shiftKey: true }));
    expect(result).toBe('ctrl+shift+x');
  });

  it('preserves F-key case (F1, F12)', () => {
    expect(captureKey(fakeEvent('F1'))).toBe('F1');
    expect(captureKey(fakeEvent('F12'))).toBe('F12');
  });

  it('F-key with modifiers includes the modifier prefix', () => {
    expect(captureKey(fakeEvent('F5', { ctrlKey: true }))).toBe('ctrl+F5');
  });

  it('maps space to "space"', () => {
    expect(captureKey(fakeEvent(' '))).toBe('space');
  });

  it('maps Delete to "del"', () => {
    expect(captureKey(fakeEvent('Delete'))).toBe('del');
  });

  it('maps ArrowLeft to "left"', () => {
    expect(captureKey(fakeEvent('ArrowLeft'))).toBe('left');
  });

  it('maps ArrowRight to "right"', () => {
    expect(captureKey(fakeEvent('ArrowRight'))).toBe('right');
  });

  it('maps ArrowUp to "up"', () => {
    expect(captureKey(fakeEvent('ArrowUp'))).toBe('up');
  });

  it('maps ArrowDown to "down"', () => {
    expect(captureKey(fakeEvent('ArrowDown'))).toBe('down');
  });

  it('calls preventDefault on the event', () => {
    const e = fakeEvent('a');
    captureKey(e);
    expect(e.preventDefault).toHaveBeenCalled();
  });
});

// ─── formatKey ────────────────────────────────────────────────────────────────

describe('formatKey', () => {
  it('formats a plain letter key as uppercase', () => {
    expect(formatKey('a')).toBe('A');
    expect(formatKey('z')).toBe('Z');
  });

  it('formats ctrl as "Ctrl"', () => {
    expect(formatKey('ctrl+a')).toBe('Ctrl + A');
  });

  it('formats alt as "Alt"', () => {
    expect(formatKey('alt+b')).toBe('Alt + B');
  });

  it('formats shift as "Shift"', () => {
    expect(formatKey('shift+c')).toBe('Shift + C');
  });

  it('formats meta as "Meta"', () => {
    expect(formatKey('meta+d')).toBe('Meta + D');
  });

  it('formats del as "Delete"', () => {
    expect(formatKey('del')).toBe('Delete');
  });

  it('formats backspace as "Backspace"', () => {
    expect(formatKey('backspace')).toBe('Backspace');
  });

  it('formats left as left arrow symbol', () => {
    expect(formatKey('left')).toBe('←');
  });

  it('formats right as right arrow symbol', () => {
    expect(formatKey('right')).toBe('→');
  });

  it('formats up as up arrow symbol', () => {
    expect(formatKey('up')).toBe('↑');
  });

  it('formats down as down arrow symbol', () => {
    expect(formatKey('down')).toBe('↓');
  });

  it('formats space as "Space"', () => {
    expect(formatKey('space')).toBe('Space');
  });

  it('formats esc as "Esc"', () => {
    expect(formatKey('esc')).toBe('Esc');
    expect(formatKey('escape')).toBe('Esc');
  });

  it('formats F-keys preserving case', () => {
    expect(formatKey('F1')).toBe('F1');
    expect(formatKey('F12')).toBe('F12');
  });

  it('formats a multi-modifier combo correctly', () => {
    expect(formatKey('ctrl+shift+del')).toBe('Ctrl + Shift + Delete');
  });
});
