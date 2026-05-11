type Cancelable = { cancel: () => void };

/**
 * Runs `callback` when the runtime considers the thread idle (React Native 0.83+).
 * Replaces deprecated `InteractionManager.runAfterInteractions` for deferring non-urgent work.
 */
export function scheduleWhenIdle(callback: () => void, options?: { timeout?: number }): Cancelable {
  const timeout = options?.timeout ?? 800;
  const g = globalThis as typeof globalThis & {
    requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  if (typeof g.requestIdleCallback === 'function') {
    const id = g.requestIdleCallback(() => callback(), { timeout });
    return {
      cancel: () => {
        if (typeof g.cancelIdleCallback === 'function') g.cancelIdleCallback(id);
      },
    };
  }

  const t = setTimeout(callback, 0);
  return { cancel: () => clearTimeout(t) };
}

/**
 * Runs after the next paint (double rAF + microtask delay). Use for navigation right after
 * cold start / notification tap so the native activity is stable — without deprecated
 * `InteractionManager.runAfterInteractions`.
 */
export function runAfterNextPaint(callback: () => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      setTimeout(callback, 0);
    });
  });
}
