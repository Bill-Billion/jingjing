// SQLite compatibility only. Production business data still migrates to MySQL separately.
module.exports = {
  version: 6,
  name: 'legacy_content_safety',
  up(db, { addColumnIfMissing }) {
    addColumnIfMissing('sample_library', 'video_url TEXT');
    addColumnIfMissing('scripts', 'digest_kind TEXT');
  },
};
