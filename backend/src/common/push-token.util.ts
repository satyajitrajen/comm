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

export function resolveStoredPushToken(body: {
  subscription?: unknown;
  token?: string;
  deviceType?: string;
}): { pushToken: string; deviceType: string } {
  const deviceType = (body.deviceType || 'WEB').toUpperCase();
  const token = body.token?.trim();

  if (deviceType === 'ANDROID' || deviceType === 'IOS') {
    if (!token) {
      throw new Error('FCM token is required');
    }
    return { pushToken: token, deviceType };
  }

  // Browser: Firebase JS registration token, or classic VAPID PushSubscription JSON.
  if (token) {
    return { pushToken: token, deviceType: 'WEB' };
  }
  if (body.subscription === undefined || body.subscription === null) {
    throw new Error('Web push subscription or FCM token is required');
  }
  return { pushToken: JSON.stringify(body.subscription), deviceType: 'WEB' };
}
