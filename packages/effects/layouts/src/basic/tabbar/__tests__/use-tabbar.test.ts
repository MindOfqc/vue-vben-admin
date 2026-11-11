import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTabbar } from '../use-tabbar';

const state = vi.hoisted(() => ({
  maximized: { value: false },
  menuList: ['close', 'maximize'],
  push: vi.fn(async () => {}),
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ fullPath: '/current', matched: [], meta: {} }),
  useRouter: () => ({ getRoutes: () => [], push: state.push }),
}));
vi.mock('@vben/hooks', () => ({
  useContentMaximize: () => ({
    contentIsMaximize: state.maximized,
    toggleMaximize: () => {
      state.maximized.value = !state.maximized.value;
    },
  }),
  useTabs: () => ({ getTabDisableState: () => ({}) }),
}));
vi.mock('@vben/icons', () => ({
  ArrowLeftToLine: {},
  ArrowRightLeft: {},
  ArrowRightToLine: {},
  ExternalLink: {},
  FoldHorizontal: {},
  Fullscreen: {},
  Minimize2: {},
  Pin: {},
  PinOff: {},
  RotateCw: {},
  X: {},
}));
vi.mock('@vben/locales', async () => {
  const { ref } = await import('vue');
  return { $t: (key: string) => key, useI18n: () => ({ locale: ref('en') }) };
});
vi.mock('@vben/stores', () => ({
  getTabKey: () => '/current',
  useAccessStore: () => ({ accessMenus: [] }),
  useTabbarStore: () => ({
    addTab: vi.fn(),
    getMenuList: state.menuList,
    getTabs: [],
    setAffixTabs: vi.fn(),
    updateTime: 0,
  }),
}));
vi.mock('@vben/utils', () => ({ filterTree: () => [] }));

describe('tabbar maximize menu', () => {
  beforeEach(() => {
    state.maximized.value = false;
    state.menuList.splice(0, state.menuList.length, 'close', 'maximize');
    state.push.mockClear();
  });

  it('keeps the maximize action available to restore the page', async () => {
    const { createContextMenus } = useTabbar();
    const tab = { fullPath: '/other', meta: {} } as any;
    const maximize = createContextMenus(tab).find(
      (item) => item.key === 'maximize',
    );
    expect(maximize?.text).toBe('preferences.tabbar.contextMenu.maximize');
    await maximize?.handler?.(undefined);
    expect(state.push).toHaveBeenCalledWith('/other');
    expect(state.maximized.value).toBe(true);

    const restore = createContextMenus(tab).find(
      (item) => item.key === 'maximize',
    );
    expect(restore?.text).toBe(
      'preferences.tabbar.contextMenu.restoreMaximize',
    );
    await restore?.handler?.(undefined);
    expect(state.maximized.value).toBe(false);
    expect(state.push).toHaveBeenCalledTimes(1);
  });

  it('honors a custom menu list that excludes maximize in either state', () => {
    state.menuList.splice(0, state.menuList.length, 'close');
    const { createContextMenus } = useTabbar();
    const tab = { fullPath: '/current', meta: {} } as any;
    expect(createContextMenus(tab).map((item) => item.key)).toEqual(['close']);
    state.maximized.value = true;
    expect(createContextMenus(tab).map((item) => item.key)).toEqual(['close']);
  });
});
