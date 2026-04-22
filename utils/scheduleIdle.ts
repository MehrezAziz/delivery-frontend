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
