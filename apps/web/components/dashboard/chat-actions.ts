'use server';

import { AppChannels } from '@/lib/[removed]';
import { channels } from '@/lib/[removed]';
import { GetSchemaFromEndpoint } from '@[removed]/sdk/dsl';
import { z } from 'zod';

export async function sendMessageServerAction(
  message: z.infer<GetSchemaFromEndpoint<AppChannels['chat']['global']['msgs']>>,
) {
  await channels.chat.global.msgs.emit(message);
  return message;
}
