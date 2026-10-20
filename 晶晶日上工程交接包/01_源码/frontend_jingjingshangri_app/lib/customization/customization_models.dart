import 'dart:convert';

import '../account/account_api.dart';

const storyStatuses = {
  'DRAFT': '业务草稿',
  'SUBMITTED': '平台待查看',
  'INTAKE': '平台受理中',
};
final _uuid = RegExp(
  r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
);
bool storyId(dynamic value) => value is String && _uuid.hasMatch(value);
bool storyDate(dynamic value) =>
    value is String && DateTime.tryParse(value) != null;
bool storyHash(dynamic value) =>
    value is String && RegExp(r'^[a-f0-9]{64}$').hasMatch(value);
void storyRequire(bool value) {
  if (!value) {
    throw const AccountError(
      503,
      'INVALID_CUSTOMIZATION_RESPONSE',
      uncertain: true,
    );
  }
}

Map<String, dynamic> storyMap(dynamic value) {
  storyRequire(value is Map && value.keys.every((k) => k is String));
  return Map<String, dynamic>.from(value as Map);
}

class StoryField {
  StoryField(dynamic input) : data = storyMap(input) {
    storyRequire(
      data['key'] is String &&
          RegExp(r'^[a-z][a-z0-9_]{0,63}$').hasMatch(data['key']) &&
          !['constructor', 'prototype', '__proto__'].contains(data['key']) &&
          data['label'] is String &&
          (data['label'] as String).isNotEmpty &&
          data['required'] is bool &&
          ['TEXT', 'CHOICE', 'PRIVATE_ATTACHMENT'].contains(data['type']),
    );
    if (type == 'CHOICE') {
      storyRequire(
        data['options'] is List &&
            (data['options'] as List).isNotEmpty &&
            (data['options'] as List).length <= 50 &&
            (data['options'] as List).every((v) => v is String && v.isNotEmpty),
      );
    }
    if (data['max_length'] != null) {
      storyRequire(
        type == 'TEXT' &&
            data['max_length'] is int &&
            data['max_length'] >= 1 &&
            data['max_length'] <= 12000,
      );
    }
  }
  final Map<String, dynamic> data;
  String get key => data['key'];
  String get label => data['label'];
  String get type => data['type'];
  bool get required => data['required'];
  int get maxLength => data['max_length'] ?? 12000;
  List<String> get options => List<String>.from(data['options'] ?? []);
}

class StoryTemplate {
  StoryTemplate(dynamic input) : data = storyMap(input) {
    storyRequire(
      data['title'] is String &&
          (data['title'] as String).isNotEmpty &&
          data['description'] is String &&
          data['fields'] is List &&
          (data['fields'] as List).isNotEmpty &&
          (data['fields'] as List).length <= 40,
    );
    fields = (data['fields'] as List).map(StoryField.new).toList();
    storyRequire(fields.map((f) => f.key).toSet().length == fields.length);
  }
  final Map<String, dynamic> data;
  late final List<StoryField> fields;
  String get title => data['title'];
  String get description => data['description'];
  bool get submissionAvailable =>
      !fields.any((f) => f.type == 'PRIVATE_ATTACHMENT' && f.required);

  Map<String, String> answers(dynamic value) {
    final result = storyMap(value);
    storyRequire(
      result.length <= 40 &&
          result.entries.every(
            (e) =>
                fields.any((f) => f.key == e.key) &&
                e.value is String &&
                (e.value as String).runes.length <= 12000,
          ),
    );
    for (final field in fields) {
      final answer = result[field.key];
      if (answer == null) continue;
      storyRequire(field.type != 'PRIVATE_ATTACHMENT' || answer == '');
      storyRequire(
        field.type != 'CHOICE' ||
            answer == '' ||
            field.options.contains(answer),
      );
      storyRequire((answer as String).runes.length <= field.maxLength);
    }
    return Map<String, String>.from(result);
  }
}

class StoryCategory {
  StoryCategory(dynamic input) : data = storyMap(input) {
    storyRequire(
      storyId(data['template_version_id']) &&
          data['category_code'] is String &&
          data['template_version'] is int &&
          data['template_version'] > 0 &&
          data['submission_available'] is bool,
    );
    template = StoryTemplate(data['template_snapshot']);
    storyRequire(
      data['submission_available'] == template.submissionAvailable &&
          data['unavailable_reason'] ==
              (template.submissionAvailable
                  ? null
                  : 'ATTACHMENT_SUBMISSION_NOT_READY'),
    );
  }
  final Map<String, dynamic> data;
  late final StoryTemplate template;
  String get id => data['template_version_id'];
  String get code => data['category_code'];
  int get version => data['template_version'];
}

class StorySummary {
  StorySummary(dynamic input) : data = storyMap(input) {
    storyRequire(
      storyId(data['id']) &&
          storyId(data['party_id']) &&
          storyId(data['template_version_id']) &&
          storyStatuses.containsKey(data['current_status']) &&
          data['object_version'] is int &&
          data['object_version'] >= 1 &&
          data['allowed_actions'] is List &&
          (data['allowed_actions'] as List).every(
            (a) => ['READ', 'SAVE', 'SUBMIT', 'INTAKE'].contains(a),
          ),
    );
  }
  final Map<String, dynamic> data;
  String get id => data['id'];
  String get partyId => data['party_id'];
  int get version => data['object_version'];
  String get status => data['current_status'];
  String get title => data['category_title'] ?? templateTitle;
  String get templateTitle => data['template_snapshot']?['title'] ?? '我的故事';
  bool allows(String action) =>
      (data['allowed_actions'] as List).contains(action);
}

class StoryRequest extends StorySummary {
  StoryRequest(super.input) {
    storyRequire(storyId(data['created_by']));
    template = StoryTemplate(data['template_snapshot']);
    answers = template.answers(data['answers']);
    if (status == 'DRAFT') {
      storyRequire(
        data['submission'] == null &&
            data['submitted_at'] == null &&
            data['intake_at'] == null &&
            data['intake_by'] == null,
      );
    } else {
      final submission = storyMap(data['submission']);
      storyRequire(
        storyId(submission['id']) &&
            storyId(submission['submitted_by']) &&
            submission['content_sha256'] is String &&
            RegExp(r'^[a-f0-9]{64}$').hasMatch(submission['content_sha256']) &&
            _date(submission['submitted_at']) &&
            _date(data['submitted_at']),
      );
      final submittedTemplate = StoryTemplate(submission['template_snapshot']);
      submittedTemplate.answers(submission['answers']);
      if (status == 'INTAKE') {
        storyRequire(storyId(data['intake_by']) && _date(data['intake_at']));
      } else {
        storyRequire(data['intake_by'] == null && data['intake_at'] == null);
      }
    }
  }
  late final StoryTemplate template;
  late final Map<String, String> answers;
  String get templateId => data['template_version_id'];
  bool _date(dynamic value) =>
      value is String && DateTime.tryParse(value) != null;
}

class StorySupplementItem {
  StorySupplementItem(dynamic input, StoryTemplate template)
      : data = storyMap(input) {
    storyRequire(template.fields.any((f) => f.key == data['field_key']) &&
        data['reason'] is String &&
        (data['reason'] as String).trim().isNotEmpty &&
        (data['reason'] as String).runes.length <= 500 &&
        data['instruction'] is String &&
        (data['instruction'] as String).trim().isNotEmpty &&
        (data['instruction'] as String).runes.length <= 1000);
  }
  final Map<String, dynamic> data;
  String get key => data['field_key'];
}

List<StorySupplementItem> storySupplementItems(
    dynamic raw, StoryTemplate template) {
  storyRequire(raw is List && raw.isNotEmpty && raw.length <= 40);
  final items =
      (raw as List).map((i) => StorySupplementItem(i, template)).toList();
  storyRequire(items.map((i) => i.key).toSet().length == items.length);
  return items;
}

Map<String, String> storyResponses(dynamic raw, List<StorySupplementItem> items,
    {bool complete = false}) {
  final values = storyMap(raw);
  storyRequire(values.length <= 40 &&
      values.entries.every((e) =>
          items.any((i) => i.key == e.key) &&
          e.value is String &&
          (e.value as String).runes.length <= 2000) &&
      utf8.encode(jsonEncode(values)).length <= 16 * 1024 &&
      (!complete ||
          items.every((i) =>
              values[i.key] is String &&
              (values[i.key] as String).trim().isNotEmpty)));
  return Map<String, String>.from(values);
}

class StorySupplementContext {
  StorySupplementContext(dynamic raw, StoryRequest record)
      : data = storyMap(raw) {
    storyRequire(data['request_id'] == record.id &&
        data['object_version'] is int &&
        data['object_version'] >= 1 &&
        data['allowed_actions'] is List &&
        (data['allowed_actions'] as List).every((a) => const [
              'READ',
              'SAVE_SUPPLEMENT',
              'SUBMIT_SUPPLEMENT',
              'REQUEST_SUPPLEMENT'
            ].contains(a)));
    if (data['supplement'] == null) {
      storyRequire(data['draft'] == null &&
          !allows('SAVE_SUPPLEMENT') &&
          !allows('SUBMIT_SUPPLEMENT'));
      return;
    }
    final s = storyMap(data['supplement']);
    storyRequire(storyId(s['id']) &&
        storyId(s['base_submission_id']) &&
        storyId(s['requested_by']) &&
        storyDate(s['requested_at']) &&
        ['OPEN', 'RESPONDED'].contains(s['current_status']));
    final formalId = open
        ? s['base_submission_id']
        : storyMap(s['response'])['submission_id'];
    storyRequire(storyId(formalId));
    // The two reads may straddle another session's formal resubmission.
    // Draft saves advance object_version without changing this formal ID.
    if (formalId != record.data['submission']?['id']) {
      throw const AccountError(409, 'CUSTOMIZATION_FORMAL_VERSION_CHANGED');
    }
    items = storySupplementItems(s['items'], record.template);
    if (open) {
      storyRequire(s['response'] == null);
      if (data['draft'] != null) {
        final draft = storyMap(data['draft']);
        answers = record.template.answers(draft['answers']);
        responses = storyResponses(draft['responses'], items);
      }
    } else {
      storyRequire(data['draft'] == null &&
          !allows('SAVE_SUPPLEMENT') &&
          !allows('SUBMIT_SUPPLEMENT'));
      final response = storyMap(s['response']);
      storyRequire(storyId(response['submission_id']) &&
          storyDate(response['submitted_at']));
      responses = storyResponses(response['responses'], items, complete: true);
    }
  }
  final Map<String, dynamic> data;
  List<StorySupplementItem> items = [];
  Map<String, String>? answers;
  Map<String, String> responses = {};
  int get version => data['object_version'];
  String? get id => data['supplement']?['id'];
  bool get open => data['supplement']?['current_status'] == 'OPEN';
  bool allows(String action) =>
      (data['allowed_actions'] as List).contains(action);
}

class StorySubmissionSummary {
  StorySubmissionSummary(dynamic raw) : data = storyMap(raw) {
    storyRequire(storyId(data['id']) &&
        data['submission_number'] is int &&
        data['submission_number'] >= 1 &&
        storyId(data['submitted_by']) &&
        storyDate(data['submitted_at']) &&
        storyHash(data['content_sha256']));
  }
  final Map<String, dynamic> data;
  String get id => data['id'];
  int get number => data['submission_number'];
}

class StorySubmissionVersion {
  StorySubmissionVersion(dynamic raw, String requestId, String submissionId)
      : data = storyMap(raw) {
    storyRequire(data['request_id'] == requestId &&
        data['submission_number'] is int &&
        data['submission_number'] >= 1);
    final s = storyMap(data['submission']);
    storyRequire(s['id'] == submissionId &&
        storyId(s['submitted_by']) &&
        storyDate(s['submitted_at']) &&
        storyHash(s['content_sha256']));
    template = StoryTemplate(s['template_snapshot']);
    answers = template.answers(s['answers']);
    if (data['supplement_response'] != null) {
      final response = storyMap(data['supplement_response']);
      storyRequire(storyId(response['supplement_id']) &&
          storyId(response['base_submission_id']) &&
          storyId(response['requested_by']) &&
          storyDate(response['requested_at']));
      items = storySupplementItems(response['items'], template);
      responses = storyResponses(response['responses'], items, complete: true);
    }
  }
  final Map<String, dynamic> data;
  late final StoryTemplate template;
  late final Map<String, String> answers;
  List<StorySupplementItem> items = [];
  Map<String, String> responses = {};
}

class StoryQuoteSummary {
  StoryQuoteSummary(dynamic raw) : data = storyMap(raw) {
    storyRequire(storyId(data['id']) &&
        storyId(data['submission_id']) &&
        storyHash(data['source_content_sha256']) &&
        storyHash(data['content_sha256']) &&
        data['source_is_current'] is bool &&
        ['IN_REVIEW', 'APPROVED', 'REJECTED', 'ACCEPTED']
            .contains(data['current_status']) &&
        data['object_version'] is int &&
        data['object_version'] >= 1 &&
        (data['order_id'] == null || storyId(data['order_id'])));
  }
  final Map<String, dynamic> data;
  String get id => data['id'];
}

String storyReason(String? reason) => switch (reason) {
      'REQUIRED' => '这一项尚未填写。',
      'INVALID_CHOICE' => '请选择此版本表单提供的选项。',
      'TOO_LONG' => '内容超过该项字数上限，请精简后保存。',
      'TOO_LARGE' => '整份故事内容过长，请精简后再保存。',
      'UNKNOWN_FIELD' => '表单包含当前模板没有的问题，请核对当前版本。',
      'ATTACHMENT_NOT_SUPPORTED' ||
      'ATTACHMENT_SUBMISSION_NOT_READY' =>
        '此项需要私有附件；附件提交尚未开放，可以先保存文字草稿。',
      'INVALID_TYPE' => '内容格式不正确，请检查填写方式。',
      _ => '这一项未通过检查，请核对后重试。',
    };

String storyError(AccountError error) => switch (error.code) {
      'BODY_TOO_LARGE' => '整份故事内容过长，请精简后再保存。',
      'CUSTOMIZATION_VALIDATION_FAILED' => '请检查标出的内容，修改后再试。',
      'INVALID_CUSTOMIZATION_RESPONSE' => '返回内容未通过核对，请重试原操作确认结果。',
      'CUSTOMIZATION_NOT_DRAFT' => '这份故事已正式提交，请读取当前版本查看进度。',
      'SUPPLEMENT_NOT_OPEN' => '本次补充已结束，请读取当前办理进度。',
      'SUPPLEMENT_ALREADY_OPEN' => '已有待回复的补充要求，请先办理当前补充。',
      'SUPPLEMENT_BASE_CHANGED' => '补充要求对应的故事版本已有更新，请读取当前内容核对。',
      'CUSTOMIZATION_FORMAL_VERSION_CHANGED' =>
        '读取期间故事的正式版本已有变化。本页输入仍保留，请重新读取当前版本核对。',
      'SUPPLEMENT_TOO_LARGE' => '全部补充回复合计过长，请精简后再保存。',
      'INVALID_SUPPLEMENT_RESPONSE' => '每项回复最多2000字，请检查回复内容后重试。',
      'CUSTOMIZATION_ORDER_EXISTS' => '这份需求已有订单，请查看原订单。',
      'CUSTOMIZATION_SOURCE_CHANGED' => '故事正式版本已有更新，请核对当前故事与报价。',
      'CUSTOMIZATION_NOT_FOUND' => '需求不存在或当前账号无权查看。',
      _ => error.message,
    };
