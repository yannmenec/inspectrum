import { readSync } from "node:fs";

export const HOOK_STDIN_MAX_BYTES = 128 * 1024;
const READ_CHUNK_BYTES = 16 * 1024;

/** Read hook stdin without ever buffering more than the accepted cap plus one byte. */
export function readHookStdin(fd = 0): string {
  const chunks: Buffer[] = [];
  let total = 0;

  while (true) {
    const remaining = HOOK_STDIN_MAX_BYTES - total;
    const chunk = Buffer.allocUnsafe(Math.min(READ_CHUNK_BYTES, remaining + 1));
    const bytesRead = readSync(fd, chunk, 0, chunk.length, null);
    if (bytesRead === 0) break;

    total += bytesRead;
    if (total > HOOK_STDIN_MAX_BYTES) {
      throw new Error(`hook stdin exceeds ${HOOK_STDIN_MAX_BYTES} byte limit`);
    }
    chunks.push(chunk.subarray(0, bytesRead));
  }

  return Buffer.concat(chunks, total).toString("utf8");
}
