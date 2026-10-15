'use strict';
// MySQL binary DATETIME strings omit the fraction when it is zero.
// Database sessions use UTC; public interfaces always include milliseconds.
function sqlUtcInstant(value) { return new Date(value.replace(' ', 'T') + 'Z').toISOString(); }
module.exports = {sqlUtcInstant};
