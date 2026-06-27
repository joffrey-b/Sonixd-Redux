declare module 'pako' {
  function deflate(data: string | Uint8Array, options?: { level?: number }): Uint8Array;
  function inflate(data: Uint8Array, options: { to: 'string' }): string;
  function inflate(data: Uint8Array, options?: { to?: undefined }): Uint8Array;
  export { deflate, inflate };
}
