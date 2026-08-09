import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:kyc_live_interview_mobile/core/signaling_service.dart';
import 'ui/start_interview_page.dart';
import 'ui/waiting_interview_page.dart';
import 'ui/live_interview_page.dart';
import 'services/api_service.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});
  @override
  Widget build(BuildContext context) {
    return const MaterialApp(title: 'KYC Video Call', home: InterviewFlow());
  }
}

class InterviewFlow extends StatefulWidget {
  const InterviewFlow({super.key});
  @override
  State<InterviewFlow> createState() => _InterviewFlowState();
}

class _InterviewFlowState extends State<InterviewFlow> {
  // 0: Start, 1: Waiting, 2: Live
  int _step = 0;
  String? _meetingId;
  bool _loading = false;

  Future<void> _handleStart() async {
    setState(() => _loading = true);
    try {
      final id = await ApiService.I.startMeeting(customerId: 'mobile-user-123');
      setState(() {
        _meetingId = id;
        _step = 1; // to Waiting
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Start error: $e')));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _cancel() {
    setState(() {
      _meetingId = null;
      _step = 0;
    });
  }

  Future<void> _goLive() async {
    // Show verbose logs only on Live screen
    SignalingService.instance.setVerbose(true);
    if (!mounted) return;
    setState(() => _step = 2);
  }

  Future<void> _endCall() async {
    // 1) Tear down WebRTC + mute logs
    await SignalingService.instance.leaveMeetingRoom();
    SignalingService.instance.setVerbose(false);

    // 2) Remove Live page immediately
    if (mounted) {
      setState(() {
        _meetingId = null;
        _step = 0;
      });
    }

    // 3) Small toast after rebuild
    SchedulerBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Call ended'), duration: Duration(seconds: 2)),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    Widget page;
    if (_step == 0) {
      page = StartInterviewPage(onStart: _handleStart);
    } else if (_step == 1) {
      page = WaitingInterviewPage(
        meetingId: _meetingId!,
        onOperatorJoined: _goLive,
        onCancel: _cancel,
      );
    } else {
      page = LiveInterviewPage(onCallEnd: _endCall);
    }

    return Scaffold(
      body: Stack(
        children: [
          Center(child: page),
          if (_loading)
            Container(
              color: Colors.black45,
              child: const Center(child: CircularProgressIndicator()),
            ),
        ],
      ),
    );
  }
}
