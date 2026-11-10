import type { ViewedRowStorageAdapter } from '../viewed-row/types';

import { describe, expect, it, vi } from 'vitest';

import { useViewedRow } from '../viewed-row';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function createAdapter(
  overrides: Partial<ViewedRowStorageAdapter> = {},
): ViewedRowStorageAdapter {
  return {
    getKeys: vi.fn(async () => []),
    removeKeys: vi.fn(async () => {}),
    setKeys: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('useViewedRow storage restore', () => {
  it('does not restore a cleared mark when an earlier write finishes late', async () => {
    const delayed = createDeferred<null>();
    let stored: Array<number | string> = [];
    const setKeys = vi.fn(async (keys: Array<number | string>) => {
      await delayed.promise;
      stored = keys;
    });
    const adapter = createAdapter({
      removeKeys: vi.fn(async () => {
        stored = [];
      }),
      setKeys,
    });
    const helper = useViewedRow({
      keyField: 'id',
      persist: { type: 'custom', storage: adapter },
    });
    await flush();
    helper.markAsViewed({ id: 1 });
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(setKeys).toHaveBeenCalled();
    helper.clearViewed();
    delayed.resolve(null);
    await flush();
    expect(stored).toEqual([]);
  });
  it('persists a newer mark after a previous write finishes', async () => {
    const delayed = createDeferred<null>();
    let stored: Array<number | string> = [];
    const setKeys = vi.fn(async (keys: Array<number | string>) => {
      if (keys.length === 1) await delayed.promise;
      stored = keys;
    });
    const helper = useViewedRow({
      keyField: 'id',
      persist: { storage: createAdapter({ setKeys }), type: 'custom' },
    });
    await flush();
    helper.markAsViewed({ id: 1 });
    await new Promise((resolve) => setTimeout(resolve, 350));
    helper.markAsViewed({ id: 2 });
    await new Promise((resolve) => setTimeout(resolve, 350));
    delayed.resolve(null);
    await flush();
    expect(stored).toEqual([1, 2]);
  });
  it('does not restore a mark from a pending debounced write after clearing', async () => {
    let stored: Array<number | string> = [];
    const helper = useViewedRow({
      keyField: 'id',
      persist: {
        storage: createAdapter({
          removeKeys: vi.fn(async () => {
            stored = [];
          }),
          setKeys: vi.fn(async (keys) => {
            stored = keys;
          }),
        }),
        type: 'custom',
      },
    });
    await flush();
    helper.markAsViewed({ id: 1 });
    helper.clearViewed();
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(stored).toEqual([]);
  });

  it.each(['reject', 'throw'])(
    'continues clearing after an adapter %s',
    async (mode) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      let stored: Array<number | string> = [1];
      const helper = useViewedRow({
        keyField: 'id',
        persist: {
          storage: createAdapter({
            removeKeys: vi.fn(async () => {
              stored = [];
            }),
            setKeys: vi.fn(() => {
              if (mode === 'throw') throw new Error('write failed');
              return Promise.reject(new Error('write failed'));
            }),
          }),
          type: 'custom',
        },
      });
      await flush();
      helper.markAsViewed({ id: 1 });
      await new Promise((resolve) => setTimeout(resolve, 350));
      helper.clearViewed();
      await flush();
      expect(log).toHaveBeenCalled();
      expect(stored).toEqual([]);
      log.mockRestore();
    },
  );
  it('restores the stored keys once the adapter resolves', async () => {
    const adapter = createAdapter({
      getKeys: vi.fn(async () => [1, 2]),
    });

    const helper = useViewedRow({
      keyField: 'id',
      persist: { storage: adapter, type: 'custom' },
    });
    await flush();

    expect(helper.isViewed({ id: 1 })).toBe(true);
    expect(helper.isViewed({ id: 2 })).toBe(true);
  });

  it('keeps the set empty when it is cleared while the restore is loading', async () => {
    const deferred = createDeferred<Array<number | string>>();
    const adapter = createAdapter({
      getKeys: vi.fn(() => deferred.promise),
    });

    const helper = useViewedRow({
      keyField: 'id',
      persist: { storage: adapter, type: 'custom' },
    });

    helper.clearViewed();
    deferred.resolve([1, 2]);
    await flush();

    expect(helper.viewedSet.value.size).toBe(0);
    expect(helper.isViewed({ id: 1 })).toBe(false);
  });

  it('does not resurrect a key that was removed while the restore is loading', async () => {
    const deferred = createDeferred<Array<number | string>>();
    const adapter = createAdapter({
      getKeys: vi.fn(() => deferred.promise),
    });

    const helper = useViewedRow({
      keyField: 'id',
      persist: { storage: adapter, type: 'custom' },
    });

    helper.markAsViewed({ id: 1 });
    helper.removeKeys([1]);
    deferred.resolve([1, 2]);
    await flush();

    expect(helper.isViewed({ id: 1 })).toBe(false);
    expect(helper.isViewed({ id: 2 })).toBe(true);
  });

  it('still merges the stored keys with keys marked while the restore is loading', async () => {
    const deferred = createDeferred<Array<number | string>>();
    const adapter = createAdapter({
      getKeys: vi.fn(() => deferred.promise),
    });

    const helper = useViewedRow({
      keyField: 'id',
      persist: { storage: adapter, type: 'custom' },
    });

    helper.markAsViewed({ id: 3 });
    deferred.resolve([1, 2]);
    await flush();

    expect(helper.viewedSet.value.size).toBe(3);
    expect(helper.isViewed({ id: 1 })).toBe(true);
    expect(helper.isViewed({ id: 3 })).toBe(true);
  });

  it('drops the initial viewedKeys merge when the set is cleared during the restore', async () => {
    const deferred = createDeferred<Array<number | string>>();
    const adapter = createAdapter({
      getKeys: vi.fn(() => deferred.promise),
    });

    const helper = useViewedRow({
      keyField: 'id',
      persist: { storage: adapter, type: 'custom' },
      viewedKeys: [1],
    });

    helper.clearViewed();
    deferred.resolve([1, 2]);
    await flush();

    expect(helper.viewedSet.value.size).toBe(0);
    expect(helper.isViewed({ id: 1 })).toBe(false);
  });

  it('skips removed keys in the initial viewedKeys merge', async () => {
    const deferred = createDeferred<Array<number | string>>();
    const adapter = createAdapter({
      getKeys: vi.fn(() => deferred.promise),
    });

    const helper = useViewedRow({
      keyField: 'id',
      persist: { storage: adapter, type: 'custom' },
      viewedKeys: [1, 2],
    });

    helper.removeKeys([1]);
    deferred.resolve([1, 2]);
    await flush();

    expect(helper.isViewed({ id: 1 })).toBe(false);
    expect(helper.isViewed({ id: 2 })).toBe(true);
  });

  it('persists the removal of a key that only exists in the pending snapshot', async () => {
    const deferred = createDeferred<Array<number | string>>();
    const stored: Array<number | string> = [1];
    const setKeys = vi.fn(async (keys: Array<number | string>) => {
      stored.splice(0, stored.length, ...keys);
    });
    const adapter = createAdapter({
      getKeys: vi.fn(() => deferred.promise),
      setKeys,
    });

    const helper = useViewedRow({
      keyField: 'id',
      persist: { storage: adapter, type: 'custom' },
    });

    helper.removeKeys([1]);
    deferred.resolve([1, 2]);
    await flush();

    expect(helper.isViewed({ id: 1 })).toBe(false);
    expect(helper.isViewed({ id: 2 })).toBe(true);
    expect(setKeys).toHaveBeenCalled();
    expect(stored).not.toContain(1);
  });
});
