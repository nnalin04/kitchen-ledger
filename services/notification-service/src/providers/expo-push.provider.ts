import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { pool } from '../db';
import { config } from '../config';

const expo = new Expo({ accessToken: config.EXPO_ACCESS_TOKEN || undefined });

export interface PushPayload {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: 'critical' | 'important' | 'informational';
}

export async function sendPush(payload: PushPayload): Promise<void> {
  // Load active device tokens for this user
  const { rows } = await pool.query<{ token: string; id: string }>(
    `SELECT id, token FROM device_tokens
     WHERE user_id = $1 AND is_active = TRUE`,
    [payload.userId]
  );

  if (rows.length === 0) return;

  const messages: ExpoPushMessage[] = rows
    .filter(r => Expo.isExpoPushToken(r.token))
    .map(r => ({
      to: r.token,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      priority: payload.priority === 'critical' ? 'high' : 'normal',
      sound: payload.priority === 'critical' ? 'default' : undefined,
      badge: 1,
    }));

  if (messages.length === 0) return;

  const chunks = expo.chunkPushNotifications(messages);
  const invalidTokens: string[] = [];

  for (const chunk of chunks) {
    try {
      const receipts = await expo.sendPushNotificationsAsync(chunk);
      for (let i = 0; i < receipts.length; i++) {
        const receipt = receipts[i];
        if (receipt.status === 'error') {
          if (receipt.details?.error === 'DeviceNotRegistered') {
            invalidTokens.push(rows[i].token);
          }
          console.error('Push error:', receipt.message, receipt.details);
        }
      }
    } catch (err) {
      console.error('Push chunk failed:', err);
    }
  }

  // Deactivate invalid tokens
  if (invalidTokens.length > 0) {
    await pool.query(
      `UPDATE device_tokens SET is_active = FALSE WHERE token = ANY($1::text[])`,
      [invalidTokens]
    );
  }
}
