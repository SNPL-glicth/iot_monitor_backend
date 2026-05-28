export const MQTT_TOKENS = {
  ConnectionManager: Symbol('IMqttConnectionManager'),
  Publisher: Symbol('IMqttPublisher'),
  TopicFormatter: Symbol('IMqttTopicFormatter'),
  StatisticsTracker: Symbol('IMqttStatisticsTracker'),
  Config: Symbol('MqttConfig'),
} as const;
