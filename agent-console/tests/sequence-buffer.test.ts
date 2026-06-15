import { describe, it, expect } from 'vitest';
import { SequenceBuffer } from '../src/lib/sequence-buffer';
import type { ServerMessage } from '../src/lib/types';

function msg(seq: number, type: ServerMessage['type'] = 'TOKEN'): ServerMessage {
  return { type, seq, text: `msg-${seq}`, stream_id: 's_01' };
}

describe('SequenceBuffer', () => {
  it('processes messages in order', () => {
    const buf = new SequenceBuffer();
    const results = buf.tryProcess(msg(1));
    expect(results).toHaveLength(1);
    expect(results[0].seq).toBe(1);
    expect(buf.highestSeq).toBe(1);
  });

  it('buffers out-of-order messages and flushes when gap closes', () => {
    const buf = new SequenceBuffer();
    const r1 = buf.tryProcess(msg(3));
    expect(r1).toHaveLength(0);
    expect(buf.size).toBe(1);

    const r2 = buf.tryProcess(msg(1));
    expect(r2).toHaveLength(1);
    expect(r2[0].seq).toBe(1);
    expect(buf.highestSeq).toBe(1);

    const r3 = buf.tryProcess(msg(2));
    expect(r3).toHaveLength(2);
    expect(r3[0].seq).toBe(2);
    expect(r3[1].seq).toBe(3);
    expect(buf.highestSeq).toBe(3);
    expect(buf.size).toBe(0);
  });

  it('handles duplicates', () => {
    const buf = new SequenceBuffer();
    buf.tryProcess(msg(1));
    const dup = buf.tryProcess(msg(1));
    expect(dup).toHaveLength(0);
  });

  it('handles fully reversed sequence', () => {
    const buf = new SequenceBuffer();
    for (let i = 10; i >= 1; i--) {
      buf.tryProcess(msg(i));
    }
    expect(buf.highestSeq).toBe(10);
    expect(buf.size).toBe(0);
  });

  it('handles gaps that never close (non-contiguous remainder)', () => {
    const buf = new SequenceBuffer();
    buf.tryProcess(msg(1));
    buf.tryProcess(msg(2));
    buf.tryProcess(msg(5));
    buf.tryProcess(msg(6));
    expect(buf.highestSeq).toBe(2);
    expect(buf.size).toBe(2);

    buf.tryProcess(msg(3));
    expect(buf.highestSeq).toBe(3);
    expect(buf.size).toBe(2);

    buf.tryProcess(msg(4));
    expect(buf.highestSeq).toBe(6);
    expect(buf.size).toBe(0);
  });

  it('handles single element buffer', () => {
    const buf = new SequenceBuffer();
    buf.tryProcess(msg(2));
    expect(buf.size).toBe(1);
    expect(buf.highestSeq).toBe(0);

    buf.tryProcess(msg(1));
    expect(buf.highestSeq).toBe(2);
    expect(buf.size).toBe(0);
  });

  it('handles empty buffer flush', () => {
    const buf = new SequenceBuffer();
    const flushed = buf.flush();
    expect(flushed).toHaveLength(0);
  });

  it('tracks processed seqs correctly after reset', () => {
    const buf = new SequenceBuffer();
    buf.tryProcess(msg(1));
    buf.tryProcess(msg(2));
    expect(buf.highestSeq).toBe(2);

    buf.reset();
    expect(buf.highestSeq).toBe(0);
    expect(buf.size).toBe(0);

    const r = buf.tryProcess(msg(1));
    expect(r).toHaveLength(1);
  });

  it('insert and flush works directly', () => {
    const buf = new SequenceBuffer();
    buf.insert(msg(1));
    buf.insert(msg(2));
    buf.insert(msg(3));
    const flushed = buf.flush();
    expect(flushed).toHaveLength(3);
    expect(flushed[0].seq).toBe(1);
    expect(flushed[2].seq).toBe(3);
    expect(buf.highestSeq).toBe(3);
  });

  it('isProcessed returns correct state', () => {
    const buf = new SequenceBuffer();
    expect(buf.isProcessed(1)).toBe(false);
    buf.tryProcess(msg(1));
    expect(buf.isProcessed(1)).toBe(true);
    expect(buf.isProcessed(2)).toBe(false);
  });

  it('handles messages with seq properly', () => {
    const buf = new SequenceBuffer();
    const r = buf.tryProcess(msg(1));
    expect(r).toHaveLength(1);
  });

  it('flushes correctly after insert with gap', () => {
    const buf = new SequenceBuffer();
    const r1 = buf.tryProcess(msg(1));
    expect(r1).toHaveLength(1);
    buf.insert(msg(3));
    expect(buf.size).toBe(1);
    const r2 = buf.tryProcess(msg(2));
    expect(r2).toHaveLength(2);
    expect(r2[0].seq).toBe(2);
    expect(r2[1].seq).toBe(3);
    expect(buf.size).toBe(0);
  });

  it('handles interleaved tool calls and tokens', () => {
    const buf = new SequenceBuffer();
    const events = [
      msg(1, 'TOKEN'),
      msg(2, 'TOKEN'),
      msg(3, 'TOOL_CALL'),
    ];
    for (const e of events) buf.tryProcess(e);
    expect(buf.highestSeq).toBe(3);

    const more = [
      msg(5, 'TOOL_RESULT'),
      msg(6, 'TOKEN'),
    ];
    for (const e of more) buf.tryProcess(e);
    expect(buf.highestSeq).toBe(3);
    expect(buf.size).toBe(2);

    const fill = buf.tryProcess(msg(4, 'TOKEN'));
    expect(fill).toHaveLength(3);
    expect(fill[0].seq).toBe(4);
    expect(fill[1].seq).toBe(5);
    expect(fill[2].seq).toBe(6);
  });
});
