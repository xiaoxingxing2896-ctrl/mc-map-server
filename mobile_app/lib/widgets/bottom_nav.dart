// 底部导航栏：服务器 | wiki | [地图·居中凸起] | 标记 | 我的
// 对称分布；选中项主绿胶囊填色（微信/QQ 风格）；固定在底部不被页面覆盖
import 'package:flutter/material.dart';
import '../theme.dart';

class BottomNavBar extends StatelessWidget {
  final int index;
  final ValueChanged<int> onTap;
  const BottomNavBar({super.key, required this.index, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final Color card = dark ? McColors.darkCard : McColors.lightCard;
    final Color border = dark ? McColors.darkBorder : McColors.lightBorder;

    return Container(
      decoration: BoxDecoration(
        color: card,
        border: Border(top: BorderSide(color: border, width: 0.8)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(dark ? 0.5 : 0.08),
            blurRadius: 12,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 58,
          child: Row(
            children: [
              _NavItem(
                icon: Icons.dns_outlined,
                iconSel: Icons.dns,
                label: '服务器',
                selected: index == 0,
                onTap: () => onTap(0),
              ),
              _NavItem(
                icon: Icons.menu_book_outlined,
                iconSel: Icons.menu_book,
                label: 'Wiki',
                selected: index == 1,
                onTap: () => onTap(1),
              ),
              // 地图居中凸起
              Expanded(
                child: GestureDetector(
                  onTap: () => onTap(2),
                  behavior: HitTestBehavior.opaque,
                  child: Transform.translate(
                    offset: const Offset(0, -16),
                    child: Center(
                      child: Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: const LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [Color(0xFF4AA32C), Color(0xFF2D6B22)],
                          ),
                          border: Border.all(color: Colors.white, width: 3),
                          boxShadow: [
                            BoxShadow(
                              color: const Color(0xFF3B8526).withOpacity(0.45),
                              blurRadius: 14,
                              spreadRadius: 1,
                            ),
                          ],
                        ),
                        child: const Icon(Icons.map, color: Colors.white, size: 28),
                      ),
                    ),
                  ),
                ),
              ),
              _NavItem(
                icon: Icons.place_outlined,
                iconSel: Icons.place,
                label: '标记',
                selected: index == 3,
                onTap: () => onTap(3),
              ),
              _NavItem(
                icon: Icons.person_outline,
                iconSel: Icons.person,
                label: '我的',
                selected: index == 4,
                onTap: () => onTap(4),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final IconData iconSel;
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _NavItem({
    required this.icon,
    required this.iconSel,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final Color green = dark ? McColors.darkGreen : McColors.lightGreen;
    final Color muted = dark ? McColors.darkMuted : McColors.lightMuted;

    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOut,
              padding: EdgeInsets.symmetric(
                horizontal: selected ? 14 : 6,
                vertical: 3,
              ),
              decoration: BoxDecoration(
                color: selected ? green : Colors.transparent,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Icon(selected ? iconSel : icon,
                  size: 23, color: selected ? Colors.white : muted),
            ),
            const SizedBox(height: 3),
            Text(
              label,
              style: TextStyle(
                fontSize: 10.5,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                color: selected ? green : muted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}