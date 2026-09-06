import { generateSocketId } from '@[removed]/auth';

export async function generateUniqueSocketId() {
  const id = generateSocketId();
  // TODO: Check if the id is unique in KV, re-generate until unique
  return id;
}
