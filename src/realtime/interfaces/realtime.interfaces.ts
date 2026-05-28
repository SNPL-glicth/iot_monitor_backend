export interface RealtimeSnapshot {
  readonly readings: unknown[];
  readonly alerts: unknown[];
  readonly predictions: unknown[];
  readonly mlEvents: unknown[];
  readonly consolidated: unknown[];
  readonly partial: boolean;
  readonly timestamp: Date;
}

export interface IRealtimeSnapshotService {
  fetchSnapshot(): Promise<RealtimeSnapshot>;
  readonly lastSnapshotAt: Date;
}

export interface IPayloadDeduplicator {
  isDuplicate(payload: unknown): boolean;
  readonly cacheSize: number;
}
