/** Distinguishes browser VAPID JSON tokens from opaque FCM device tokens. */
export function isWebPushToken(pushToken: string): boolean {
  try {
    const parsed: unknown = JSON.parse(pushToken);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      'endpoint' in parsed
    );
  } catch {
    return false;
  }
}

export const MAX_PUSH_TOKEN_LENGTH = 4096;

export const ALLOWED_PUSH_DEVICE_TYPES = ['WEB', 'ANDROID', 'IOS'] as const;

function assertPushTokenLength(pushToken: string): void {
  if (pushToken.length < 1 || pushToken.length > MAX_PUSH_TOKEN_LENGTH) {
    throw new Error(
      `Push token must be between 1 and ${MAX_PUSH_TOKEN_LENGTH} characters`,
    );
  }
}

export function resolveStoredPushToken(body: {
  subscription?: unknown;
  token?: string;
  deviceType?: string;
}): { pushToken: string; deviceType: string } {
  const deviceType = (body.deviceType || 'WEB').toUpperCase();
  if (!ALLOWED_PUSH_DEVICE_TYPES.includes(deviceType as never)) {
    throw new Error(
      `Device type must be one of: ${ALLOWED_PUSH_DEVICE_TYPES.join(', ')}`,
    );
  }
  const token = body.token?.trim();

  if (deviceType === 'ANDROID' || deviceType === 'IOS') {
    if (!token) {
      throw new Error('FCM token is required');
    }
    assertPushTokenLength(token);
    return { pushToken: token, deviceType };
  }

  // Browser: Firebase JS registration token, or classic VAPID PushSubscription JSON.
  if (token) {
    assertPushTokenLength(token);
    return { pushToken: token, deviceType: 'WEB' };
  }
  if (body.subscription === undefined || body.subscription === null) {
    throw new Error('Web push subscription or FCM token is required');
  }
  const pushToken = JSON.stringify(body.subscription);
  assertPushTokenLength(pushToken);
  return { pushToken, deviceType: 'WEB' };
}
