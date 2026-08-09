import 'package:flutter_webrtc/flutter_webrtc.dart';

class MediaService {
  MediaStream? _localStream;

  MediaStream? get localStream => _localStream;

  /// Tüm medya (kamera + mikrofon) başlatılır
  Future<void> startMedia() async {
    if (_localStream != null) return;
    final mediaConstraints = {
      'audio': true,
      'video': {
        'facingMode': 'user',
        'width': {'ideal': 1280},
        'height': {'ideal': 720},
        'frameRate': {'ideal': 30},
      }
    };
    _localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
  }

  /// Tüm medya durdurulur
  Future<void> stopMedia() async {
    _localStream?.getTracks().forEach((track) => track.stop());
    _localStream = null;
  }

  /// Kamera donanımsal olarak durdurulur (video trackleri kapatır)
  void stopCamera() {
    _localStream?.getVideoTracks().forEach((track) => track.stop());
  }

  /// Kamera donanımsal olarak tekrar açılır ve streame eklenir
  Future<void> startCamera() async {
    if (_localStream == null) return;
    // Yeni kamera stream'i oluşturulur
    final videoStream = await navigator.mediaDevices.getUserMedia({
      'audio': false,
      'video': {
        'facingMode': 'user',
        'width': {'ideal': 1280},
        'height': {'ideal': 720},
        'frameRate': {'ideal': 30},
      }
    });
    final videoTrack = videoStream.getVideoTracks().first;
    _localStream!.addTrack(videoTrack);
  }

  /// Mikrofon donanımsal olarak durdurulur (audio trackleri kapatır)
  void stopMic() {
    _localStream?.getAudioTracks().forEach((track) => track.stop());
  }

  /// Mikrofon donanımsal olarak tekrar açılır ve streame eklenir
  Future<void> startMic() async {
    if (_localStream == null) return;
    // Önce eski audio track'leri çıkar
    _localStream!.getAudioTracks().forEach((track) => _localStream!.removeTrack(track));
    final audioStream = await navigator.mediaDevices.getUserMedia({
      'audio': true,
      'video': false,
    });
    final audioTrack = audioStream.getAudioTracks().first;
    _localStream!.addTrack(audioTrack);
  }
}