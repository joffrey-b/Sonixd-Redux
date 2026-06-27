/**
 * Global asset type declarations.
 *
 * TypeScript 6 with moduleResolution "bundler" requires explicit declarations
 * for non-JS side-effect imports (CSS, LESS, images, etc.).
 * These stubs satisfy the type checker; webpack handles the actual transforms.
 */

declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}

declare module '*.less' {
  const content: Record<string, string>;
  export default content;
}

declare module '*.scss' {
  const content: Record<string, string>;
  export default content;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}
