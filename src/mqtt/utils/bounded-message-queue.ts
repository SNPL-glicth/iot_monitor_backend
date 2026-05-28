export interface EnqueueResult {
  readonly dropped: boolean;
  readonly queueSize: number;
}

export class BoundedMessageQueue<T> {
  private items: T[] = [];

  constructor(private readonly limit: number) {}

  enqueue(item: T): EnqueueResult {
    let dropped = false;

    if (this.items.length >= this.limit) {
      this.items.shift();
      dropped = true;
    }

    this.items.push(item);

    return { dropped, queueSize: this.items.length };
  }

  drainAll(): T[] {
    const copy = this.items.slice();
    this.items = [];
    return copy;
  }

  get size(): number {
    return this.items.length;
  }
}
