/// lib/utils/config.dart
///
/// Central config for REST, Socket.IO, and the dev token.
/// NOTE: On emulator/phone, don't use "localhost" — use your LAN IP or ngrok.
class AppConfig {
  // Spring Boot (REST)
  static const String apiOrigin = String.fromEnvironment(
    'API_ORIGIN',
    // e.g. 'http://192.168.1.33:8080'
    defaultValue: 'https://0bb4-2a00-1d34-9408-d300-c96d-886b-bb4e-ac6d.ngrok-free.app',
  );

  // netty-socketio (Socket.IO)
  static const String socketOrigin = String.fromEnvironment(
    'SOCKET_ORIGIN',
    // e.g. 'http://192.168.1.33:8000'
    defaultValue: 'https://0bb4-2a00-1d34-9408-d300-c96d-886b-bb4e-ac6d.ngrok-free.app',
  );

  // Path served by your Socket.IO backend.
  // For netty-socketio, the trailing slash is commonly required.
  static const String socketPath = '/socket.io/';

  // REST base
  static const String apiBase = '$apiOrigin/api';

  // Dev token (same value the web client uses). Replace with a real JWT in prod.
  static const String jwt = 'aaaaabbbbb1111122222333334444455';
}
