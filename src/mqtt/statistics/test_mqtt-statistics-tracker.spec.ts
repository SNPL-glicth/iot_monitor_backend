/// <reference types="jest" />
import { MqttStatisticsTracker } from './mqtt-statistics-tracker';

describe('MqttStatisticsTracker', () => {
  it('getSnapshot reflects recorded publishes', () => {
    const tracker = new MqttStatisticsTracker();
    tracker.recordPublish();
    tracker.recordPublish();
    tracker.recordDrop();
    const snapshot = tracker.getSnapshot();
    expect(snapshot.messagesPublished).toBe(2);
    expect(snapshot.messagesDropped).toBe(1);
  });

  it('recordReconnect increments count', () => {
    const tracker = new MqttStatisticsTracker();
    tracker.recordReconnect();
    const snapshot = tracker.getSnapshot();
    expect(snapshot.reconnectCount).toBe(1);
    expect(snapshot.lastConnectedAt).not.toBeNull();
  });
});
