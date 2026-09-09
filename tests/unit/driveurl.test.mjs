import test from 'node:test';
import assert from 'node:assert/strict';
import { fileIdFromDriveRequestUrl } from '../../extension/lib/driveurl.js';

test('fileIdFromDriveRequestUrl extracts file id from docos sync URL', () => {
  assert.equal(
    fileIdFromDriveRequestUrl('https://drive.google.com/file/u/0/d/abc-123_XY/docos/p/sync?token=1'),
    'abc-123_XY'
  );
});

test('fileIdFromDriveRequestUrl extracts file id from drivesharing clientmodel URL', () => {
  assert.equal(
    fileIdFromDriveRequestUrl('https://drive.google.com/drivesharing/clientmodel?id=abc-123_XY&fields=x'),
    'abc-123_XY'
  );
});

test('fileIdFromDriveRequestUrl ignores non-target Drive and non-Drive URLs', () => {
  assert.equal(fileIdFromDriveRequestUrl('https://drive.google.com/file/d/abc-123_XY/view'), null);
  assert.equal(fileIdFromDriveRequestUrl('https://clients6.google.com/drive/v2internal/files/abc-123_XY'), null);
  assert.equal(fileIdFromDriveRequestUrl('not a url'), null);
});
