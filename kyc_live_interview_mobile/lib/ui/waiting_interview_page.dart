import 'dart:async';
import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';
import '../core/signaling_service.dart';
import '../utils/config.dart';

class WaitingInterviewPage extends StatefulWidget {
  final String meetingId;
  final VoidCallback onOperatorJoined;
  final VoidCallback onCancel;

  const WaitingInterviewPage({
    required this.meetingId,
    required this.onOperatorJoined,
    required this.onCancel,
    Key? key,
  }) : super(key: key);

  @override
  State<WaitingInterviewPage> createState() => _WaitingInterviewPageState();
}

class _WaitingInterviewPageState extends State<WaitingInterviewPage> {
  final sig = SignalingService.instance;
  bool _joined = false;

  // Gate to disable callbacks once we leave this page
  bool _active = true;

  StreamSubscription<String>? _unauthSub;
  StreamSubscription<String>? _endedSub;

  @override
  void initState() {
    super.initState();
    _initSocketAndJoin();
  }

  Future<void> _initSocketAndJoin() async {
    // Connect socket (no local media on waiting page)
    await sig.connectSocket(AppConfig.socketOrigin);

    _unauthSub = sig.onUnauthorized.listen((msg) async {
      if (!_active || !mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unauthorized: $msg')),
      );
      await sig.leaveMeetingRoom();
      widget.onCancel();
    });

    _endedSub = sig.onMeetingEndedStream.listen((_) async {
      if (!_active || !mounted) return;
      await sig.leaveMeetingRoom();
      widget.onCancel();
    });

    if (mounted && !_joined) {
      _joined = true;
      await sig.joinMeetingRoom(
        widget.meetingId,
        onLocal: null, // no local media in waiting
        onRemote: (s) {
          if (!_active || !mounted) return;
          if (s != null) {
            _active = false;
            widget.onOperatorJoined();
          }
        },
        onPeerJoined: () {
          // NEW: navigate to Live as soon as peer arrives
          if (!_active || !mounted) return;
          _active = false;
          widget.onOperatorJoined();
        },
        onPeerLeft: () async {
          if (!_active || !mounted) return;
          await sig.leaveMeetingRoom();
          widget.onCancel();
        },
      );
    }
  }

  @override
  void dispose() {
    _active = false; // disarm callbacks on teardown
    _unauthSub?.cancel();
    _endedSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;
    final screenWidth = MediaQuery.of(context).size.width;

    final maxTextSize = 28.0;
    final maxAnimationHeight = 350.0;
    final basePadding = screenHeight * 0.03 > 32 ? 32.0 : screenHeight * 0.03;

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: screenWidth * 0.06),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              SizedBox(height: basePadding),
              Text(
                'Waiting for Connection',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontSize: screenWidth * 0.06 > maxTextSize
                      ? maxTextSize
                      : screenWidth * 0.06,
                ),
              ),
              SizedBox(height: screenHeight * 0.10),
              SizedBox(
                height: screenHeight * 0.35 > maxAnimationHeight
                    ? maxAnimationHeight
                    : screenHeight * 0.35,
                child: Lottie.asset('assets/Waiting.json', fit: BoxFit.contain),
              ),
              const Spacer(flex: 2),
              Align(
                alignment: Alignment.centerLeft,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Waiting for the KYC specialist to join...',
                      style: TextStyle(
                        fontSize: screenWidth * 0.042 > 18 ? 18 : screenWidth * 0.042,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Please have your ID ready in a well-lit environment.',
                      style: TextStyle(
                        fontSize: screenWidth * 0.042 > 18 ? 18 : screenWidth * 0.042,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Do not exit the app until the connection is established.',
                      style: TextStyle(
                        fontSize: screenWidth * 0.042 > 18 ? 18 : screenWidth * 0.042,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                height: screenHeight * 0.065 > 56 ? 56 : screenHeight * 0.065,
                child: FilledButton(
                  onPressed: () async {
                    await sig.leaveMeetingRoom();
                    if (mounted) widget.onCancel();
                  },
                  child: Text(
                    'Cancel',
                    style: TextStyle(
                      fontSize: screenWidth * 0.045 > 20 ? 20 : screenWidth * 0.045,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}
