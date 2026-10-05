'use strict';
// Retired: the old importer accepted dump-controlled SQL names and disabled foreign keys.
// Runtime MySQL uses different business models; copying old paid flags would invent payment facts.
console.error('LEGACY_DIRECT_IMPORT_DISABLED: use release-tools.cjs legacy-inspect / legacy-retain with an isolated configuration; reviewed business mapping remains required.');
process.exitCode=1;
