import 'package:flutter/material.dart';
import '../account/account_theme.dart';
import '../account/account_session.dart';
import 'stock_public_media.dart';
import 'stock_models.dart';

/// Catalogue covers are read separately from the immutable purchase offer.
class StockPublicCard extends StatelessWidget {
  const StockPublicCard(
      {super.key,
      required this.session,
      required this.offer,
      required this.onTap,
      this.onRefreshOffer});
  final AccountSession session;
  final VoidCallback? onRefreshOffer;
  final StockOffer offer;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
      color: AccountTheme.canvas,
      child: InkWell(
          onTap: onTap,
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            StockPublicMediaView(
                session: session,
                offer: offer,
                compact: true,
                onRefreshOffer: onRefreshOffer),
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
