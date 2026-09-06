import { Client } from '@planetscale/database';
import { drizzle } from 'drizzle-orm/planetscale-serverless';
import * as schema from './schema';

export const createPlanetScaleClient = ({
  host,
  username,
  password,
  url,
}: {
  host?: string;
  username?: string;
  password?: string;
  url?: string;
}): Client => {
  return new Client({
    host,
    username,
    password,
    url,
  });
};

export const planetScaleClient = createPlanetScaleClient({
  host: process.env.DATABASE_HOST,
  username: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
});

export const createDb = (client: Client) => {
  return drizzle(client, { schema });
};

export const db = createDb(planetScaleClient);
