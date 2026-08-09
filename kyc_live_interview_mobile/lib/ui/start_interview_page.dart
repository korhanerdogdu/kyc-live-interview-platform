import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';

class StartInterviewPage extends StatelessWidget {
  final VoidCallback onStart;

  const StartInterviewPage({required this.onStart, Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    // Ekran boyutları
    final screenHeight = MediaQuery.of(context).size.height;
    final screenWidth = MediaQuery.of(context).size.width;

    // Font ve animasyon için üst sınırlar
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
              // Başlık
              Text(
                'Görüşmeye Hazırlık',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontSize: screenWidth * 0.06 > maxTextSize
                      ? maxTextSize
                      : screenWidth * 0.06,
                ),
              ),
              SizedBox(height: screenHeight * 0.10),
              // Lottie Animasyonu
              SizedBox(
                height: screenHeight * 0.35 > maxAnimationHeight
                    ? maxAnimationHeight
                    : screenHeight * 0.35,
                child: Lottie.asset(
                  'assets/Video call.json',
                  fit: BoxFit.contain,
                ),
              ),
              const Spacer(flex: 2),
              // Bilgilendirme listesi
              Align(
                alignment: Alignment.centerLeft,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'KYC Canlı Görüşmesi’ne hoş geldiniz.',
                      textAlign: TextAlign.left,
                      style: TextStyle(
                        fontSize: screenWidth * 0.042 > 18 ? 18 : screenWidth * 0.042,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Lütfen kimliğinizi ve aydınlık bir ortamda olduğunuzu kontrol ediniz.',
                      textAlign: TextAlign.left,
                      style: TextStyle(
                        fontSize: screenWidth * 0.042 > 18 ? 18 : screenWidth * 0.042,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Görüşme sırasında kamera ve mikrofon erişimine izin vermeniz gereklidir.',
                      textAlign: TextAlign.left,
                      style: TextStyle(
                        fontSize: screenWidth * 0.042 > 18 ? 18 : screenWidth * 0.042,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              // Başla Butonu
              SizedBox(
                width: double.infinity,
                height: screenHeight * 0.065 > 56 ? 56 : screenHeight * 0.065,
                child: FilledButton(
                  onPressed: onStart,
                  child: Text(
                    'Görüşmeye Başla',
                    style: TextStyle(
                      fontSize: screenWidth * 0.045 > 20
                          ? 20
                          : screenWidth * 0.045,
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
