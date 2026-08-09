import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../core/signaling_service.dart';

class LiveInterviewPage extends StatefulWidget {
  final String customerRepName;
  final VoidCallback onCallEnd;

  const LiveInterviewPage({
    required this.onCallEnd,
    this.customerRepName = 'Customer Representative',
    Key? key,
  }) : super(key: key);

  @override
  State<LiveInterviewPage> createState() => _LiveInterviewPageState();
}

class _LiveInterviewPageState extends State<LiveInterviewPage> {
  final sig = SignalingService.instance;

  late final RTCVideoRenderer _remoteRenderer;
  late final RTCVideoRenderer _localRenderer;
  bool _renderersReady = false;

  Offset smallVideoOffset = const Offset(16, 120);
  bool _isCameraOn = true;
  bool _isMicOn = true;
  bool _cameraPressed = false;
  bool _micPressed = false;

  Timer? _rebindTimer;
  StreamSubscription<String>? _meetingEndedSub;

  // Drop countdown subscription
  StreamSubscription<int>? _dropSub;
  int _dropLeft = 0;

  // Stats overlay
  bool _showStats = false;
  Timer? _statsTimer;
  Map<String, dynamic>? _statsSnapshot;

  @override
  void initState() {
    super.initState();
    _initRenderers();
    sig.setVerbose(true);
    _prepareLive();

    _meetingEndedSub = sig.onMeetingEndedStream.listen((by) async {
      sig.setVerbose(false);
      if (mounted) widget.onCallEnd();
    });

    _dropSub = sig.dropSecondsStream.listen((left) {
      if (!mounted) return;
      setState(() => _dropLeft = left);
    });
  }

  Future<void> _initRenderers() async {
    _remoteRenderer = RTCVideoRenderer();
    _localRenderer = RTCVideoRenderer();
    await _remoteRenderer.initialize();
    await _localRenderer.initialize();
    if (mounted) setState(() => _renderersReady = true);
  }

  void _safeBindLocal(MediaStream? s) {
    if (!_renderersReady) return;
    try { _localRenderer.srcObject = s; } catch (_) {}
  }

  void _safeBindRemote(MediaStream? s) {
    if (!_renderersReady) return;
    try { _remoteRenderer.srcObject = s; } catch (_) {}
  }

  Future<void> _prepareLive() async {
    await sig.startLocalAndRenegotiate(onLocal: (s) {
      _safeBindLocal(s);
      if (mounted) {
        setState(() {
          _isCameraOn = s?.getVideoTracks().isNotEmpty == true;
          _isMicOn    = s?.getAudioTracks().isNotEmpty == true;
        });
      }
    });
    _bindInitialStreams();
    _startRebindWatcher();
  }

  void _bindInitialStreams() {
    final local  = sig.getLocalStream();
    final remote = sig.getRemoteStream();

    _safeBindLocal(local);
    _safeBindRemote(remote);

    setState(() {
      _isCameraOn = local?.getVideoTracks().isNotEmpty == true;
      _isMicOn    = local?.getAudioTracks().isNotEmpty == true;
    });
  }

  void _startRebindWatcher() {
    _rebindTimer = Timer.periodic(const Duration(milliseconds: 350), (_) {
      if (!mounted) return;

      final currentLocal  = sig.getLocalStream();
      final currentRemote = sig.getRemoteStream();

      if (_localRenderer.srcObject != currentLocal) {
        _safeBindLocal(currentLocal);
        _isCameraOn = currentLocal?.getVideoTracks().isNotEmpty == true;
        _isMicOn    = currentLocal?.getAudioTracks().isNotEmpty == true;
        setState(() {});
      }

      if (_remoteRenderer.srcObject != currentRemote) {
        _safeBindRemote(currentRemote);
        setState(() {});
      }
    });
  }

  // ---------- stats overlay ----------
  void _toggleStats() {
    setState(() { _showStats = !_showStats; });
    if (_showStats) _startStatsLoop(); else _stopStatsLoop();
  }

  void _startStatsLoop() {
    _statsTimer?.cancel();
    _statsTimer = Timer.periodic(const Duration(seconds: 2), (_) async {
      final summary = await sig.getStatsSummary();
      if (!mounted) return;
      setState(() => _statsSnapshot = summary);
    });
  }

  void _stopStatsLoop() {
    _statsTimer?.cancel();
    _statsTimer = null;
  }

  Widget _buildStatsPanel() {
    final s = _statsSnapshot ?? const {};
    String f(dynamic v) => (v == null) ? '-' : v.toString();

    return Align(
      alignment: Alignment.topRight,
      child: Container(
        margin: const EdgeInsets.only(top: 56, right: 8),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.6),
          borderRadius: BorderRadius.circular(10),
        ),
        child: DefaultTextStyle(
          style: const TextStyle(color: Colors.white, fontSize: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('WebRTC Stats', style: TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 6),
              Text('Video TX fps:   ${f(s['videoTxFps'])}'),
              Text('Video RX fps:   ${f(s['videoRxFps'])}'),
              Text('Bytes Sent:     ${f(s['bytesSent'])}'),
              Text('Bytes Recv:     ${f(s['bytesRecv'])}'),
              Text('RTT (s):        ${f(s['rtt'])}'),
              Text('Out bitrate:    ${f(s['availOutBitrate'])}'),
              Text('In bitrate:     ${f(s['availInBitrate'])}'),
              Text('Selected pair:  ${f(s['selectedCandidatePair'])}'),
              Text('Updated:        ${DateTime.now().toIso8601String()}'),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _toggleMic() async {
    setState(() => _micPressed = true);
    await Future.delayed(const Duration(milliseconds: 120));
    sig.toggleTrack('audio', updateUI: (en) {
      if (!mounted) return;
      setState(() {
        _isMicOn = en;
        _micPressed = false;
      });
    });
  }

  Future<void> _toggleCamera() async {
    setState(() => _cameraPressed = true);
    await Future.delayed(const Duration(milliseconds: 120));
    sig.toggleTrack('video', updateUI: (en) {
      if (!mounted) return;
      setState(() {
        _isCameraOn = en;
        _cameraPressed = false;
      });
    });
  }

  @override
  void dispose() {
    _rebindTimer?.cancel();
    _meetingEndedSub?.cancel();
    _dropSub?.cancel();
    _stopStatsLoop();
    sig.setVerbose(false);

    try { _localRenderer.srcObject = null; } catch (_) {}
    try { _remoteRenderer.srcObject = null; } catch (_) {}
    // ignore: discarded_futures
    _localRenderer.dispose();
    // ignore: discarded_futures
    _remoteRenderer.dispose();

    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final remote = _remoteRenderer.srcObject;
    final remoteHasVideo = remote?.getVideoTracks().isNotEmpty == true;

    return Stack(
      children: [
        // Remote view
        Positioned.fill(
          child: !_renderersReady
              ? Container(color: const Color(0xFFF7EDF6))
              : (remote == null || !remoteHasVideo)
              ? Container(
            color: const Color(0xFFF7EDF6),
            alignment: Alignment.center,
            child: const Text(
              'Waiting for the other side…',
              style: TextStyle(color: Colors.black54, fontSize: 16),
            ),
          )
              : RTCVideoView(
            _remoteRenderer,
            key: ValueKey(remote.id),
            objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
          ),
        ),

        // Local PIP
        if (_renderersReady)
          Positioned(
            left: smallVideoOffset.dx,
            top: smallVideoOffset.dy,
            child: Draggable(
              feedback: _buildSmallVideo(120, 160),
              childWhenDragging: const SizedBox(),
              onDragEnd: (details) {
                final size = MediaQuery.of(context).size;
                const padding = 16.0;
                final topSafe = MediaQuery.of(context).padding.top + 32;
                const bottomSafe = 100 + padding;
                setState(() {
                  smallVideoOffset = _snap(
                      details.offset, size, 120, 160, padding, topSafe, bottomSafe
                  );
                });
              },
              child: _buildSmallVideo(120, 160),
            ),
          ),

        // Title + Stats toggle button
        Positioned(
          top: 28,
          left: 12,
          right: 12,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                widget.customerRepName,
                style: const TextStyle(color: Colors.white, fontSize: 16, shadows: [
                  Shadow(blurRadius: 3, color: Colors.black54, offset: Offset(0, 1))
                ]),
                textAlign: TextAlign.left,
              ),
              IconButton(
                tooltip: _showStats ? 'Hide Stats' : 'Show Stats',
                onPressed: _toggleStats,
                icon: Icon(
                  _showStats ? Icons.analytics_outlined : Icons.analytics_rounded,
                  color: Colors.white,
                ),
              ),
            ],
          ),
        ),

        if (_showStats) _buildStatsPanel(),

        // Drop banner overlay (top center)
        if (_dropLeft > 0)
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            left: 12,
            right: 12,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.amber.shade600,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                '${(sig.lastDropRole == 'operator') ? 'Operator' : 'Customer'} lost connection. '
                    'Ending automatically in $_dropLeft s if they do not return.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.black, fontWeight: FontWeight.w600),
              ),
            ),
          ),

        // Controls
        Positioned(
          left: 0,
          right: 0,
          bottom: 16,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _controlBtn(
                icon: _isCameraOn ? Icons.videocam : Icons.videocam_off,
                bg: _cameraPressed
                    ? (_isCameraOn ? Colors.red : Colors.green)
                    : Colors.grey[800]!,
                onTap: _toggleCamera,
              ),
              _controlBtn(
                icon: _isMicOn ? Icons.mic : Icons.mic_off,
                bg: _micPressed
                    ? (_isMicOn ? Colors.red : Colors.green)
                    : Colors.grey[800]!,
                onTap: _toggleMic,
              ),
              _controlBtn(
                icon: Icons.call_end,
                bg: Colors.red,
                onTap: () async {
                  sig.endMeeting(who: 'customer');
                  await sig.leaveMeetingRoom();
                  sig.setVerbose(false);
                  if (mounted) widget.onCallEnd();
                },
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _controlBtn({
    required IconData icon,
    required Color bg,
    required VoidCallback onTap,
  }) {
    return Material(
      color: bg,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 62,
          height: 62,
          child: Icon(icon, color: Colors.white, size: 32),
        ),
      ),
    );
  }

  Widget _buildSmallVideo(double w, double h) {
    final stream = _localRenderer.srcObject;
    final hasVideo = stream?.getVideoTracks().isNotEmpty == true;

    return Container(
      width: w,
      height: h,
      decoration: BoxDecoration(
        color: hasVideo ? Colors.white : Colors.black,
        border: Border.all(color: Colors.white, width: 4),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.2), blurRadius: 8)],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: hasVideo
            ? RTCVideoView(
          _localRenderer,
          key: ValueKey(stream!.id),
          objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitContain,
          mirror: true,
        )
            : const Center(
          child: Icon(Icons.videocam_off, color: Colors.white, size: 40),
        ),
      ),
    );
  }

  Offset _snap(
      Offset o,
      Size screen,
      double w,
      double h,
      double pad,
      double topSafe,
      double bottomSafe,
      ) {
    double dx = o.dx, dy = o.dy;
    final left = dx,
        right = screen.width - dx - w,
        top = dy,
        bottom = screen.height - dy - h - bottomSafe;
    final min = [left, right, top, bottom].reduce((a, b) => a < b ? a : b);
    if (min == left) {
      dx = pad;
    } else if (min == right) {
      dx = screen.width - w - pad;
    }
    if (min == top) {
      dy = topSafe;
    } else if (min == bottom) {
      dy = screen.height - h - bottomSafe;
    }
    dx = dx.clamp(pad, screen.width - w - pad);
    dy = dy.clamp(topSafe, screen.height - h - bottomSafe);
    return Offset(dx, dy);
  }
}
