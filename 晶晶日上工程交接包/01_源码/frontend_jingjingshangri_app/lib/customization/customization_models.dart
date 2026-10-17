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
      'CUSTOMIZATION_NOT_FOUND' => '需求不存在或当前账号无权查看。',
      _ => error.message,
    };
