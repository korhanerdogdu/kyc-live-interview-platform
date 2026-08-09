// lib/services/api_service.dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../utils/config.dart';

class ApiService {
  ApiService._();
  static final ApiService I = ApiService._();
  final _client = http.Client();

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ${AppConfig.jwt}', // <<< SAME TOKEN AS SOCKET
  };

  /// POST /api/meeting/start -> returns meeting UUID as "id"
  Future<String> startMeeting({required String customerId}) async {
    final uri = Uri.parse('${AppConfig.apiBase}/meeting/start');
    final res = await _client.post(
      uri,
      headers: _headers,
      body: jsonEncode({'customerId': customerId}),
    );

    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('Start failed: ${res.statusCode} ${res.body}');
    }

    final data = jsonDecode(res.body);
    final id = data['id']?.toString();
    if (id == null) {
      throw Exception('Start response missing "id": ${res.body}');
    }
    return id;
  }

  Future<void> joinMeeting({required String meetingId, required String userId}) async {
    final uri = Uri.parse('${AppConfig.apiBase}/meeting/$meetingId/join');
    final res = await _client.post(
      uri,
      headers: _headers,
      body: jsonEncode({'userId': userId}),
    );
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('Join failed: ${res.statusCode} ${res.body}');
    }
  }

  Future<void> endMeeting({required String meetingId, String? notes}) async {
    final uri = Uri.parse('${AppConfig.apiBase}/meeting/$meetingId/end');
    final res = await _client.post(
      uri,
      headers: _headers,
      body: jsonEncode(notes == null ? {} : {'notes': notes}),
    );
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('End failed: ${res.statusCode} ${res.body}');
    }
  }

  Future<String> getMeetingStatus(String meetingId) async {
    final uri = Uri.parse('${AppConfig.apiBase}/meeting/$meetingId/status');
    final res = await _client.get(uri, headers: _headers);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('Status failed: ${res.statusCode} ${res.body}');
    }
    final data = jsonDecode(res.body);
    return data['status']?.toString() ?? 'unknown';
  }
}
