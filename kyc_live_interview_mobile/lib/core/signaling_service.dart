// lib/core/signaling_service.dart
import 'dart:async';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'package:flutter/services.dart' show PlatformException;

import '../utils/config.dart';

class SignalingService {
  SignalingService._internal();
  static final SignalingService instance = SignalingService._internal();

  // ----------------------- Socket -----------------------
  IO.Socket? _socket;

  // ----------------------- WebRTC -----------------------
  RTCPeerConnection? _pc;
  MediaStream? _localStream;
  MediaStream? _remoteStream;

  // Fixed transceivers (audio first, then video ⇒ stable m-line ordering)
  RTCRtpTransceiver? _tAudio;
  RTCRtpTransceiver? _tVideo;

  // ----------------------- Room / role -----------------------
  String? _roomId;
  bool _joinedOnce = false;
  bool _isCaller = false;

  // ----------------------- Perfect-Negotiation helpers -----------------------
  bool _polite = true;          // second joiner is polite
  bool _makingOffer = false;
  bool _ignoreOffer = false;

  // candidates must wait until remote SDP applied
  bool _remoteSdpApplied = false;
  final List<Map<String, dynamic>> _pendingCandidates = [];

  // lifecycle guards
  bool _dead = false;
  bool _inLeave = false;

  // drop/resume
  String? _dropRole;
  String? get lastDropRole => _dropRole;

  // ----------------------- Peer presence (prevents early offers) -----------------------
  bool _peerPresent = false;

  // ----------------------- Events -----------------------
  final _unauthCtrl = StreamController<String>.broadcast();
  Stream<String> get onUnauthorized => _unauthCtrl.stream;

  final _meetingEndedCtrl = StreamController<String>.broadcast();
  Stream<String> get onMeetingEndedStream => _meetingEndedCtrl.stream;

  final _dropSecondsCtrl = StreamController<int>.broadcast();
  Stream<int> get dropSecondsStream => _dropSecondsCtrl.stream;
  Timer? _dropTicker;
  DateTime? _dropDeadline;

  // ----------------------- Log -----------------------
  bool _verbose = false;
  void setVerbose(bool v) => _verbose = v;
  void _log(Object? msg) { if (_verbose) print('[RTC] $msg'); }

  // ----------------------- Config -----------------------
  static const Map<String, dynamic> _rtcConfig = {
    'iceServers': [
      {'urls': 'stun:stun.l.google.com:19302'},
    ],
    'sdpSemantics': 'unified-plan',
  };

  RTCPeerConnection? get peerConnection => _pc;
  MediaStream? getLocalStream() => _localStream;
  MediaStream? getRemoteStream() => _remoteStream;

  // ----------------------- Signaling state cache -----------------------
  RTCSignalingState? _sigState; // treat null as STABLE until first callback
  RTCSignalingState _getSig() =>
      _sigState ?? RTCSignalingState.RTCSignalingStateStable;
  bool _isStable([RTCSignalingState? s]) =>
      (s ?? _getSig()) == RTCSignalingState.RTCSignalingStateStable;

  // ----------------------- Negotiation queue/debounce + watch -----------------------
  bool _needOffer = false;
  Timer? _negoDebounce;

  Timer? _negoWatch;                 // periodic watcher
  DateTime? _negoWatchDeadline;      // stops after a short window

  void _stopNegotiationWatch() {
    _negoWatch?.cancel();
    _negoWatch = null;
    _negoWatchDeadline = null;
  }

  void _startNegotiationWatch({String reason = ''}) {
    _stopNegotiationWatch();
    _negoWatchDeadline = DateTime.now().add(const Duration(seconds: 6));
    _negoWatch = Timer.periodic(const Duration(milliseconds: 150), (_) {
      final pc = _pc;
      if (pc == null || _dead) { _stopNegotiationWatch(); return; }

      final st = _getSig();
      if (_isStable(st) && !_makingOffer && _needOffer) {
        _log('Negotiation watch → STABLE, sending offer${reason.isNotEmpty ? ' ($reason)' : ''}');
        _needOffer = false;
        _stopNegotiationWatch();
        _makeOffer();
        return;
      }

      if (_negoWatchDeadline != null && DateTime.now().isAfter(_negoWatchDeadline!)) {
        _log('Negotiation watch timed out (state=$st). Will rely on next signaling change / answer to retry.');
        _stopNegotiationWatch();
      }
    });

    _log('Negotiation watch started${reason.isNotEmpty ? ' ($reason)' : ''}');
  }

  void _requestOffer({String reason = ''}) {
    if (_dead || _pc == null) return;
    _needOffer = true;

    final st = _getSig();
    _log('Request offer (state=$st)${reason.isNotEmpty ? ' - $reason' : ''}');

    // If already stable (or unknown ⇒ treated as stable), fire immediately.
    if (_isStable(st) && !_makingOffer) {
      scheduleMicrotask(() {
        if (_pc == null || _dead) return;
        _needOffer = false;
        _makeOffer();
      });
      return;
    }

    // Otherwise, coalesce a quick attempt...
    _negoDebounce?.cancel();
    _negoDebounce = Timer(const Duration(milliseconds: 120), () {
      if (_pc == null || _dead) return;
      final st2 = _getSig();
      if (_isStable(st2) && !_makingOffer) {
        _needOffer = false;
        _makeOffer();
      } else {
        _log('Debounced renegotiation waiting for STABLE... (state=$st2)');
        _startNegotiationWatch(reason: reason);
      }
    });

    _log('Queued renegotiation${reason.isNotEmpty ? ' ($reason)' : ''}');
  }

  // ======================================================
  //                       SOCKET
  // ======================================================
  Future<void> connectSocket(String baseUrl) async {
    if (_socket != null) return;

    final s = IO.io(
      baseUrl,
      IO.OptionBuilder()
          .setPath(AppConfig.socketPath)
          .setTransports(['websocket'])
          .enableReconnection()
          .setReconnectionAttempts(10)
          .setReconnectionDelay(500)
          .setQuery({'token': AppConfig.jwt, 'role': 'customer'})
          .disableAutoConnect()
          .build(),
    );
    _socket = s;

    s.onConnect((_) => _log('Socket connected: ${s.id}'));
    s.onConnectError((err) => _log('Socket connect_error: $err'));
    s.onReconnectError((err) => _log('Socket reconnect_error: $err'));
    s.onDisconnect((reason) => _log('Socket disconnected: $reason'));

    s.on('unauthorized', (data) {
      final msg = data?.toString() ?? 'unauthorized';
      _log('Socket unauthorized: $msg');
      _unauthCtrl.add(msg);
      try { s.disconnect(); s.dispose(); } catch (_) {}
      _socket = null;
    });

    // Global meeting end broadcast
    s.on('meetingEnded', (data) async {
      final by = (data is Map && data['by'] != null) ? '${data['by']}' : '';
      _log('meetingEnded (global): $by');
      _cancelDropCountdown();
      await leaveMeetingRoom();
      _meetingEndedCtrl.add(by);
    });

    s.connect();
  }

  // ======================================================
  //                     LOCAL MEDIA
  // ======================================================
  Future<String> _initLocalMedia(void Function(MediaStream?)? onLocal) async {
    _localStream = null;

    try {
      final s = await navigator.mediaDevices.getUserMedia({
        'audio': true,
        'video': {
          'facingMode': 'user',
          'width': {'ideal': 1280},
          'height': {'ideal': 720},
          'frameRate': {'ideal': 30},
        }
      });
      _localStream = s;
      onLocal?.call(_localStream);
      _log('Got local A/V');
      return 'av';
    } catch (e1) {
      _log('getUserMedia (A/V) failed → $e1');
    }

    try {
      final s = await navigator.mediaDevices.getUserMedia({
        'audio': true,
        'video': false,
      });
      _localStream = s;
      onLocal?.call(_localStream);
      _log('Got local audio-only');
      return 'audio';
    } catch (e2) {
      _log('getUserMedia (audio-only) failed → recvonly. $e2');
      return 'none';
    }
  }

  void _stopLocalTracks() {
    try { _localStream?.getTracks().forEach((t) => t.stop()); } catch (_) {}
    _localStream = null;
  }

  // ======================================================
  //                  PEER CONNECTION
  // ======================================================
  Future<void> _ensurePeer(void Function(MediaStream?)? onRemote) async {
    if (_pc != null) return;

    final pc = await createPeerConnection(_rtcConfig);
    _pc = pc;

    // assume STABLE until we get the first callback from the platform
    _sigState = RTCSignalingState.RTCSignalingStateStable;
    _log('PC created; assuming initial signaling=STABLE');

    // One remote container stream we keep reusing.
    _remoteStream ??= await createLocalMediaStream('remote');

    final ls = _localStream;
    final hasAudio = ls?.getAudioTracks().isNotEmpty ?? false;
    final hasVideo = ls?.getVideoTracks().isNotEmpty ?? false;

    // Fixed audio → video order (prevents m-line reorder problems)
    _tAudio = await pc.addTransceiver(
      kind: RTCRtpMediaType.RTCRtpMediaTypeAudio,
      init: RTCRtpTransceiverInit(
        direction: hasAudio
            ? TransceiverDirection.SendRecv
            : TransceiverDirection.RecvOnly,
      ),
    );
    _tVideo = await pc.addTransceiver(
      kind: RTCRtpMediaType.RTCRtpMediaTypeVideo,
      init: RTCRtpTransceiverInit(
        direction: hasVideo
            ? TransceiverDirection.SendRecv
            : TransceiverDirection.RecvOnly,
      ),
    );

    if (hasAudio) {
      try { await _tAudio!.sender.replaceTrack(ls!.getAudioTracks().first); } catch (_) {}
    }
    if (hasVideo) {
      try { await _tVideo!.sender.replaceTrack(ls!.getVideoTracks().first); } catch (_) {}
    }

    pc.onIceCandidate = (c) {
      if (_dead) return;
      final cand = c.candidate;
      final s = _socket;
      final rid = _roomId;
      if (cand == null || s == null || rid == null) return;

      s.emit('candidate', {
        'room': rid,
        'candidate': {
          'candidate': cand,
          'sdpMid': c.sdpMid,
          'sdpMLineIndex': c.sdpMLineIndex,
        },
        'from': s.id, // allows clients to ignore own echoes
      });
    };

    pc.onTrack = (e) async {
      if (_dead) return;
      if (e.streams.isNotEmpty) {
        _remoteStream = e.streams.first;
      } else {
        _remoteStream ??= await createLocalMediaStream('remote');
        try { _remoteStream!.addTrack(e.track); } catch (_) {}
      }
      onRemote?.call(_remoteStream);
    };

    pc.onConnectionState = (s) => _log('PC state: $s');

    // Fire queued renegotiation when we become STABLE
    pc.onSignalingState = (s) {
      _sigState = s;
      _log('PC signaling: $s');
      if (_isStable(s) && _needOffer && !_makingOffer) {
        _needOffer = false;
        _stopNegotiationWatch();
        _makeOffer();
      }
    };

    pc.onIceConnectionState = (s) => _log('ICE state: $s');

    // Let either side drive renegotiation; glare handled by perfect-negotiation logic
    pc.onRenegotiationNeeded = () {
      if (_pc == null) return;
      _requestOffer(reason: 'onRenegotiationNeeded');
    };

    await _flushPendingCandidates();
  }

  Future<void> _closePc() async {
    final pc = _pc;
    if (pc != null) {
      try {
        try {
          final senders = await pc.getSenders();
          for (final s in senders) { try { await s.replaceTrack(null); } catch (_) {} }
        } catch (_) {}
        try {
          final tx = await pc.getTransceivers();
          for (final t in tx) { try { await t.stop(); } catch (_) {} }
        } catch (_) {}

        pc.onIceCandidate = null;
        pc.onTrack = null;
        pc.onConnectionState = null;
        pc.onSignalingState = null;
        pc.onIceConnectionState = null;

        await pc.close();
        try { await pc.dispose(); } catch (_) {}
      } catch (_) {}
    }
    _pc = null;
    _tAudio = null;
    _tVideo = null;
    _sigState = null;
  }

  // If a transceiver got disposed mid-race, re-create it safely
  Future<RTCRtpTransceiver> _ensureTxAlive({
    required RTCRtpTransceiver? tx,
    required RTCRtpMediaType kind,
    required bool wantSend,
  }) async {
    final pc = _pc!;
    final desired =
    wantSend ? TransceiverDirection.SendRecv : TransceiverDirection.RecvOnly;

    if (tx == null) {
      return await pc.addTransceiver(
        kind: kind,
        init: RTCRtpTransceiverInit(direction: desired),
      );
    }
    try {
      await tx.setDirection(desired);
      return tx;
    } on PlatformException catch (e) {
      final msg = (e.message ?? '').toLowerCase();
      if (msg.contains('disposed')) {
        return await pc.addTransceiver(
          kind: kind,
          init: RTCRtpTransceiverInit(direction: desired),
        );
      }
      rethrow;
    } catch (_) {
      return await pc.addTransceiver(
        kind: kind,
        init: RTCRtpTransceiverInit(direction: desired),
      );
    }
  }

  // ======================================================
  //                 PERFECT NEGOTIATION
  // ======================================================
  Future<void> _makeOffer() async {
    final pc = _pc;
    final s = _socket;
    final rid = _roomId;
    if (pc == null || s == null || rid == null || _dead) return;

    if (!_isStable()) {
      _log('Skip offer (not stable) → will retry when stable.');
      _needOffer = true; // ensure it will fire when back to stable
      _startNegotiationWatch(reason: 'makeOffer-guard');
      return;
    }
    try {
      _makingOffer = true;
      final offer = await pc.createOffer();
      // double-check still stable
      if (!_isStable()) {
        _log('Offer created but state changed; aborting setLocalDescription.');
        _needOffer = true;
        _startNegotiationWatch(reason: 'post-createOffer');
        return;
      }
      await pc.setLocalDescription(offer);
      s.emit('offer', {
        'room': rid,
        'sdp': {'type': offer.type, 'sdp': offer.sdp},
        'from': s.id,
      });
      _log('Offer sent');
    } catch (e) {
      final msg = '$e';
      if (msg.contains('order of m-lines')) {
        // Rare: differing transceiver orders after a race → rebuild + ICE restart
        await _recoverFromMLineMismatch(null);
        return;
      }
      _log('makeOffer error: $e');
    } finally {
      _makingOffer = false;
    }
  }

  Future<void> _recoverFromMLineMismatch(void Function(MediaStream?)? onRemote) async {
    _log('m-line mismatch detected — hard recovery.');
    await _resetPeer(onRemote);
    if (_pc != null) {
      try {
        final offer = await _pc!.createOffer({'iceRestart': true});
        await _pc!.setLocalDescription(offer);
        _socket?.emit('offer', {
          'room': _roomId,
          'sdp': {'type': offer.type, 'sdp': offer.sdp},
          'from': _socket?.id,
        });
        _log('Recovery offer sent (ICE restart).');
      } catch (e) {
        _log('Recovery renegotiation failed: $e');
      }
    }
  }

  // ======================================================
  //                     JOIN / SIGNALS
  // ======================================================
  Future<void> joinMeetingRoom(
      String roomId, {
        void Function(MediaStream?)? onLocal,
        void Function(MediaStream?)? onRemote,
        void Function()? onPeerJoined,
        void Function()? onPeerLeft,
      }) async {
    if (_joinedOnce) return;
    _joinedOnce = true;
    _dead = false;
    _roomId = roomId;

    onLocal?.call(null); // UI clears local preview until user taps "Start")

    final s = _socket;
    if (s == null) return;

    await _ensurePeer(onRemote);

    void doJoin() => s.emit('joinRoom', _roomId);
    if (s.connected) doJoin(); else s.once('connect', (_) => doJoin());

    // ---- server says how many are in room (1 ⇒ I am caller)
    s.on('roomJoined', (data) async {
      if (_dead) return;
      final participants = (data is Map && data['participants'] is int)
          ? data['participants'] as int
          : 0;
      _isCaller = participants == 1;
      _polite = !_isCaller;
      _peerPresent = participants >= 2;   // informative presence
      _log('roomJoined: participants=$participants, isCaller=$_isCaller, polite=$_polite, peerPresent=$_peerPresent');
    });

    // ---- partner joined → initial offer by caller
    s.on('peerJoined', (_) async {
      if (_dead) return;
      _peerPresent = true;
      onPeerJoined?.call();
      if (_isCaller) _requestOffer(reason: 'peerJoined');
    });

    // ---- server chooses who is caller (also on resume); only offer if peer present
    s.on('setCaller', (callerId) async {
      if (_dead) return;
      final wasCaller = _isCaller;
      _isCaller = (s.id != null && s.id == callerId);
      _polite = !_isCaller;
      _log('setCaller → isCaller=$_isCaller, polite=$_polite (was=$wasCaller), peerPresent=$_peerPresent');

      await _ensurePeer(onRemote); // in case PC was rebuilt
      if (_isCaller && _peerPresent) {
        _requestOffer(reason: 'setCaller+peerPresent');
      }
    });

    // ========== SDP / ICE ==========
    s.on('offer', (payload) async {
      if (_dead) return;
      if (payload is Map && '${payload['from'] ?? ''}' == s.id) return; // ignore own echo

      final dynamic sdpDyn = (payload is Map) ? payload['sdp'] : null;
      if (sdpDyn == null) return;
      final Map<String, dynamic> sdp = Map<String, dynamic>.from(sdpDyn as Map);

      await _ensurePeer(onRemote);

      final isOffer = (sdp['type']?.toString() ?? '') == 'offer';
      final offerCollision = isOffer && (_makingOffer || !_isStable());

      _ignoreOffer = !_polite && offerCollision;
      if (_ignoreOffer) {
        _log('Ignoring remote offer due to glare (impolite)');
        return;
      }

      try {
        await _pc?.setRemoteDescription(
          RTCSessionDescription('${sdp['sdp']}', '${sdp['type']}'),
        );
        _remoteSdpApplied = true;
        await _flushPendingCandidates();

        if (isOffer) {
          final answer = await _pc!.createAnswer();
          await _pc!.setLocalDescription(answer);
          s.emit('answer', {
            'room': _roomId,
            'sdp': {'type': answer.type, 'sdp': answer.sdp},
            'from': s.id,
          });
          _log('Answer sent');
        }
      } catch (e) {
        _log('offer handler error: $e');
      }
    });

    s.on('answer', (payload) async {
      if (_dead) return;
      if (payload is Map && '${payload['from'] ?? ''}' == s.id) return; // ignore own echo

      final dynamic sdpDyn = (payload is Map) ? payload['sdp'] : null;
      if (sdpDyn == null) return;
      final Map<String, dynamic> sdp = Map<String, dynamic>.from(sdpDyn as Map);

      final pc = _pc;
      if (pc == null) return;

      try {
        await pc.setRemoteDescription(
          RTCSessionDescription('${sdp['sdp']}', '${sdp['type']}'),
        );
        _remoteSdpApplied = true;
        await _flushPendingCandidates();

        if (_needOffer && _isStable() && !_makingOffer) {
          _log('Post-answer: outstanding offer request detected → sending offer');
          _needOffer = false;
          _stopNegotiationWatch();
          _makeOffer();
        }
        _log('Answer applied');
      } catch (e) {
        _log('setRemoteDescription(answer) error: $e');
      }
    });

    s.on('candidate', (payload) async {
      if (_dead) return;
      if (payload is Map && '${payload['from'] ?? ''}' == s.id) return; // ignore own echo

      final dynamic candMapDyn = (payload is Map) ? payload['candidate'] : null;
      if (candMapDyn == null) return;
      final Map<String, dynamic> c = Map<String, dynamic>.from(candMapDyn as Map);

      if (_pc == null || !_remoteSdpApplied) {
        _pendingCandidates.add(c);
        return;
      }

      try {
        await _pc?.addCandidate(RTCIceCandidate(
          '${c['candidate']}',
          c['sdpMid'] as String?,
          (c['sdpMLineIndex'] ?? c['sdpMlineIndex']) as int?,
        ));
      } catch (e) {
        _log('addIceCandidate error: $e');
      }
    });

    // partner left → keep PC but reset receivers so we can receive again later
    s.on('peerLeft', (_) async {
      if (_dead) return;
      _peerPresent = false;
      onRemote?.call(null);
      await _resetPeer(onRemote);
      onPeerLeft?.call();
    });

    s.on('full', (_) {
      if (_dead) return;
      _log('Room is full!');
      leaveMeetingRoom();
    });

    // drop / resume
    s.on('participantDropped', (data) {
      _dropRole = (data is Map && data['role'] != null) ? '${data['role']}' : null;

      final int timeout =
      (data is Map && data['timeoutSeconds'] is int) ? data['timeoutSeconds'] as int : 60;
      _dropDeadline = DateTime.now().add(Duration(seconds: timeout));
      _dropSecondsCtrl.add(timeout);
      _dropTicker?.cancel();
      _dropTicker = Timer.periodic(const Duration(seconds: 1), (t) {
        final left = _dropDeadline!.difference(DateTime.now()).inSeconds;
        final clamped = left.clamp(0, timeout);
        _dropSecondsCtrl.add(clamped);
        if (left <= 0) {
          _dropTicker?.cancel();
          _dropTicker = null;
        }
      });
    });

    s.on('participantRejoined', (data) async {
      final String role = (data is Map && data['role'] != null) ? '${data['role']}' : '';
      _dropRole = null;
      _cancelDropCountdown();

      _peerPresent = true;              // peer is back
      await _resetPeer(onRemote);       // clear old receivers/ICE

      if (_isCaller) {
        _requestOffer(reason: 'participantRejoined');
        _log('Participant rejoined → I am caller, sending offer.');
      } else {
        _log('Participant rejoined → not caller (role=$role), waiting for remote offer.');
      }
    });

    _log('Joined room $_roomId (PC ready with recvonly, waiting for partner)');
  }

  // start mic/cam and renegotiate (user taps "Start")
  Future<void> startLocalAndRenegotiate({void Function(MediaStream?)? onLocal}) async {
    final mode = await _initLocalMedia(onLocal);
    await _ensurePeer(null);

    final pc = _pc;
    final ls = _localStream;
    if (pc != null && ls != null) {
      final hasA = ls.getAudioTracks().isNotEmpty;
      final hasV = ls.getVideoTracks().isNotEmpty;

      _tAudio = await _ensureTxAlive(
        tx: _tAudio,
        kind: RTCRtpMediaType.RTCRtpMediaTypeAudio,
        wantSend: hasA,
      );
      _tVideo = await _ensureTxAlive(
        tx: _tVideo,
        kind: RTCRtpMediaType.RTCRtpMediaTypeVideo,
        wantSend: hasV,
      );

      if (hasA) { try { await _tAudio!.sender.replaceTrack(ls.getAudioTracks().first); } catch (_) {} }
      if (hasV) { try { await _tVideo!.sender.replaceTrack(ls.getVideoTracks().first); } catch (_) {} }
    }

    _requestOffer(reason: 'startLocal');
    _log('startLocalAndRenegotiate done (mode=$mode)');
  }

  // ======================================================
  //                     UTILITIES
  // ======================================================
  Future<void> _resetPeer(void Function(MediaStream?)? onRemote) async {
    await _closePc();
    _remoteStream = null;
    _remoteSdpApplied = false;
    _pendingCandidates.clear();
    onRemote?.call(null);

    if (!_dead) {
      await _ensurePeer(onRemote);
      final ls = _localStream;
      if (ls != null && _pc != null) {
        final hasA = ls.getAudioTracks().isNotEmpty;
        final hasV = ls.getVideoTracks().isNotEmpty;

        _tAudio = await _ensureTxAlive(
          tx: _tAudio,
          kind: RTCRtpMediaType.RTCRtpMediaTypeAudio,
          wantSend: hasA,
        );
        if (hasA) { try { await _tAudio!.sender.replaceTrack(ls.getAudioTracks().first); } catch (_) {} }

        _tVideo = await _ensureTxAlive(
          tx: _tVideo,
          kind: RTCRtpMediaType.RTCRtpMediaTypeVideo,
          wantSend: hasV,
        );
        if (hasV) { try { await _tVideo!.sender.replaceTrack(ls.getVideoTracks().first); } catch (_) {} }
      }
    }
  }

  Future<void> _flushPendingCandidates() async {
    if (_pc == null || !_remoteSdpApplied || _pendingCandidates.isEmpty) return;
    final buf = List<Map<String, dynamic>>.from(_pendingCandidates);
    _pendingCandidates.clear();
    for (final c in buf) {
      try {
        await _pc!.addCandidate(RTCIceCandidate(
          '${c['candidate']}',
          c['sdpMid'] as String?,
          (c['sdpMLineIndex'] ?? c['sdpMlineIndex']) as int?,
        ));
      } catch (_) {}
    }
  }

  void endMeeting({String who = 'customer'}) {
    final s = _socket;
    final sid = _roomId;
    if (s == null || !s.connected || sid == null) return;
    s.emit('endMeeting', {'sessionId': sid, 'by': who});
  }

  Future<void> leaveMeetingRoom({bool closeSocket = false}) async {
    if (_inLeave) return;
    _inLeave = true;
    _dead = true;

    final s = _socket;
    final rid = _roomId;

    try { if (s != null && rid != null) s.emit('leaveRoom', rid); } catch (_) {}

    try {
      s?.off('roomJoined');
      s?.off('peerJoined');
      s?.off('setCaller');
      s?.off('offer');
      s?.off('answer');
      s?.off('candidate');
      s?.off('peerLeft');
      s?.off('full');
      s?.off('participantDropped');
      s?.off('participantRejoined');
    } catch (_) {}

    _cancelDropCountdown();

    _stopLocalTracks();
    await _closePc();

    _remoteStream = null;
    _roomId = null;
    _isCaller = false;
    _joinedOnce = false;
    _remoteSdpApplied = false;
    _pendingCandidates.clear();
    _polite = true;
    _makingOffer = false;
    _ignoreOffer = false;
    _dropRole = null;
    _verbose = false;

    _peerPresent = false;

    _negoDebounce?.cancel(); _negoDebounce = null;
    _stopNegotiationWatch();
    _needOffer = false;

    if (closeSocket && s != null) {
      try { s.disconnect(); s.dispose(); } catch (_) {}
      _socket = null;
    }
    _inLeave = false;
  }

  void _cancelDropCountdown() {
    _dropTicker?.cancel(); _dropTicker = null;
    _dropDeadline = null;
    _dropSecondsCtrl.add(0);
  }

  void toggleTrack(String type, {void Function(bool enabled)? updateUI}) async {
    final ls = _localStream;
    if (ls == null) return;

    final MediaStreamTrack? track =
    (type == 'video')
        ? (ls.getVideoTracks().isNotEmpty ? ls.getVideoTracks().first : null)
        : (ls.getAudioTracks().isNotEmpty ? ls.getAudioTracks().first : null);
    if (track == null) return;

    final enabled = !track.enabled;
    track.enabled = enabled;

    try {
      if (type == 'audio') {
        _tAudio = await _ensureTxAlive(
          tx: _tAudio,
          kind: RTCRtpMediaType.RTCRtpMediaTypeAudio,
          wantSend: enabled,
        );
        await _tAudio!.sender.replaceTrack(enabled ? track : null);
      } else {
        _tVideo = await _ensureTxAlive(
          tx: _tVideo,
          kind: RTCRtpMediaType.RTCRtpMediaTypeVideo,
          wantSend: enabled,
        );
        await _tVideo!.sender.replaceTrack(enabled ? track : null);
      }
    } catch (_) {}

    updateUI?.call(enabled);

    // Ensure the other side learns about direction changes
    _requestOffer(reason: 'toggleTrack');
  }

  // (Optional) stats helper
  Future<Map<String, dynamic>> getStatsSummary() async {
    final pc = _pc;
    if (pc == null) return {};
    dynamic raw;
    try { raw = await pc.getStats(); } catch (_) { return {}; }

    List<Map<String, dynamic>> items = [];
    if (raw is Map) {
      for (final v in raw.values) { try { items.add(Map<String, dynamic>.from(v as Map)); } catch (_) {} }
    } else if (raw is List) {
      for (final e in raw) {
        if (e is Map) items.add(Map<String, dynamic>.from(e));
      }
    }

    Map<String, dynamic>? outboundVideo, inboundVideo, selectedPair;
    dynamic pick(Map<String, dynamic> m, List<String> keys) {
      for (final k in keys) { if (m.containsKey(k) && m[k] != null) return m[k]; }
      return null;
    }

    bool isVideoOut(Map<String, dynamic> m) {
      final type = '${m['type']}';
      final kind = '${m['kind'] ?? m['mediaType'] ?? ''}';
      return type.contains('outbound-rtp') && (kind.isEmpty || kind == 'video');
    }
    bool isVideoIn(Map<String, dynamic> m) {
      final type = '${m['type']}';
      final kind = '${m['kind'] ?? m['mediaType'] ?? ''}';
      return type.contains('inbound-rtp') && (kind.isEmpty || kind == 'video');
    }
    bool isSelectedPair(Map<String, dynamic> m) {
      final type = '${m['type']}';
      if (!type.contains('candidate-pair')) return false;
      final sel = pick(m, ['selected', 'nominated', 'state']);
      if (sel is bool) return sel;
      if (sel is String) return sel == 'succeeded' || sel == 'selected' || sel == 'true';
      return false;
    }

    for (final m in items) {
      outboundVideo ??= isVideoOut(m) ? m : null;
      inboundVideo ??= isVideoIn(m) ? m : null;
      selectedPair ??= isSelectedPair(m) ? m : null;
      if (outboundVideo != null && inboundVideo != null && selectedPair != null) break;
    }

    final videoTxFps = pick(outboundVideo ?? const {}, ['framesPerSecond', 'framesPerSecondMean', 'framerate']);
    final videoRxFps = pick(inboundVideo ?? const {}, ['framesPerSecond', 'framesPerSecondMean', 'framerate']);
    final bytesSent  = pick(outboundVideo ?? const {}, ['bytesSent', 'bytes']);
    final bytesRecv  = pick(inboundVideo ?? const {}, ['bytesReceived', 'bytes']);
    final rtt        = pick(selectedPair ?? const {}, ['currentRoundTripTime', 'rtt']);
    final outBr      = pick(selectedPair ?? const {}, ['availableOutgoingBitrate', 'availableOutgoingBitrateKbps']);
    final inBr       = pick(selectedPair ?? const {}, ['availableIncomingBitrate', 'availableIncomingBitrateKbps']);
    String? pairStr;
    if (selectedPair != null) {
      final lid = pick(selectedPair, ['localCandidateId']) ?? '';
      final rid = pick(selectedPair, ['remoteCandidateId']) ?? '';
      pairStr = 'local=$lid, remote=$rid';
    }
    return {
      'videoTxFps': videoTxFps,
      'videoRxFps': videoRxFps,
      'bytesSent': bytesSent,
      'bytesRecv': bytesRecv,
      'rtt': rtt,
      'availOutBitrate': outBr,
      'availInBitrate': inBr,
      'selectedCandidatePair': pairStr,
    };
  }
}
