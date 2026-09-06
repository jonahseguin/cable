import jwt from 'jsonwebtoken';
import { db } from '@[removed]/db';
import { apiKey as apiKeyTable } from '@[removed]/db/schema';
import { eq } from 'drizzle-orm';
import { ApiKey } from './api-key';
import Iron from '@hapi/iron';
import { KEY } from '@[removed]/sdk/__internal';

export interface SocketTokenPayload {
  identifier: string;
  authorizedChannels: string[];
  entity: string;
  ipAddress?: string;
  userAgent?: string;
  origin: string;
}

export async function verifySocketToken(token: string) {
  try {
    const decrypted = await Iron.unseal(token, KEY, Iron.defaults);
    // Verify the token and return the decoded payload
    const decoded = jwt.decode(decrypted) as SocketTokenPayload;
    // represents hmac hex of an api key
    // the api key will be used to verify the token
    const entity = decoded.entity;

    const apiKey = await db.select().from(apiKeyTable).where(eq(apiKeyTable.hash, entity));

    if (!apiKey || apiKey.length === 0) {
      console.error(`Entity not found: ${entity}`);
      throw new Error(`Entity not found: ${entity}`);
    }

    const apiKeyData = apiKey[0]!;

    if (apiKeyData.expiresAt && apiKeyData.expiresAt < new Date()) {
      console.error('Token expired');
      throw new Error('Token expired');
    }

    const fullKey = ApiKey.decryptKey(apiKeyData.key)!;

    // other validation checks
    // blah blah blah

    // finally, verify the token
    jwt.verify(decrypted, fullKey);

    return {
      valid: true,
      payload: {
        ...decoded,
        entity: apiKeyData.organizationId,
      },
    };
  } catch (error) {
    console.error('Error verifying socket token', error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid token',
    };
  }
}
