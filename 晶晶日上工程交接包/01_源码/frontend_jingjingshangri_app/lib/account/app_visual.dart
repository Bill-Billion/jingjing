import 'package:flutter/material.dart';
import 'account_theme.dart';

class HomeStationHero extends StatelessWidget {
  const HomeStationHero({super.key});
  @override
  Widget build(BuildContext context) => Container(
      constraints: const BoxConstraints(minHeight: 240),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: const Color(0xFF665846),
          image: const DecorationImage(
              image: AssetImage('assets/images/home-station-v2.png'),
              fit: BoxFit.cover)),
      child:
          const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('让故事与你有关',
            style: TextStyle(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.w700,
                height: 1.4)),
        SizedBox(height: 12),
        Text('选剧本、看项目，\n管理你的创作与授权。',
            style: TextStyle(color: Colors.white, fontSize: 14, height: 1.6)),
      ]));
}

/// Text remains live, accessible and independent of the decorative photograph.
class ManuscriptHero extends StatelessWidget {
  const ManuscriptHero(
      {super.key, required this.title, required this.subtitle});
  final String title, subtitle;
  @override
  Widget build(BuildContext context) => Container(
      constraints: const BoxConstraints(minHeight: 150),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: const Color(0xFFF0E5D7),
          image: const DecorationImage(
              image: AssetImage('assets/images/story-manuscript-v2.png'),
              fit: BoxFit.cover)),
      padding: const EdgeInsets.all(16),
      child: Align(
          alignment: Alignment.centerLeft,
          child: FractionallySizedBox(
              widthFactor: .66,
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(title,
                        style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w700,
                            height: 1.35)),
                    const SizedBox(height: 8),
                    Text(subtitle,
                        style: const TextStyle(fontSize: 14, height: 1.5)),
                  ]))));
}

Widget appField(String label, Widget field) =>
    Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(label,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
      const SizedBox(height: 8),
      Semantics(label: label, child: field),
    ]);

Widget appNotice(String text, {IconData icon = Icons.info_outline}) =>
    Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
            color: const Color(0xFFF0E8DE),
            borderRadius: BorderRadius.circular(10)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, color: AccountTheme.accent, size: 24),
          const SizedBox(width: 12),
          Expanded(
              child: Text(text,
                  style: const TextStyle(fontSize: 14, height: 1.5))),
        ]));

class DashedUpload extends StatelessWidget {
  const DashedUpload({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => CustomPaint(
      painter: _UploadBorder(),
      child: Padding(padding: const EdgeInsets.all(16), child: child));
}

class _UploadBorder extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..addRRect(RRect.fromRectAndRadius(
          Offset.zero & size, const Radius.circular(10)));
    final paint = Paint()
      ..color = AccountTheme.border
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    for (final metric in path.computeMetrics()) {
      for (double distance = 0; distance < metric.length; distance += 9) {
        canvas.drawPath(
            metric.extractPath(
                distance, (distance + 5).clamp(0, metric.length)),
            paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
