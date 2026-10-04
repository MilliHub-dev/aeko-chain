import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { closeProgram, recoverProgramBuffer, validateProgramArtifactBase64 } from './aekoProgramDeploy.js';

test('SBF artifact validation requires the ELF magic header', () => {
  const valid = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 1, 2, 3]).toString('base64');
  assert.equal(validateProgramArtifactBase64(valid), 7);

  const wrongPrefix = Buffer.from([0x00, 0x45, 0x4c, 0x46]).toString('base64');
  assert.throws(() => validateProgramArtifactBase64(wrongPrefix), /ELF\/SBF/);

  const short = Buffer.from([0x7f, 0x45]).toString('base64');
  assert.throws(() => validateProgramArtifactBase64(short), /ELF\/SBF/);
});


test('destructive program lifecycle writes are fail-closed on Mainnet', async () => {
  const wallet = { address: '11111111111111111111111111111111' };
  await assert.rejects(
    closeProgram({ network: 'mainnet', rpcUrl: 'https://rpc.invalid', wallet, programId: wallet.address }),
    /disabled on AEKO Mainnet/,
  );
  await assert.rejects(
    recoverProgramBuffer({ network: 'mainnet', rpcUrl: 'https://rpc.invalid', wallet, bufferAddress: wallet.address }),
    /disabled on AEKO Mainnet/,
  );
});
