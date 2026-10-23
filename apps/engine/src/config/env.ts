import { z } from 'zod';

export const env = z
  .object({
    NODE_ENV: z.string().default('development'),
    DATABASE_URL: z.string(),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    ARI_URL: z.string().default('http://localhost:8088/ari'),
    ARI_USER: z.string().default('ura'),
    ARI_PASSWORD: z.string().default(''),
    ARI_APP: z.string().default('ura-engine'),
    ASTERISK_SOUNDS_DIR: z.string().default('/var/lib/asterisk/sounds/custom'),
    RECORDINGS_DIR: z.string().default('/var/spool/asterisk/recording'),
    SECRETS_ENCRYPTION_KEY: z.string().min(64),
    DEFAULT_LOCALE: z.string().default('pt-BR'),
  })
  .parse(process.env);
