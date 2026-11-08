import type { FormRenderProps } from '../src/types';

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { useExpandable } from '../src/form-render/expandable';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('expandable form row measurement', () => {
  it.each([0, 16, 48])(
    'counts the first three rows with a %ipx row gap',
    async (gap) => {
      vi.spyOn(window, 'getComputedStyle').mockImplementation(
        () =>
          ({
            getPropertyValue: (property: string) =>
              property === 'grid-template-rows'
                ? '32px 32px 32px 32px'
                : `${gap}px`,
          }) as CSSStyleDeclaration,
      );
      vi.spyOn(
        HTMLElement.prototype,
        'getBoundingClientRect',
      ).mockImplementation(function (this: HTMLElement) {
        const index = Number(this.dataset.index);
        return {
          top:
            this.dataset.index === undefined
              ? 0
              : Math.floor(index / 3) * (32 + gap),
        } as DOMRect;
      });
      let state: ReturnType<typeof useExpandable> | undefined;
      const Component = defineComponent({
        setup() {
          state = useExpandable({
            collapsedRows: 3,
            showCollapseButton: true,
          } as FormRenderProps);
          return () =>
            h(
              'div',
              { ref: 'wrapperRef' },
              Array.from({ length: 12 }, (_, index) =>
                h('div', { 'data-index': index }),
              ),
            );
        },
      });
      const wrapper = mount(Component);
      await flushPromises();
      expect(state?.isCalculated.value).toBe(true);
      expect(state?.keepFormItemIndex.value).toBe(8);
      wrapper.unmount();
    },
  );
});
