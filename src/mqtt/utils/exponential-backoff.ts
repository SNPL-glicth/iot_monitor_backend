export class ExponentialBackoff {
  private currentMs: number;

  constructor(
    private readonly baseMs: number,
    private readonly maxMs: number,
    private readonly factor: number = 2
  ) {
    this.currentMs = baseMs;
  }

  next(): number {
    const jitter = this.currentMs * 0.1;
    const delay = this.currentMs + (Math.random() * 2 - 1) * jitter;
    const result = Math.round(Math.max(0, delay));

    this.currentMs = Math.min(
      this.currentMs * this.factor,
      this.maxMs
    );

    return result;
  }

  reset(): void {
    this.currentMs = this.baseMs;
  }

  get currentDelayMs(): number {
    return this.currentMs;
  }
}
