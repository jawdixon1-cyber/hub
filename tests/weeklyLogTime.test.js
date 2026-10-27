import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTime, minutesToHMM, minutesToDecimal } from '../src/lib/weeklyTime.js';

test('parseTime reads h:mm, decimals, and h/m shorthand', () => {
  assert.equal(parseTime('7:30'), 450);
  assert.equal(parseTime('0:05'), 5);
  assert.equal(parseTime('7.5'), 450);
  assert.equal(parseTime('7'), 420);
  assert.equal(parseTime('7h 30m'), 450);
  assert.equal(parseTime('45m'), 45);
  assert.equal(parseTime(''), 0);
  assert.equal(parseTime('7:75'), null);
  assert.equal(parseTime('abc'), null);
});

test('minutes round-trip to h:mm and decimal', () => {
  assert.equal(minutesToHMM(450), '7:30');
  assert.equal(minutesToHMM(5), '0:05');
  assert.equal(minutesToDecimal(450), '7.50');
  assert.equal(minutesToHMM(parseTime('12:15')), '12:15');
});
