import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'account_theme.dart';

/// The calibrated 160:190 caption/portrait composition. Media is supplied by
/// the caller after its ordinary permission checks; absence is never a sample.
class EditorialFeature extends StatelessWidget {
  const EditorialFeature({
    super.key,
    required this.title,
    this.eyebrow,
    this.description,
    this.image,
    this.imageLabel = '未提供封面',
    this.dark = false,
  });
  final String title;
  final String? eyebrow, description;
  final Widget? image;
  final String imageLabel;
  final bool dark;

  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (context, box) {
        final width = box.maxWidth;
        final scale = MediaQuery.textScalerOf(context);
        final captionWidth = width * 16 / 35;
        final longTitle = title.runes.length > 8;
        final typeSize = longTitle ? 42.0 : math.min(64.0, captionWidth * .4);
        // Long real titles and enlarged text flow below the portrait rather
        // than clipping the identity or covering a following action.
        final stacked = longTitle || width < 280 || scale.scale(14) > 19;
        final foreground = dark ? AccountTheme.canvas : AccountTheme.text;
        final caption = Padding(
            padding: const EdgeInsets.fromLTRB(0, 20, 12, 20),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (eyebrow != null) ...[
                    Text(eyebrow!,
                        style: TextStyle(
                            color: dark
                                ? AccountTheme.vermilion
                                : AccountTheme.accent,
                            fontSize: 11,
                            height: 1.5)),
                    const SizedBox(height: 12),
                  ],
                  Text(title,
                      style: TextStyle(
                          fontFamily: AccountTheme.serif,
                          fontSize: typeSize,
                          fontWeight: FontWeight.w900,
                          height: 1.06,
                          color: foreground)),
                  if (description != null) ...[
                    const SizedBox(height: 16),
                    Text(description!,
                        style: TextStyle(
                            color:
                                dark ? AccountTheme.canvas : AccountTheme.muted,
                            fontSize: 12,
                            height: 1.6)),
                  ],
                ]));
        final media = SizedBox(
            height: 320,
            width: stacked ? width : width * 19 / 35,
            child: image ??
                DecoratedBox(
                    decoration: const BoxDecoration(
                        color: Color(0xFFE7E4DA),
                        border: Border.fromBorderSide(
                            BorderSide(color: AccountTheme.border))),
                    child: Center(
                        child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Text(imageLabel,
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                    color: AccountTheme.muted,
                                    fontSize: 12,
                                    height: 1.6))))));
        return Padding(
            padding: const EdgeInsets.only(bottom: 20),
            child: ColoredBox(
                color: dark ? AccountTheme.text : AccountTheme.canvas,
                child: stacked
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [caption, media])
                    : Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [Expanded(child: caption), media])));
      });
}
