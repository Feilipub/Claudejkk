import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analogSpeed, facing4Sticky, reinCommand, type ReinState } from '../../../src/core/steer.ts';

const DT = 1 / 60;
const LAG = 0.25;
const NORTH = -Math.PI / 2;
const EAST = 0;

function hold(s: ReinState, angle: number, seconds: number, jitter = 0): void {
  // Deterministic "tremble": alternate ±jitter every frame, like a thumb that cannot hold perfectly still.
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) reinCommand(s, angle + (i % 2 ? jitter : -jitter), DT, LAG);
}

test('a new direction starts the rein lag and is answered once it has elapsed', () => {
  // Arrange
  const s: ReinState = { heading: null, timer: 0 };
  // Act
  reinCommand(s, NORTH, DT, LAG);
  // Assert
  assert.equal(s.heading, NORTH);
  assert.ok(s.timer > 0, 'lag is counting');
  hold(s, NORTH, LAG + DT);
  assert.ok(s.timer <= 0, 'lag has elapsed while the command was held');
});

test('a trembling thumb (±1.5° per frame) does not restart the lag, so the horse still turns', () => {
  // Arrange
  const s: ReinState = { heading: null, timer: 0 };
  // Act: hold north for half a second with per-frame jitter well above the old 0.01 rad reset threshold
  hold(s, NORTH, 0.5, 0.026);
  // Assert: the command is north (within the tremble) and the lag ran out long ago
  assert.ok(Math.abs(s.heading! - NORTH) < 0.03);
  assert.ok(s.timer <= 0, `timer should have elapsed, was ${s.timer}`);
});

test('a slow sweep of the thumb is followed continuously instead of ignored', () => {
  // Arrange
  const s: ReinState = { heading: null, timer: 0 };
  hold(s, NORTH, LAG + DT);
  // Act: sweep from north to east over two seconds, 0.75° per frame
  const frames = 120;
  let answered = 0;
  for (let i = 1; i <= frames; i++) {
    reinCommand(s, NORTH + (Math.PI / 2) * (i / frames), DT, LAG);
    if (s.timer <= 0) answered++;
  }
  // Assert: the command tracked the thumb and the horse was free to turn on almost every frame
  assert.ok(Math.abs(s.heading! - EAST) < 1e-9);
  assert.ok(answered >= frames - 1, `answered ${answered} of ${frames}`);
});

test('a 45° step (keyboard-style) is a new command and restarts the lag', () => {
  const s: ReinState = { heading: null, timer: 0 };
  hold(s, NORTH, LAG + DT);
  reinCommand(s, NORTH + Math.PI / 4, DT, LAG);
  assert.ok(s.timer > 0);
});

test('centring the stick keeps the last command and lets the lag run out', () => {
  const s: ReinState = { heading: null, timer: 0 };
  reinCommand(s, EAST, DT, LAG);
  for (let i = 0; i < 30; i++) reinCommand(s, null, DT, LAG);
  assert.equal(s.heading, EAST);
  assert.ok(s.timer <= 0);
});

test('facing4Sticky keeps the current facing across the diagonal within the margin', () => {
  // Facing right; the angle wobbles around the right/down boundary (45°)
  const under = Math.PI / 4 - 0.1;
  const over = Math.PI / 4 + 0.1;
  assert.equal(facing4Sticky(under, 0), 0);
  assert.equal(facing4Sticky(over, 0), 0, 'still right: only 0.1 rad past the boundary');
  assert.equal(facing4Sticky(Math.PI / 4 + 0.3, 0), 1, 'clearly down now');
  // And back the other way, now facing down
  assert.equal(facing4Sticky(under, 1), 1);
  assert.equal(facing4Sticky(Math.PI / 4 - 0.3, 1), 0);
});

test('facing4Sticky handles the wrap at ±π for the left facing', () => {
  assert.equal(facing4Sticky(Math.PI - 0.05, 2), 2);
  assert.equal(facing4Sticky(-Math.PI + 0.05, 2), 2);
  assert.equal(facing4Sticky(-Math.PI / 2 + 0.01, 2), 3);
});

test('analogSpeed: keyboard length is full speed, a thumb eases in from a creep', () => {
  assert.equal(analogSpeed(1), 1);
  assert.equal(analogSpeed(Math.SQRT2), 1);
  assert.equal(analogSpeed(0.25), 0.45);
  assert.equal(analogSpeed(0.7), 0.7);
  assert.equal(analogSpeed(0), 0);
});
