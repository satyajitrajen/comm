import { isWebPushToken, resolveStoredPushToken } from './push-token.util';

describe('push-token.util', () => {
  it('treats VAPID subscription JSON as web push', () => {
    const token = JSON.stringify({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'x', auth: 'y' },
    });
    expect(isWebPushToken(token)).toBe(true);
  });

  it('does not treat an FCM registration string as web push', () => {
    expect(isWebPushToken('dK3xFcmTokenWithoutJson')).toBe(false);
  });

  it('stores ANDROID token as-is', () => {
    expect(
      resolveStoredPushToken({ token: 'fcm-abc', deviceType: 'ANDROID' }),
    ).toEqual({ pushToken: 'fcm-abc', deviceType: 'ANDROID' });
  });

  it('stores WEB subscription as JSON string', () => {
    const subscription = { endpoint: 'https://example.com', keys: {} };
    expect(resolveStoredPushToken({ subscription, deviceType: 'WEB' })).toEqual(
      {
        pushToken: JSON.stringify(subscription),
        deviceType: 'WEB',
      },
    );
  });

  it('stores WEB Firebase JS token as an opaque FCM string', () => {
    expect(
      resolveStoredPushToken({ token: 'fcm-web-token', deviceType: 'WEB' }),
    ).toEqual({ pushToken: 'fcm-web-token', deviceType: 'WEB' });
  });

  it('rejects WEB subscribe with neither token nor subscription', () => {
    expect(() => resolveStoredPushToken({ deviceType: 'WEB' })).toThrow(
      /subscription or FCM token/i,
    );
  });
});
