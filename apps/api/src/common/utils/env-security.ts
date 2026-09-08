const WEAK_SECRETS = new Set(['dev-secret', 'secret', 'changeme', 'password']);

export function requireJwtSecret(
  name: string,
  value: string | undefined,
  nodeEnv: string | undefined,
) {
  const env = nodeEnv || 'development';
  if (env === 'development' || env === 'test') {
    return value && value.length > 0 ? value : 'dev-secret';
  }
  if (!value || value.length < 32 || WEAK_SECRETS.has(value)) {
    throw new Error(
      `${name} must be set to a secret of at least 32 characters in ${env}`,
    );
  }
  return value;
}

export function resolveCorsOrigin(
  corsOrigin: string | undefined,
  nodeEnv: string | undefined,
): string[] | boolean {
  if (corsOrigin && corsOrigin.trim()) {
    const list = corsOrigin
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return list.length ? list : false;
  }
  if (nodeEnv === 'production') {
    return false;
  }
  return ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost'];
}

export function assertProductionSecrets(env: NodeJS.ProcessEnv) {
  const nodeEnv = env.NODE_ENV || 'development';
  requireJwtSecret('JWT_ACCESS_SECRET', env.JWT_ACCESS_SECRET, nodeEnv);
  requireJwtSecret('JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET, nodeEnv);
}
