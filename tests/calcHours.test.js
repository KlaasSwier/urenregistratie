const fs = require('fs');
const path = require('path');
const assert = require('assert');

// extract calcHours from app.js without running the whole file
const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const match = appJs.match(/function calcHours[^]*?\n}\n/);
if (!match) throw new Error('calcHours function not found');
eval(match[0]); // defines calcHours

// normale shift
assert.strictEqual(calcHours('08:00', '16:00', '1', 0, 0), 7);

// nachtelijke shift met checkbox
assert.strictEqual(calcHours('22:00', '06:00', '0', 0, 0, true), 8);

// foutmelding zonder nachtelijke shift
let err;
try {
  calcHours('22:00', '06:00', '0', 0, 0, false);
} catch (e) {
  err = e;
}
assert.ok(err, 'Verwacht een foutmelding bij eindtijd < starttijd zonder nachtelijke shift');

console.log('calcHours tests passed');

