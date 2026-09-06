import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mc_server_map/widgets/bottom_nav.dart';

void main() {
  for (final brightness in Brightness.values) {
    testWidgets('navigation callbacks and selection in $brightness theme', (tester) async {
      final taps = <int>[];
      await tester.pumpWidget(MaterialApp(
        theme: ThemeData(brightness: brightness),
        home: Scaffold(bottomNavigationBar: BottomNavBar(index: 0, onTap: taps.add)),
      ));
      expect(find.byIcon(Icons.dns), findsOneWidget);
      for (final label in ['服务器', 'Wiki', '标记', '我的']) {
        await tester.tap(find.text(label));
      }
      expect(taps, [0, 1, 3, 4]);
      final gestures = find.descendant(of: find.byType(BottomNavBar), matching: find.byType(GestureDetector));
      expect(gestures, findsNWidgets(5));
      await tester.tap(gestures.at(2));
      expect(taps.last, 2);
      expect(tester.takeException(), isNull);
    });
  }
}
