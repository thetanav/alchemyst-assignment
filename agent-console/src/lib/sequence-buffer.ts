import type { ServerMessage } from './types';

export class SequenceBuffer {
  private buffer = new Map<number, ServerMessage>();
  private processed = new Set<number>();
  private highestProcessed = 0;

  get highestSeq(): number {
    return this.highestProcessed;
  }

  isProcessed(seq: number): boolean {
    return this.processed.has(seq);
  }

  markProcessed(seq: number): void {
    this.processed.add(seq);
    if (seq > this.highestProcessed) {
      this.highestProcessed = seq;
    }
  }

  insert(msg: ServerMessage): void {
    if (msg.seq === undefined) return;
    if (this.processed.has(msg.seq)) return;
    this.buffer.set(msg.seq, msg);
  }

  flush(): ServerMessage[] {
    const result: ServerMessage[] = [];
    let expected = this.highestProcessed + 1;

    while (this.buffer.has(expected)) {
      const msg = this.buffer.get(expected)!;
      this.buffer.delete(expected);
      this.markProcessed(expected);
      result.push(msg);
      expected++;
    }

    return result;
  }

  tryProcess(msg: ServerMessage): ServerMessage[] {
    if (msg.seq === undefined) return [msg];

    if (this.processed.has(msg.seq)) return [];

    if (msg.seq === this.highestProcessed + 1) {
      this.markProcessed(msg.seq);
      const flushed = this.flush();
      return [msg, ...flushed];
    }

    if (msg.seq > this.highestProcessed + 1) {
      this.buffer.set(msg.seq, msg);
      return [];
    }

    return [];
  }

  get size(): number {
    return this.buffer.size;
  }

  reset(): void {
    this.buffer.clear();
    this.processed.clear();
    this.highestProcessed = 0;
  }
}
