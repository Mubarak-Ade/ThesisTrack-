import { defineConfig } from 'drizzle-kit';
import { cleanEnv, url } from 'envalid';

const env = cleanEnv(process.env, {
  DATABASE_URL: url(),
});

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
});
