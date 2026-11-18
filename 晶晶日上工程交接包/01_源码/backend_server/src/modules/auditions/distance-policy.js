'use strict';
const {shape,error}=require('../party/policy');
const NOTICE_VERSION='audition-distance-v1',PURPOSE='PUBLIC_AUDITION_DISTANCE';
function grid(v){
 shape(v,['latitude_grid','longitude_grid']);
 if(!Number.isInteger(v.latitude_grid)||Math.abs(v.latitude_grid)>9000||!Number.isInteger(v.longitude_grid)||v.longitude_grid < -18000||v.longitude_grid>17999)throw error('INVALID_DISTANCE_GRID',400);
 // At a pole longitude has no meaning. One representation avoids aliases.
 return {latitude_grid:v.latitude_grid,longitude_grid:Math.abs(v.latitude_grid)===9000?0:v.longitude_grid};
}
function consent(v){shape(v,['purpose','notice_version','accepted']);if(v.purpose!==PURPOSE||v.notice_version!==NOTICE_VERSION||v.accepted!==true)throw error('DISTANCE_CONSENT_REQUIRED',400);}
function distance(a,b){a=grid(a);b=grid(b);const rad=Math.PI/18000,delta=(a.longitude_grid-b.longitude_grid)*rad;const cosine=Math.sin(a.latitude_grid*rad)*Math.sin(b.latitude_grid*rad)+Math.cos(a.latitude_grid*rad)*Math.cos(b.latitude_grid*rad)*Math.cos(delta);return Math.ceil(Math.round(6371*Math.acos(Math.max(-1,Math.min(1,cosine)))*1e6)/1e6);}
module.exports={NOTICE_VERSION,PURPOSE,grid,consent,distance};
