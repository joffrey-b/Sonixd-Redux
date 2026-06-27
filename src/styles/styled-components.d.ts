/**
 * Augment styled-components DefaultTheme with the project's theme shape.
 *
 * styled-components v6 bundles its own types and requires an explicit
 * DefaultTheme declaration so that `props.theme` is typed in every styled
 * component template literal.
 *
 * The theme system supports user-created themes with arbitrary extra keys
 * (image, info, hover, etc.) inside `colors.card` and `other.card`, so the
 * nested structures are typed as `Record<string, any>` rather than being
 * inferred from the default theme alone.
 *
 * The top-level import is required to make this a *module augmentation*
 * (not an ambient module replacement that would erase all styled-components exports).
 */
import type {} from 'styled-components';

declare module 'styled-components' {
  export interface DefaultTheme {
    label?: string;
    value?: string;
    /** 'light' | 'dark' — set at runtime by ThemeProvider */
    type?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- user themes have arbitrary nested keys; Record<string,unknown> breaks deep property access chains in App.tsx
    fonts: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same as above
    colors: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same as above
    other: Record<string, any>;
  }
}
