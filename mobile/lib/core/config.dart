class AppConfig {
  AppConfig._();

  static const _fromDefine = String.fromEnvironment('API_BASE_URL');

  /// Emulator loopback to the host machine. Physical devices need a LAN IP
  /// passed as `--dart-define=API_BASE_URL=http://192.168.x.x:5000`.
  static const debugDefault = 'https://communication.impmeet.com';
  static const releaseDefault = 'https://communication.impmeet.com';
  static const jitsiServer = String.fromEnvironment(
    'JITSI_SERVER',
    defaultValue: 'meet.teamtime.live',
  );

  static String apiBaseUrl({required bool isRelease}) {
    final raw = _fromDefine.isNotEmpty ? _fromDefine : (isRelease ? releaseDefault : debugDefault);
    return raw.endsWith('/') ? raw.substring(0, raw.length - 1) : raw;
  }
}

String callRoomName(String conversationId) => 'veloce-call-$conversationId';
