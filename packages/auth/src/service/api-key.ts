import { db } from '@[removed]/db';
import { apiKey } from '@[removed]/db/schema';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { KEY as PLATFORM_KEY } from '@[removed]/sdk/__internal';

// Ensure the encryption key environment variable is set
if (!process.env.API_KEY_ENCRYPTION_KEY) {
  throw new Error('API_KEY_ENCRYPTION_KEY environment variable is not set.');
}
if (Buffer.from(process.env.API_KEY_ENCRYPTION_KEY, 'base64').length !== 32) {
  throw new Error('API_KEY_ENCRYPTION_KEY must be a base64 encoded 32-byte key.');
}
const encryptionKey = Buffer.from(process.env.API_KEY_ENCRYPTION_KEY, 'base64');
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Recommended for GCM
const AUTH_TAG_LENGTH = 16; // Standard for GCM

export class ApiKey {
  private static readonly CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  static readonly PREFIX = '[removed]_';
  static readonly KEY_BODY_LENGTH = 32; // Length of the random part of the key
  static readonly DEFAULT_NAME = 'default';

  private static generateKeyBody() {
    let keyBody = '';
    for (let i = 0; i < this.KEY_BODY_LENGTH; i++) {
      keyBody += this.CHARS[Math.floor(Math.random() * this.CHARS.length)];
    }
    return keyBody;
  }

  private static getStartingCharacters(keyBody: string) {
    return keyBody.slice(0, this.PREFIX.length);
  }

  // Encrypts the key using AES-256-GCM
  private static encryptKey(key: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, encryptionKey, iv);
    let encrypted = cipher.update(key, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    // Combine IV, authTag, and ciphertext for storage
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  }

  // Decrypts the key using AES-256-GCM (Refined with explicit type assertions)
  static decryptKey(encryptedData: string): string | null {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        console.error('Invalid encrypted key format: Incorrect number of parts');
        return null;
      }
      // Explicitly assert types after length check
      const [ivBase64, authTagBase64, encryptedKeyBase64] = parts as [string, string, string];

      const iv = Buffer.from(ivBase64, 'base64');
      const authTag = Buffer.from(authTagBase64, 'base64');

      // Add length checks for robustness
      if (iv.length !== IV_LENGTH) {
        console.error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
        return null;
      }
      if (authTag.length !== AUTH_TAG_LENGTH) {
        console.error(`Invalid authTag length: expected ${AUTH_TAG_LENGTH}, got ${authTag.length}`);
        return null;
      }

      const decipher = createDecipheriv(ALGORITHM, encryptionKey, iv);
      decipher.setAuthTag(authTag); // Set the authentication tag

      let decrypted = decipher.update(encryptedKeyBase64, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      // Catch errors during Buffer.from or decryption (e.g., invalid base64, bad auth tag)
      console.error('Decryption failed:', error);
      return null;
    }
  }

  public static verifyLength(key: string) {
    return key.length === this.KEY_BODY_LENGTH + this.PREFIX.length;
  }

  public static verifyPrefix(key: string) {
    return key.startsWith(this.PREFIX);
  }

  public static async create({
    organizationId,
    name,
    expiresAt,
    rateLimitEnabled = false,
    rateLimitTimeWindow,
    rateLimitMax,
    permissions,
    metadata,
  }: {
    organizationId: string;
    name?: string;
    expiresAt?: Date;
    rateLimitEnabled?: boolean;
    rateLimitTimeWindow?: number;
    rateLimitMax?: number;
    permissions?: string;
    metadata?: string;
  }) {
    const keyBody = this.generateKeyBody();
    const fullKey = this.PREFIX + keyBody;
    const startingCharacters = this.getStartingCharacters(keyBody);
    const encryptedKey = this.encryptKey(fullKey); // Encrypt the full key
    const hash = createHmac('sha256', PLATFORM_KEY).update(fullKey).digest('hex');

    const id = crypto.randomUUID();
    await db.insert(apiKey).values({
      id,
      organizationId,
      key: encryptedKey, // Store encrypted key
      hash,
      name,
      start: startingCharacters,
      prefix: this.PREFIX,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
      enabled: true,
      rateLimitEnabled,
      rateLimitTimeWindow,
      rateLimitMax,
      requestCount: 0,
      remaining: rateLimitMax,
      permissions,
      metadata,
    });

    const apiKeyData = await this.getById(id);

    // Only return the full *plaintext* key during creation
    return {
      apiKey: apiKeyData,
      key: fullKey,
    };
  }

  public static async verify(key: string, performRateLimitCheck = true) {
    if (!this.verifyPrefix(key) || !this.verifyLength(key)) {
      return { valid: false };
    }

    const keyBody = key.slice(this.PREFIX.length);
    const start = this.getStartingCharacters(keyBody);
    const prefix = this.PREFIX;

    // Find potential candidates using prefix and start characters (indexed query)
    const candidateApiKeys = await db
      .select()
      .from(apiKey)
      .where(
        and(
          eq(apiKey.prefix, prefix),
          eq(apiKey.start, start),
          eq(apiKey.enabled, true),
          or(isNull(apiKey.expiresAt), gt(apiKey.expiresAt, new Date())),
        ),
      );

    let foundApiKey = null;
    for (const candidate of candidateApiKeys) {
      // Ensure candidate.key is not null or undefined before decrypting
      if (!candidate.key) continue;
      const decryptedKey = this.decryptKey(candidate.key); // candidate.key is the encrypted key from DB
      // Check if decryption was successful and if the decrypted key matches the input key
      if (decryptedKey && decryptedKey === key) {
        foundApiKey = candidate;
        break; // Found the matching key
      }
    }

    if (!foundApiKey) {
      return { valid: false };
    }

    // Check rate limits if enabled
    if (performRateLimitCheck && foundApiKey.rateLimitEnabled) {
      const isWithinLimit = await this.checkAndUpdateRateLimit(foundApiKey.id);
      if (!isWithinLimit) {
        return { valid: false, reason: 'rate_limited' };
      }
    }

    return { valid: true, apiKey: foundApiKey };
  }

  // Added method to retrieve the decrypted key - use with caution!
  public static async getFullKey(id: string): Promise<string | null> {
    const keyRecord = await this.getById(id);
    if (!keyRecord?.key) {
      // Check if keyRecord and keyRecord.key exist
      return null;
    }
    return this.decryptKey(keyRecord.key);
  }

  public static async getDescriptedKeyLast6(encryptedKey: string) {
    const decryptedKey = this.decryptKey(encryptedKey);
    if (!decryptedKey) {
      return null;
    }
    return decryptedKey.slice(-6);
  }

  public static async revoke(id: string) {
    await db
      .update(apiKey)
      .set({
        enabled: false,
        updatedAt: new Date(),
      })
      .where(eq(apiKey.id, id));
  }

  public static async getByOrganization(organizationId: string) {
    // This returns records with encrypted keys
    return await db
      .select()
      .from(apiKey)
      .where(and(eq(apiKey.organizationId, organizationId), eq(apiKey.enabled, true)));
  }

  public static async getDefaultByOrganization(organizationId: string) {
    // This returns a record with an encrypted key
    return (
      (
        await db
          .select()
          .from(apiKey)
          .where(
            and(
              eq(apiKey.organizationId, organizationId),
              eq(apiKey.name, this.DEFAULT_NAME),
              eq(apiKey.enabled, true),
            ),
          )
          .limit(1)
      )?.[0] || null
    );
  }

  public static async refreshDefaultByOrganization(organizationId: string) {
    // Note: The returned 'key' in the create result is plaintext, but stored encrypted
    const defaultKeyRecord = await this.getDefaultByOrganization(organizationId);
    if (defaultKeyRecord) {
      await this.revoke(defaultKeyRecord.id);
    }
    // create returns { apiKey: ApiKeyRecord, key: string (plaintext) }
    return await this.create({ organizationId, name: this.DEFAULT_NAME });
  }

  public static async getOrCreateDefaultByOrganization(organizationId: string) {
    // Note: The returned 'key' in the create result is plaintext, but stored encrypted
    const defaultKeyRecord = await this.getDefaultByOrganization(organizationId);
    if (!defaultKeyRecord) {
      // create returns { apiKey: ApiKeyRecord, key: string (plaintext) }
      const creationResult = await this.create({ organizationId, name: this.DEFAULT_NAME });
      // We need to return the apiKey record here, not the creation result structure
      return creationResult.apiKey;
    }
    return defaultKeyRecord;
  }

  public static async getById(id: string) {
    // This returns a record with an encrypted key
    const results = await db.select().from(apiKey).where(eq(apiKey.id, id));
    return results[0] || null;
  }

  public static async update(
    id: string,
    data: {
      name?: string;
      expiresAt?: Date | null;
      enabled?: boolean;
      rateLimitEnabled?: boolean;
      rateLimitTimeWindow?: number;
      rateLimitMax?: number;
      permissions?: string;
      metadata?: string;
    },
  ) {
    // This updates the record, potentially changing metadata, expiry, etc.
    // The 'key' field remains encrypted.
    await db
      .update(apiKey)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(apiKey.id, id));

    return await this.getById(id); // Returns record with encrypted key
  }

  private static async checkAndUpdateRateLimit(apiKeyId: string): Promise<boolean> {
    // This logic remains the same
    const key = await this.getById(apiKeyId);
    if (!key || !key.enabled) return false;

    if (!key.rateLimitEnabled) return true;

    const now = new Date();
    const windowMs = (key.rateLimitTimeWindow || 60) * 1000;
    let remaining = key.remaining ?? key.rateLimitMax ?? 0; // Initialize remaining if null
    let requestCount = key.requestCount ?? 0;

    if (key.lastRequest) {
      const timeSinceLastRequest = now.getTime() - key.lastRequest.getTime();
      if (timeSinceLastRequest >= windowMs) {
        remaining = key.rateLimitMax ?? 0; // Reset based on max limit
        requestCount = 0;
      } else {
        // Ensure remaining is not null if lastRequest exists but outside window somehow
        if (key.remaining === null) remaining = key.rateLimitMax ?? 0;
      }
    } else {
      // First request ever, or after a long time
      remaining = key.rateLimitMax ?? 0;
      requestCount = 0; // Ensure requestCount is reset if lastRequest is null
    }

    if (remaining <= 0) {
      // Check if we are in a new window even if remaining is 0
      if (key.lastRequest && now.getTime() - key.lastRequest.getTime() >= windowMs) {
        remaining = key.rateLimitMax ?? 0;
        requestCount = 0;
        // Allow the request since it's a new window
      } else {
        return false; // Still rate limited
      }
    }

    // If after potential reset, remaining is still zero or less, deny
    if (remaining <= 0) return false;

    void db
      .update(apiKey)
      .set({
        remaining: remaining - 1,
        requestCount: requestCount + 1,
        lastRequest: now,
        updatedAt: now,
      })
      .where(eq(apiKey.id, apiKeyId));

    return true;
  }
}
