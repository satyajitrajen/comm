class AppConfig {
  AppConfig._();

  static const _fromDefine = String.fromEnvironment('API_BASE_URL');

  /// Emulator loopback to the host machine. Physical devices need a LAN IP
  /// passed as `--dart-define=API_BASE_URL=http://192.168.x.x:5000`.
  static const debugDefault = 'http://10.0.2.2:5000';
  static const releaseDefault = 'https://communication.impmeet.com';
  static const jitsiServer = String.fromEnvironment(
    'JITSI_SERVER',
    defaultValue: 'meet.teamtime.live',
  );

  static String apiBaseUrl({required bool isRelease}) {
    if (_fromDefine.isNotEmpty) return _fromDefine;
    return isRelease ? releaseDefault : debugDefault;
  }
}

String callRoomName(String conversationId) => 'veloce-call-$conversationId';
