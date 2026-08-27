// 标记详情页：展示与网页端相同的全部内容，但只读不可编辑
// 顶部 < 返回标记主页面
import 'package:flutter/material.dart';
import '../models.dart';
import '../theme.dart';

class MarkerDetailPage extends StatelessWidget {
  final McMarker marker;
  const MarkerDetailPage({super.key, required this.marker});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final Color muted = dark ? McColors.darkMuted : McColors.lightMuted;
    final icon = marker.icon.isNotEmpty ? marker.icon : categoryIcon(marker.category);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: '返回',
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text('标记详情'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 标题 + 图标
            Row(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primary.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Text(icon, style: const TextStyle(fontSize: 26)),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(marker.title,
                          style: const TextStyle(
                              fontSize: 20, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text(categoryName(marker.category),
                          style: TextStyle(fontSize: 13, color: muted)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            _infoRow(context, '世界坐标', 'X: ${marker.x},  Z: ${marker.z}'),
            _infoRow(context, '类别', '${categoryIcon(marker.category)} ${categoryName(marker.category)}'),
            _infoRow(context, '自定义图标', marker.icon.isEmpty ? '（类别默认）' : marker.icon),
            _infoRow(context, '公开状态', marker.isPublic != 0 ? '公开标注（所有人可见）' : '私有标注'),
            _infoRow(context, '创建者', marker.createdBy.isEmpty ? '未知' : marker.createdBy),
            if (marker.description.isNotEmpty) ...[
              const SizedBox(height: 18),
              Text('描述',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: muted)),
              const SizedBox(height: 6),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Theme.of(context).dividerColor),
                ),
                child: Text(marker.description,
                    style: const TextStyle(fontSize: 14, height: 1.6)),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _infoRow(BuildContext context, String label, String value) {
    final muted = Theme.of(context).colorScheme.onSurface.withOpacity(0.55);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 80,
            child: Text(label, style: TextStyle(fontSize: 13, color: muted)),
          ),
          Expanded(
            child: Text(value,
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
          ),
        ],
      ),
    );
  }
}