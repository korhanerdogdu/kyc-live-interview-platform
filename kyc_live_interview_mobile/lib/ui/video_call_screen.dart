import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../services/media_service.dart';

class VideoCallScreen extends StatefulWidget {
  const VideoCallScreen({Key? key}) : super(key: key);

  @override
  State<VideoCallScreen> createState() => _VideoCallScreenState();
}

class _VideoCallScreenState extends State<VideoCallScreen> {
  final RTCVideoRenderer _localRenderer = RTCVideoRenderer();
  final MediaService _mediaService = MediaService();

  bool _isVideoEnabled = true;
  bool _isAudioEnabled = true;

  @override
  void initState() {
    super.initState();
    _initializeRenderer();
    _startMedia();
  }

  Future<void> _initializeRenderer() async {
    await _localRenderer.initialize();
  }

  Future<void> _startMedia() async {
    await _mediaService.startMedia();
    setState(() {
      _localRenderer.srcObject = _mediaService.localStream;
    });
  }

  void _toggleCamera() {
    final videoTrack = _mediaService.localStream?.getVideoTracks().first;
    if (videoTrack != null) {
      setState(() {
        _isVideoEnabled = !_isVideoEnabled;
        videoTrack.enabled = _isVideoEnabled;
      });
    }
  }

  void _toggleMicrophone() {
    final audioTrack = _mediaService.localStream?.getAudioTracks().first;
    if (audioTrack != null) {
      setState(() {
        _isAudioEnabled = !_isAudioEnabled;
        audioTrack.enabled = _isAudioEnabled;
      });
    }
  }

  @override
  void dispose() {
    _localRenderer.dispose();
    _mediaService.stopMedia();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: const Text('Video Call'),
      ),
      body: Stack(
        children: [
          Center(
            child: RTCVideoView(
              _localRenderer,
              mirror: true,
              objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
            ),
          ),
          Positioned(
            bottom: 30,
            left: 20,
            right: 20,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _buildControlButton(
                  icon: _isVideoEnabled ? Icons.videocam : Icons.videocam_off,
                  onPressed: _toggleCamera,
                ),
                _buildControlButton(
                  icon: _isAudioEnabled ? Icons.mic : Icons.mic_off,
                  onPressed: _toggleMicrophone,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildControlButton({required IconData icon, required VoidCallback onPressed}) {
    return ClipOval(
      child: Material(
        color: Colors.white24,
        child: InkWell(
          splashColor: Colors.white,
          onTap: onPressed,
          child: SizedBox(
            width: 64,
            height: 64,
            child: Icon(icon, color: Colors.white),
          ),
        ),
      ),
    );
  }
}
