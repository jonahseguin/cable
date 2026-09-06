export interface ChatRoom {
  readonly status: string;
  onStatus(listener: () => void): () => void;
}

export function waitForOpen(room: ChatRoom): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error("Cable client did not open a WebSocket within five seconds."));
    }, 5_000);
    const off = room.onStatus(() => {
      if (room.status !== "open") return;
      clearTimeout(timer);
      off();
      resolve();
    });
  });
}

export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  label: string,
): Promise<void> {
  const deadline = Date.now() + 5_000;
  await waitForCondition(condition, deadline, label);
}

async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  deadline: number,
  label: string,
): Promise<void> {
  if (await condition()) return;
  if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}.`);
  await new Promise<void>((resolve) => setTimeout(resolve, 25));
  await waitForCondition(condition, deadline, label);
}
