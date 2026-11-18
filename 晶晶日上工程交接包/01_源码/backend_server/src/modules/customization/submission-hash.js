'use strict';
const {digest}=require('../governance/content');
const instant=value=>value===null?null:new Date(value.replace(' ','T')+'Z').toISOString();
function submissionHash(s){return digest({format:'customization-submission-v1',id:s.id,request_id:s.request_id,template_version_id:s.template_version_id,template_sha256:s.template_sha256,answers_sha256:s.answers_sha256,submitted_by:s.submitted_by,submitted_at:instant(s.submitted_at)});}
module.exports={submissionHash,instant};
