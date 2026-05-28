import { Module } from '@nestjs/common';
import { MqttConnectionManager } from './mqtt-connection.manager';
import { MqttPublisher } from './mqtt-publisher';
import { MqttTopicFormatter } from './formatting/mqtt-topic-formatter';
import { MqttStatisticsTracker } from './statistics/mqtt-statistics-tracker';
import { loadMqttConfig } from './config/mqtt.config';
import { ExponentialBackoff } from './utils/exponential-backoff';
import { BoundedMessageQueue } from './utils/bounded-message-queue';
import { MQTT_TOKENS } from './tokens/mqtt.tokens';
import type { IMqttConnectionManager, IMqttPublisher } from './interfaces/mqtt.interfaces';
import type { IMqttTopicFormatter } from './interfaces/mqtt-formatter.interface';
import type { IMqttStatisticsTracker } from './interfaces/mqtt-statistics.interface';

@Module({
  providers: [
    {
      provide: MQTT_TOKENS.Config,
      useFactory: () => loadMqttConfig(),
    },
    {
      provide: MQTT_TOKENS.ConnectionManager,
      useFactory: (config) => {
        const backoff = new ExponentialBackoff(
          config.backoffBaseMs,
          config.backoffMaxMs
        );
        return new MqttConnectionManager(config, backoff);
      },
      inject: [MQTT_TOKENS.Config],
    },
    {
      provide: MQTT_TOKENS.Publisher,
      useFactory: (cm: IMqttConnectionManager) => {
        const queue = new BoundedMessageQueue<{ topic: string; payload: string }>(1000);
        return new MqttPublisher(cm, queue);
      },
      inject: [MQTT_TOKENS.ConnectionManager],
    },
    {
      provide: MQTT_TOKENS.TopicFormatter,
      useFactory: (config) => new MqttTopicFormatter(config),
      inject: [MQTT_TOKENS.Config],
    },
    {
      provide: MQTT_TOKENS.StatisticsTracker,
      useFactory: (cm: IMqttConnectionManager) => {
        const tracker = new MqttStatisticsTracker();
        cm.on('connected', () => tracker.recordReconnect());
        return tracker;
      },
      inject: [MQTT_TOKENS.ConnectionManager],
    },
  ],
  exports: [MQTT_TOKENS.Publisher, MQTT_TOKENS.StatisticsTracker],
})
export class MqttModule {}
