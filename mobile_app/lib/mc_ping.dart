// Minecraft Server List Ping —— 与 QQ 群机器人「苦力怕娘」获取服务器状态同途径
// 协议：TCP 握手(next state=1) + status 请求 → JSON(在线人数/玩家/描述) + RTT 延迟
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:http/http.dart' as http;

class McPingResult {
  final int online;
  final int max;
  final List<String> players;
  final int latencyMs;
  final String motd;
  const McPingResult({
    required this.online,
    required this.max,
    required this.players,
    required this.latencyMs,
    required this.motd,
  });
}

/// 连接超时 5s，读取超时 6s；失败抛异常
Future<McPingResult> pingServer(String host, int port) async {
  final sw = Stopwatch()..start();
  final socket = await Socket.connect(host, port, timeout: const Duration(seconds: 8));
  try {
    // 1) Handshake: 0x00, protocol=47(1.8+), host, port, nextState=1
    final hs = BytesBuilder();
    writeVarInt(hs, 0x00);
    writeVarInt(hs, 47);
    writeString(hs, host);
    hs.add([(port >> 8) & 0xFF, port & 0xFF]);
    writeVarInt(hs, 1);
    socket.add(wrapPacket(hs.takeBytes()));

    // 2) Status request: 0x00
    final req = BytesBuilder();
    writeVarInt(req, 0x00);
    socket.add(wrapPacket(req.takeBytes()));

    // 3) 读取响应
    final data = await readFullPacket(socket);
    final jsonStr = decodeVarString(data);
    final json = jsonDecode(jsonStr) as Map<String, dynamic>;
    sw.stop();

    final players = json['players'] as Map<String, dynamic>? ?? const {};
    final sample = players['sample'] as List? ?? const [];
    return McPingResult(
      online: (players['online'] as num?)?.toInt() ?? 0,
      max: (players['max'] as num?)?.toInt() ?? 0,
      players: sample
          .whereType<Map>()
          .map((e) => (e['name'] ?? '').toString())
          .where((s) => s.isNotEmpty)
          .toList(),
      latencyMs: sw.elapsedMilliseconds,
      motd: extractMotd(json['description']),
    );
  } finally {
    socket.destroy();
  }
}

// ---------- 协议工具 ----------

void writeVarInt(BytesBuilder b, int value) {
  var v = value & 0xFFFFFFFF;
  while (true) {
    if ((v & ~0x7F) == 0) {
      b.addByte(v);
      return;
    }
    b.addByte((v & 0x7F) | 0x80);
    v = (v >> 7) & 0x01FFFFFF;
  }
}

void writeString(BytesBuilder b, String s) {
  final bytes = utf8.encode(s);
  writeVarInt(b, bytes.length);
  b.add(bytes);
}

/// 包 = varint(长度) + 内容
Uint8List wrapPacket(Uint8List payload) {
  final b = BytesBuilder();
  writeVarInt(b, payload.length);
  b.add(payload);
  return b.takeBytes();
}

/// 读取一个完整包（跳过包 id 字节），返回包内容
Future<Uint8List> readFullPacket(Socket socket) {
  final completer = Completer<Uint8List>();
  final buffer = BytesBuilder();
  var needLen = -1;
  var varintAcc = 0;
  var varintShift = 0;
  var varintDone = false;
  var failed = false;

  void fail(Object e) {
    if (failed || completer.isCompleted) return;
    failed = true;
    completer.completeError(e);
  }

  final sub = socket.listen((chunk) {
    if (failed || completer.isCompleted) return;
    for (final byte in chunk) {
      if (!varintDone) {
        varintAcc |= (byte & 0x7F) << varintShift;
        varintShift += 7;
        if (varintShift > 35) {
          fail(const FormatException('varint 过长'));
          return;
        }
        if ((byte & 0x80) == 0) {
          needLen = varintAcc;
          varintDone = true;
          varintAcc = 0;
          varintShift = 0;
          if (needLen < 1 || needLen > 4 * 1024 * 1024) {
            fail(const FormatException('包长度非法'));
            return;
          }
        }
      } else {
        buffer.addByte(byte);
        if (buffer.length >= needLen) {
          completer.complete(buffer.takeBytes());
          return;
        }
      }
    }
  }, onError: fail, onDone: () {
    if (!completer.isCompleted) {
      fail(const SocketException('连接已关闭'));
    }
  });

  completer.future.whenComplete(() {
    try {
      sub.cancel();
    } catch (_) {}
  });
  return completer.future.timeout(const Duration(seconds: 10));
}

/// 读取 varint 长度前缀 + UTF-8 字符串
String decodeVarString(Uint8List data) {
  var i = 0;
  var len = 0;
  var shift = 0;
  while (true) {
    if (i >= data.length) throw const FormatException('数据不足');
    final b = data[i++];
    len |= (b & 0x7F) << shift;
    if ((b & 0x80) == 0) break;
    shift += 7;
    if (shift > 35) throw const FormatException('varint 过长');
  }
  if (i + len > data.length) throw const FormatException('字符串长度越界');
  return utf8.decode(data.sublist(i, i + len));
}

String extractMotd(dynamic desc) {
  if (desc is String) return desc;
  if (desc is Map) {
    final t = desc['text'];
    if (t != null && t.toString().isNotEmpty) return t.toString();
    final extra = desc['extra'];
    if (extra is List) {
      final sb = StringBuffer();
      for (final e in extra) {
        if (e is Map && e['text'] != null) sb.write(e['text']);
      }
      if (sb.isNotEmpty) return sb.toString();
    }
  }
  return '';
}
/// 查询 Minecraft SRV 记录：_minecraft._tcp.<host>（Cloudflare DoH）
/// 返回真实 (host, port)；无记录返回 null
Future<(String, int)?> lookupMcSrv(String host) async {
  // 大陆可达 DNS 优先：阿里 dns.alidns.com > 腾讯 doh.pub > Cloudflare DoH 兜底
  final apis = [
    'https://dns.alidns.com/resolve',
    'https://doh.pub/dns-query',
    'https://cloudflare-dns.com/dns-query',
  ];
  for (final api in apis) {
    try {
      final uri = Uri.parse(api).replace(
          queryParameters: {'name': '_minecraft._tcp.$host', 'type': 'SRV'});
      final r = await http
          .get(uri, headers: {'accept': 'application/dns-json'})
          .timeout(const Duration(seconds: 5));
      if (r.statusCode != 200) continue;
      final j = jsonDecode(utf8.decode(r.bodyBytes)) as Map<String, dynamic>;
      // alidns 用 Answer 数组，部分实现返回单对象
      final ans = j['Answer'];
      final list = ans is List
          ? ans
          : (ans is Map ? [ans] : const []);
      for (final a in list) {
        final data = (a as Map)['data']?.toString() ?? '';
        final parts = data.trim().split(RegExp(r'\s+'));
        if (parts.length >= 4) {
          final port = int.tryParse(parts[2]);
          final target = parts[3];
          if (port != null && target.isNotEmpty && target != '.') {
            return (target.endsWith('.')
                ? target.substring(0, target.length - 1)
                : target, port);
          }
        }
      }
    } catch (_) {}
  }
  return null;
}

/// 备用：通过 mcsrvstat.us 公共 API 查询（海外节点，国内服务器可能查询不到，仅兜底）
Future<McPingResult?> queryViaMcsrvstat(String host, int port) async {
  try {
    final r = await http
        .get(Uri.parse('https://api.mcsrvstat.us/3/' + host + (port > 0 && port != 25565 ? ':' + port.toString() : '')))
        .timeout(const Duration(seconds: 6));
    if (r.statusCode != 200) return null;
    final j = jsonDecode(utf8.decode(r.bodyBytes)) as Map<String, dynamic>;
    if (j['online'] != true) return null;
    final players = j['players'] as Map<String, dynamic>? ?? const {};
    final list = players['list'] as List? ?? const [];
    return McPingResult(
      online: (players['online'] as num?)?.toInt() ?? 0,
      max: (players['max'] as num?)?.toInt() ?? 0,
      players: list.map((e) => e.toString()).toList(),
      latencyMs: (j['latency'] as num?)?.toInt() ?? 0,
      motd: '',
    );
  } catch (_) {
    return null;
  }
}