/// lib/utils/config.dart
///
/// Central config for REST, Socket.IO, and the dev token.
/// NOTE: On emulator/phone, don't use "localhost" — use your LAN IP or ngrok.
class AppConfig {
  // Spring Boot (REST)
  static const String apiOrigin = String.fromEnvironment(
    'API_ORIGIN',
    // Override with your LAN IP / tunnel, e.g. --dart-define=API_ORIGIN=http://192.168.1.33:8080
    // Default targets the Android emulator's host loopback.
    defaultValue: 'http://10.0.2.2:8080',
  );

  // netty-socketio (Socket.IO)
  static const String socketOrigin = String.fromEnvironment(
    'SOCKET_ORIGIN',
    // Override with your LAN IP / tunnel, e.g. --dart-define=SOCKET_ORIGIN=http://192.168.1.33:8000
    // Default targets the Android emulator's host loopback.
    defaultValue: 'http://10.0.2.2:8000',
  );

  // Path served by your Socket.IO backend.
  // For netty-socketio, the trailing slash is commonly required.
  static const String socketPath = '/socket.io/';

  // REST base
  static const String apiBase = '$apiOrigin/api';

  // Dev token = the shared symmetric secret the backend checks (see JwtTokenService).
  // Override via --dart-define=API_TOKEN=... ; must match the backend's JWT_SECRET.
  // The default is an insecure placeholder — replace with a real JWT flow in prod.
  static const String jwt = String.fromEnvironment(
    'API_TOKEN',
    defaultValue: 'dev-insecure-shared-secret-change-me',
  );
}
