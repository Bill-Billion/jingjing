 'use strict';
const {shape,ref,label,error}=require('../party/policy');
const {canonical}=require('../governance/content');
const stages=Object.freeze(['SCRIPT','SAMPLE','ROUGH_CUT','FINAL']);
const copy=x=>JSON.parse(canonical(x));
function stage(x){if(!stages.includes(x))throw error('INVALID_PRODUCTION_STAGE',400);return x;}
function reset(current,accepted,changed){const c={...current},a={...accepted};for(const key of stages.slice(stages.indexOf(stage(changed)))){delete c[key];delete a[key];}return {current:c,accepted:a};}
function predecessor(current,accepted,kind){const index=stages.indexOf(stage(kind));if(!index)return null;const prev=stages[index-1];if(!current[prev]||accepted[prev]!==current[prev])throw error('PREVIOUS_VERSION_NOT_ACCEPTED',409);return current[prev];}
function checklist(input,kind){const names=kind==='SCRIPT'?['script_reviewed']:['script_reviewed','specification_reviewed','audio_reviewed','branding_reviewed'];shape(input,names);if(names.some(k=>input[k]!==true))throw error('ACCEPTANCE_CHECKS_INCOMPLETE',400);return copy(input);}
module.exports={stages,stage,copy,reset,predecessor,checklist};
