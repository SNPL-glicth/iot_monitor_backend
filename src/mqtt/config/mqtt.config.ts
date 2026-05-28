import { ConfigurationError } from '../../auth/errors/auth.errors';

export interface MqttConfig {
  readonly brokerUrl: string;
  readonly clientId: string;
  readonly username: string | undefined;
  readonly password: string | undefined;
  readonly backoffBaseMs: number;
  readonly backoffMaxMs: number;
  readonly offlineQueueLimit: number;
  readonly healthCheckTopic: string;
}

function parseIntEnv(name: string, fallback: string): number {
  const raw = process.env[name] ?? fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new ConfigurationError(
      `${name} must be a positive integer. Got: ${raw}`
    );
  }
  return value;
}

export function loadMqttConfig(): MqttConfig {
  const brokerUrl = process.env.MQTT_BROKER_URL;
  if (!brokerUrl || brokerUrl.length === 0) {
    throw new ConfigurationError('MQTT_BROKER_URL is required');
  }

  const clientId = process.env.MQTT_CLIENT_ID ?? `backend-${Date.now()}`;
  const backoffBaseMs = parseIntEnv('MQTT_BACKOFF_BASE_MS', '5000');
  const backoffMaxMs = parseIntEnv('MQTT_BACKOFF_MAX_MS', '300000');

  if (backoffBaseMs >= backoffMaxMs) {
    throw new ConfigurationError(
      `MQTT_BACKOFF_BASE_MS (${backoffBaseMs}) must be < MQTT_BACKOFF_MAX_MS (${backoffMaxMs})`
    );
  }

  return Object.freeze({
    brokerUrl,
    clientId,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    backoffBaseMs,
    backoffMaxMs,
    offlineQueueLimit: parseIntEnv('MQTT_OFFLINE_QUEUE_LIMIT', '1000'),
    healthCheckTopic: process.env.MQTT_HEALTH_CHECK_TOPIC ?? '$SYS/broker/uptime',
  });
}
