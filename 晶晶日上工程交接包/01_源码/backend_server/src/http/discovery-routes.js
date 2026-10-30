'use strict';
const express=require('express');
const {shape,error}=require('../modules/party/policy');
const {cities,createSearch}=require('../modules/discovery/search');
function createDiscoveryRouter({db,resolvePrincipal,secret}){
 const router=express.Router(),options={resolvePrincipal};
 const catalogs={
  ARTIST:require('../modules/artists/repository').createArtistRepository(db,options).catalog,
  STOCK:require('../modules/stock/repository').createStockRepository(db,options).catalog,
  AUDITION:require('../modules/auditions/repository').createAuditionsRepository(db,options).catalog,
  NOTICE:require('../modules/notices/repository').createNoticesRepository(db,options).catalog,
 };
 const search=createSearch({catalogs,secret});
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>{
  if(req.get('X-Acting-Party'))throw error('ACTING_PARTY_NOT_ALLOWED',400);
  return fn(req,res);
 }).catch(next);
 const reply=(req,res,data)=>res.json({meta:{request_id:req.requestId,actor:{account_id:req.account.id},acting_party:null},data});
 router.get('/cities',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,{revision:'quick-cities-v1',scope:'QUICK_CHOICES',allows_custom_city:true,items:cities.map(c=>({...c,aliases:[c.name,c.name+'市']}))});}));
 router.get('/search',wrap(async(req,res)=>{
  if(req.query.limit!==undefined&&(typeof req.query.limit!=='string'||! /^(?:[1-9][0-9]?|100)$/.test(req.query.limit)))throw error('INVALID_LIMIT',400);
  reply(req,res,await search(req,{...req.query,...(req.query.limit!==undefined?{limit:Number(req.query.limit)}:{})},req.account.id));
 }));
 return router;
}
module.exports={createDiscoveryRouter};
