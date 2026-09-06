import { ApiKey } from '@[removed]/auth';
import { MiddlewareHandler } from 'hono';

export const apiKeyMiddleware: MiddlewareHandler = async (c, next) => {
  const authorizationHeader = c.req.header('Authorization');

  if (!authorizationHeader) {
    c.set('apiKey', null);
    return await next();
  }

  const apiKeyValue = authorizationHeader.split(' ')[1];

  if (!apiKeyValue) {
    c.set('apiKey', null);
    return await next();
  }

  const apiKeyVerification = await ApiKey.verify(apiKeyValue, true);

  if (!apiKeyVerification.valid || !!apiKeyVerification.reason || !apiKeyVerification.apiKey) {
    c.set('apiKey', null);
    return c.json({ error: 'Unauthorized', reason: apiKeyVerification.reason }, 401);
  }

  c.set('apiKey', apiKeyVerification.apiKey);
  return await next();
};

export const requireApiKey: MiddlewareHandler = async (c, next) => {
  const apiKey = c.get('apiKey');
  if (!apiKey) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return await next();
};
