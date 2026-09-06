'use server';

import { AppChannels } from '@/lib/sock8';
import { channels } from '@/lib/sock8';
import { GetSchemaFromEndpoint } from '@sock8/sdk/dsl';
import { z } from 'zod';

export async function sendMessageServerAction(
  message: z.infer<GetSchemaFromEndpoint<AppChannels['chat']['global']['msgs']>>,
) {
  await channels.chat.global.msgs.emit(message);
  return message;
}
