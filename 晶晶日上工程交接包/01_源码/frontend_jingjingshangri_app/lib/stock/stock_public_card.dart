import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../account/account_theme.dart';
import '../widgets/editorial_icons.dart';
import 'stock_models.dart';

/// The catalogue has no cover field. Keep its real title and original detail
/// flow, with an honest film-frame slot until an approved cover is supplied.
class StockPublicCard extends StatelessWidget {
  const StockPublicCard({super.key, required this.offer, required this.onTap});
  final StockOffer offer;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
      color: AccountTheme.canvas,
      child: InkWell(
          onTap: onTap,
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            CustomPaint(
                painter: const _FilmFrame(),
                child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: AspectRatio(
                        aspectRatio: 16 / 9,
                        child: ColoredBox(
                            color: const Color(0xFFE5E1D7),
                            child: Center(
                                child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                  const Icon(EditorialIcons.film,
                                      size: 24, color: AccountTheme.muted),
                                  const SizedBox(height: 6),
                                  const Text('封面待提供',
                                      style: TextStyle(
                                          fontSize: 12,
                                          height: 1.4,
                                          color: AccountTheme.muted)),
                                ])))))),
            const SizedBox(height: 5),
            Text(offer.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontFamily: AccountTheme.serif,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    height: 1.4)),
            const SizedBox(height: 3),
            const Text('查看详情与预览 ↗',
                style: TextStyle(
                    fontSize: 11, color: AccountTheme.muted, height: 1.5)),
          ])));
}

class _FilmFrame extends CustomPainter {
  const _FilmFrame();

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = AccountTheme.text);
    final hole = Paint()..color = AccountTheme.canvas;
    for (var x = 4.0; x < size.width - 4; x += 12) {
      final width = math.min(7.0, size.width - 4 - x);
      canvas.drawRect(Rect.fromLTWH(x, 2, width, 4), hole);
      canvas.drawRect(Rect.fromLTWH(x, size.height - 6, width, 4), hole);
    }
  }

  @override
  bool shouldRepaint(_FilmFrame oldDelegate) => false;
}
