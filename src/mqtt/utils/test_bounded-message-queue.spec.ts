/// <reference types="jest" />
import { BoundedMessageQueue } from './bounded-message-queue';

describe('BoundedMessageQueue', () => {
  it('enqueue drops oldest when full', () => {
    const queue = new BoundedMessageQueue<number>(2);
    queue.enqueue(1);
    queue.enqueue(2);
    const result = queue.enqueue(3);
    expect(result.dropped).toBe(true);
    expect(result.queueSize).toBe(2);
  });

  it('drainAll returns all items and clears queue', () => {
    const queue = new BoundedMessageQueue<number>(3);
    queue.enqueue(1);
    queue.enqueue(2);
    const items = queue.drainAll();
    expect(items).toEqual([1, 2]);
    expect(queue.size).toBe(0);
  });
});
