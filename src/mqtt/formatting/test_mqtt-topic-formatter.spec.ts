/// <reference types="jest" />
import { MqttTopicFormatter } from './mqtt-topic-formatter';

describe('MqttTopicFormatter', () => {
  const config = { brokerUrl: 'mqtt://localhost:1883' } as any;
  const formatter = new MqttTopicFormatter(config);

  it('formatSensorReading returns correct topic', () => {
    const topic = formatter.formatSensorReading('d1', 's1');
    expect(topic).toContain('d1');
    expect(topic).toContain('s1');
    expect(topic).toContain('reading');
  });

  it('formatAlert includes severity', () => {
    const topic = formatter.formatAlert('d1', 'critical');
    expect(topic).toContain('critical');
  });

  it('formatHeartbeat matches pattern', () => {
    const topic = formatter.formatHeartbeat('d1');
    expect(topic).toContain('heartbeat');
    expect(topic).toContain('d1');
  });
});
