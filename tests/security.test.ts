import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { allowedEmail, encryptToken, decryptToken, authConfigured } from '../lib/auth/security';
test('allowlist fails closed and matches full emails without domain shortcuts',()=>{assert.equal(allowedEmail('a@imtes.mx',''),false);assert.equal(allowedEmail('A@imtes.mx',' a@imtes.mx , b@gmail.com '),true);assert.equal(allowedEmail('other@imtes.mx','a@imtes.mx'),false);assert.equal(allowedEmail('a@imtes.mx.evil','a@imtes.mx'),false);});
test('missing environment cannot enable authentication',()=>{assert.equal(authConfigured(),false);});
test('OAuth token encryption round-trip, random nonce and tamper rejection',()=>{
 process.env.TOKEN_ENCRYPTION_KEY=randomBytes(32).toString('base64');
 const token='test-token-fixture';const a=encryptToken(token),b=encryptToken(token);assert.notEqual(a,b);assert.ok(!a.includes(token));assert.equal(decryptToken(a),token);
 const parts=a.split('.');const bytes=Buffer.from(parts[2],'base64');bytes[0]^=1;parts[2]=bytes.toString('base64');assert.throws(()=>decryptToken(parts.join('.')));
 process.env.TOKEN_ENCRYPTION_KEY=randomBytes(32).toString('base64');assert.throws(()=>decryptToken(a));delete process.env.TOKEN_ENCRYPTION_KEY;assert.throws(()=>encryptToken(token));assert.throws(()=>decryptToken(token));
});
