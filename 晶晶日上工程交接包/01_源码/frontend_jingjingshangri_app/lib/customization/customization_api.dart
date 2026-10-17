import '../account/account_api.dart';
import '../account/account_session.dart';
import 'customization_models.dart';

const storyCollection = '/api/v1/customization-requests';

class StoryPageResult {
  const StoryPageResult(this.items, this.cursor);
  final List<StorySummary> items;
  final String? cursor;
}

class StoryPending {
  const StoryPending(this.method, this.path, this.operation);
  final String method, path;
  final Map<String, dynamic> operation;
}

class CustomizationApi {
  CustomizationApi(this.session);
  final AccountSession session;
  String participant() {
    if (!session.isLoggedIn) {
      throw const AccountError(401, 'AUTHENTICATION_REQUIRED');
    }
    if (session.partyId == null ||
        session.selected?['membership']?['current_status'] != 'ACTIVE' ||
        ['SUSPENDED', 'CLOSED'].contains(session.party?['current_status'])) {
      throw const AccountError(403, 'CUSTOMIZATION_FORBIDDEN');
    }
    return session.partyId!;
  }

  void check(int epoch, String? account, String party) {
    if (session.epoch != epoch ||
        session.account?['id'] != account ||
        session.partyId != party) {
      throw const AccountError(0, 'CONTEXT_CHANGED');
    }
    participant();
  }

  StoryRequest parse(
    dynamic input,
    String party,
    String? account, {
    String? id,
  }) {
    final result = StoryRequest(input);
    storyRequire(
      result.partyId == party &&
          result.data['created_by'] == account &&
          (id == null || result.id == id),
    );
    return result;
  }

  Future<List<StoryCategory>> categories() async {
    final epoch = session.epoch, account = session.account?['id'];
    final raw = await session.read('/api/v1/customization-categories');
    if (epoch != session.epoch || account != session.account?['id']) {
      throw const AccountError(0, 'CONTEXT_CHANGED');
    }
    storyRequire(raw['items'] is List);
    final result = (raw['items'] as List).map(StoryCategory.new).toList();
    storyRequire(
      result.map((c) => c.id).toSet().length == result.length &&
          result.map((c) => c.code).toSet().length == result.length,
    );
    return result;
  }

  Future<StoryPageResult> page({String? cursor, String? status}) async {
    final party = participant(),
        epoch = session.epoch,
        account = session.account?['id'];
    final raw = await session.read(
      storyCollection,
      actingParty: party,
      query: {
        'limit': 20,
        if (cursor != null) 'cursor': cursor,
        if (status != null) 'current_status': status,
      },
    );
    check(epoch, account, party);
    storyRequire(
      raw['items'] is List &&
          (raw['items'] as List).length <= 100 &&
          (raw['next_cursor'] == null ||
              raw['next_cursor'] is String &&
                  (raw['next_cursor'] as String).isNotEmpty &&
                  raw['next_cursor'] != cursor),
    );
    final rows = (raw['items'] as List).map(StorySummary.new).toList();
    storyRequire(
      rows.every(
            (r) =>
                r.partyId == party &&
                r.data['category_title'] is String &&
                (status == null || r.status == status),
          ) &&
          rows.map((r) => r.id).toSet().length == rows.length,
    );
    return StoryPageResult(rows, raw['next_cursor']);
  }

  Future<StoryRequest> record(String id) async {
    if (!storyId(id)) throw const AccountError(400, 'INVALID_ID');
    final party = participant(),
        epoch = session.epoch,
        account = session.account?['id'];
    final raw = await session.read('$storyCollection/$id', actingParty: party);
    check(epoch, account, party);
    return parse(raw, party, account, id: id);
  }

  StoryPending? pending({String? id}) {
    final party = participant();
    final commands = id == null
        ? [('POST', storyCollection)]
        : [
            ('PATCH', '$storyCollection/$id'),
            ('POST', '$storyCollection/$id/submissions'),
          ];
    for (final command in commands) {
      final operation = session.pending(
        command.$1,
        command.$2,
        actingParty: party,
      );
      if (operation != null) {
        return StoryPending(command.$1, command.$2, operation);
      }
    }
    return null;
  }

  Future<StoryRequest> _write(
    String method,
    String path,
    Map<String, dynamic> body, {
    int? version,
    String? id,
  }) async {
    final party = participant(),
        epoch = session.epoch,
        account = session.account?['id'];
    final raw = await session.write(
      method,
      path,
      actingParty: party,
      body: body,
      version: version,
      validate: (r) => parse(r, party, account, id: id),
    );
    check(epoch, account, party);
    return parse(raw, party, account, id: id);
  }

  Future<StoryRequest> create(
    StoryCategory category,
    Map<String, String> answers,
  ) =>
      _write('POST', storyCollection, {
        'template_version_id': category.id,
        'answers': answers,
      });
  Future<StoryRequest> save(StoryRequest record, Map<String, String> answers) =>
      _write(
        'PATCH',
        '$storyCollection/${record.id}',
        {'answers': answers},
        version: record.version,
        id: record.id,
      );
  Future<StoryRequest> submit(StoryRequest record) => _write(
        'POST',
        '$storyCollection/${record.id}/submissions',
        {},
        version: record.version,
        id: record.id,
      );
  Future<StoryRequest> retry(StoryPending pending) => _write(
        pending.method,
        pending.path,
        storyMap(pending.operation['body']),
        version: pending.operation['version'],
        id: pending.path == storyCollection ? null : pending.path.split('/')[4],
      );
}
