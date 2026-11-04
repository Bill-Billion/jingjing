import 'dart:convert';
import 'dart:io';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';
import 'demo_models.dart';
import 'demo_store.dart';

class SqliteDemoPersistence implements DemoPersistence {
  SqliteDemoPersistence._(this.database);
  final Database database;

  static Future<SqliteDemoPersistence> open({String? path}) async {
    final directory = await getApplicationSupportDirectory();
    final db = await openDatabase(
      path ?? '${directory.path}/jingjing_offline_v1.sqlite',
      version: 1,
      onCreate: (db, _) => db.execute(
          'CREATE TABLE demo_state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)'),
    );
    return SqliteDemoPersistence._(db);
  }

  @override
  Future<DemoRow?> read() async {
    final rows = await database.query('demo_state', where: 'id = 1');
    return rows.isEmpty
        ? null
        : Map<String, dynamic>.from(
            jsonDecode(rows.single['payload'] as String) as Map);
  }

  @override
  Future<void> write(DemoRow value) => database.transaction((txn) async {
        await txn.insert('demo_state', {'id': 1, 'payload': jsonEncode(value)},
            conflictAlgorithm: ConflictAlgorithm.replace);
      });

  @override
  Future<void> close() => database.close();
}

/// Only generated basenames are stored in SQLite, never temporary picker URIs.
class DemoMedia {
  static Future<Directory> directory() async {
    final support = await getApplicationSupportDirectory();
    return Directory('${support.path}/offline_media').create(recursive: true);
  }

  static Future<String> importFile(String source, {required bool video}) async {
    final file = File(source);
    final size = await file.length();
    if (size == 0 || size > (video ? 80 : 20) * 1024 * 1024) {
      throw DemoFailure(video ? '请选择80MB以内的视频。' : '请选择20MB以内的图片。');
    }
    final extension = source.split('.').last.toLowerCase();
    if (!(video ? ['mp4', 'mov', 'm4v'] : ['jpg', 'jpeg', 'png', 'webp'])
        .contains(extension)) {
      throw const DemoFailure('文件格式不支持，请使用常见图片或MP4视频。');
    }
    final root = await directory();
    final name = '${DateTime.now().microsecondsSinceEpoch}.$extension';
    await file.copy('${root.path}/$name');
    return 'local:$name';
  }

  static Future<File> file(String reference) async {
    if (!RegExp(r'^local:[0-9]+\.(jpg|jpeg|png|webp|mp4|mov|m4v)$')
        .hasMatch(reference)) {
      throw const DemoFailure('本地文件标识无效。');
    }
    return File('${(await directory()).path}/${reference.substring(6)}');
  }

  static Future<Uint8List> bytes(String reference) async {
    if (reference.startsWith('assets/')) {
      return (await rootBundle.load(reference)).buffer.asUint8List();
    }
    return (await file(reference)).readAsBytes();
  }
}
