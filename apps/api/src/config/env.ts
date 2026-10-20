/**
 * Centralized, typed access to environment variables with defaults.
 */
function str(name: string, def = ''): string {
  const v = process.env[name];
  return v === undefined || v === '' ? def : v;
}
function num(name: string, def: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && process.env[name] !== undefined && process.env[name] !== '' ? v : def;
}

export const env = {
  get nodeEnv() {
    return str('NODE_ENV', 'development');
  },
  get isProd() {
    return this.nodeEnv === 'production';
  },
  get apiPort() {
    return num('API_PORT', 4000);
  },
  get appDomain() {
    return str('APP_DOMAIN', 'localhost');
  },
  get appUrl() {
    return str('APP_URL', `https://${this.appDomain}`);
  },
  get publicIp() {
    return str('PUBLIC_IP', '127.0.0.1');
  },
  get databaseUrl() {
    return str('DATABASE_URL');
  },
  get redisUrl() {
    return str('REDIS_URL', 'redis://localhost:6379');
  },
  get jwtSecret() {
    return str('JWT_SECRET', 'dev-insecure-jwt-secret-change-me');
  },
  get jwtRefreshSecret() {
    return str('JWT_REFRESH_SECRET', `${this.jwtSecret}-refresh`);
  },
  get jwtExpiresIn() {
    return str('JWT_EXPIRES_IN', '15m');
  },
  get jwtRefreshExpiresIn() {
    return str('JWT_REFRESH_EXPIRES_IN', '7d');
  },
  get secretsEncryptionKey() {
    return str('SECRETS_ENCRYPTION_KEY');
  },
  get amiHost() {
    return str('AMI_HOST', 'localhost');
  },
  get amiPort() {
    return num('AMI_PORT', 5038);
  },
  get amiUser() {
    return str('AMI_USER', 'ura');
  },
  get amiPassword() {
    return str('AMI_PASSWORD', '');
  },
  get ariUrl() {
    return str('ARI_URL', 'http://localhost:8088/ari');
  },
  get ariUser() {
    return str('ARI_USER', 'ura');
  },
  get ariPassword() {
    return str('ARI_PASSWORD', '');
  },
  get asteriskConfigDir() {
    return str('ASTERISK_CONFIG_DIR', '/etc/asterisk/tenants');
  },
  get asteriskSoundsDir() {
    return str('ASTERISK_SOUNDS_DIR', '/var/lib/asterisk/sounds/custom');
  },
  get recordingsDir() {
    return str('RECORDINGS_DIR', '/var/spool/asterisk/monitor');
  },
  get turnRealm() {
    return str('TURN_REALM', this.appDomain);
  },
  get turnUser() {
    return str('TURN_USER', 'ura');
  },
  get turnPassword() {
    return str('TURN_PASSWORD', '');
  },
  get defaultLocale() {
    return str('DEFAULT_LOCALE', 'pt-BR');
  },
  get superadminEmail() {
    return str('SUPERADMIN_EMAIL', 'admin@exemplo.com.br');
  },
  get superadminPassword() {
    return str('SUPERADMIN_PASSWORD', 'Admin@123');
  },
  get corsOrigin() {
    return str('CORS_ORIGIN', '');
  },
};

/** Parses durations like "15m", "7d", "3600" (seconds) into seconds. */
export function durationToSeconds(v: string, def: number): number {
  const m = /^(\d+)\s*([smhd]?)$/.exec(v.trim());
  if (!m) return def;
  const n = Number(m[1]);
  const unit = m[2] || 's';
  const mult: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * (mult[unit] ?? 1);
}
