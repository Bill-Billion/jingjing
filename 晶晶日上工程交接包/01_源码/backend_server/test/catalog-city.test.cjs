const test=require('node:test'),assert=require('node:assert/strict');
const {catalogCityValues}=require('../src/modules/party/catalog-city');
test('quick-city short and full names select the same values',()=>{
 for(const city of ['北京','上海','杭州','广州','深圳','郑州']){
  assert.deepEqual(catalogCityValues(city),[city,city+'市']);
  assert.deepEqual(catalogCityValues(city+'市'),catalogCityValues(city));
 }
});
test('unknown city and district names remain exact instead of stripping suffixes',()=>{
 for(const value of ['合成市','沙市区','北京市朝阳区','杭州湾','郑'])assert.deepEqual(catalogCityValues(value),[value]);
 assert.deepEqual(catalogCityValues(' 郑州 '),['郑州','郑州市']);
});
