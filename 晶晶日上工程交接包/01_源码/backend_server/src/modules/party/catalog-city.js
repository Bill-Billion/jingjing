"use strict";
// Search-only aliases for the six existing quick choices. Stored legal/contract
// addresses are never rewritten. Unknown names remain exact, not suffix guesses.
const quickCities = ['北京', '上海', '杭州', '广州', '深圳', '郑州'];
const catalogCities = Object.freeze(quickCities.map((name,index)=>Object.freeze({code:['beijing','shanghai','hangzhou','guangzhou','shenzhen','zhengzhou'][index],name})));
function catalogCityValues(value) {
  const city = typeof value === 'string' ? value.trim() : value;
  const known = quickCities.find(name => city === name || city === name + '市');
  return known ? [known, known + '市'] : [city];
}
module.exports = { catalogCityValues, catalogCities };
