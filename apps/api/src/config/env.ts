import 'dotenv/config';
import { cleanEnv, str, port, url } from 'envalid';

export const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development', 'production', 'test'], default: 'development' }),
  PORT: port({ default: 5000 }),
  DATABASE_URL: url(),
  CORS_ORIGIN: str({ default: 'http://localhost:5173' }),
});
