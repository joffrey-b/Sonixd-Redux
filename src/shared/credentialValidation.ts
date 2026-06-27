export interface CredentialPayload {
  server: string;
  serverBase64: string;
  serverType: string;
  username: string;
  hash?: string;
  salt?: string;
  userId?: string;
  token?: string;
  deviceId?: string;
  legacyAuth?: boolean;
  password?: string;
}

const ALLOWED_PROTOCOLS = ['http:', 'https:'];

export function validateCredentials(payload: unknown): CredentialPayload | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const p = payload as Record<string, unknown>;

  if (!p.server || typeof p.server !== 'string' || p.server.trim() === '') return null;
  if (!p.serverBase64 || typeof p.serverBase64 !== 'string') return null;
  if (!p.serverType || typeof p.serverType !== 'string') return null;
  if (!p.username || typeof p.username !== 'string' || p.username.trim() === '') return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(p.server);
  } catch {
    return null;
  }

  if (!ALLOWED_PROTOCOLS.includes(parsedUrl.protocol)) return null;

  return {
    server: p.server,
    serverBase64: p.serverBase64,
    serverType: p.serverType,
    username: p.username,
    hash: typeof p.hash === 'string' ? p.hash : undefined,
    salt: typeof p.salt === 'string' ? p.salt : undefined,
    userId: typeof p.userId === 'string' ? p.userId : undefined,
    token: typeof p.token === 'string' ? p.token : undefined,
    deviceId: typeof p.deviceId === 'string' ? p.deviceId : undefined,
    legacyAuth: typeof p.legacyAuth === 'boolean' ? p.legacyAuth : undefined,
    password: typeof p.password === 'string' ? p.password : undefined,
  };
}

export function shouldStorePassword(payload: CredentialPayload): boolean {
  return (
    payload.legacyAuth === true &&
    typeof payload.password === 'string' &&
    payload.password.length > 0
  );
}
