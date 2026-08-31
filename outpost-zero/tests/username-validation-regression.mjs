import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const social=read('js/social.js'),networking=read('js/networking.js');
const css=read('styles.css'),index=read('../index.html');

const validationSource=social.slice(social.indexOf('function socialHandleKey('),social.indexOf('function usernameIsChosenForUser('));
assert.ok(validationSource.includes('function socialUsernameValidationMessage('),'missing specific username validation helper');
const context=vm.createContext({authUser:null});
vm.runInContext(`${validationSource};this.validate=socialUsernameValidationMessage;`,context,{filename:'username-validation.js'});
const validate=context.validate,id='12345678-1234-4123-8123-123456789abc';

assert.equal(validate('',id),'Enter a username.');
assert.match(validate('ab',id),/too short.*at least 3/i);
assert.match(validate('a'.repeat(33),id),/too long.*no more than 32/i);
assert.match(validate('two words',id),/spaces are not allowed/i);
assert.match(validate('bad-name',id),/"-" is not allowed/i);
assert.match(validate('username_not_set',id),/reserved/i);
assert.match(validate('op_'+id.replaceAll('-','').slice(0,20),id),/temporary account label/i);
assert.equal(validate('Ab_1',id),'','letters, numbers, and underscores must remain valid');
assert.equal(validate('@abc',id),'','the existing optional leading @ behavior must remain valid');
assert.equal(validate('abc',id),'','the three-character lower boundary must remain valid');
assert.equal(validate('a'.repeat(32),id),'','the 32-character upper boundary must remain valid');

const settingsInput=index.indexOf('id="settingsusername"');
const settingsStatus=index.indexOf('id="settingsusernamestatus"');
const settingsSave=index.indexOf('id="settingsusernamesave"');
assert.ok(settingsInput>=0&&settingsInput<settingsStatus&&settingsStatus<settingsSave,
  'username feedback must appear directly below the field and before Save');
assert.match(index,/id="settingsusername"[\s\S]{0,240}aria-describedby="settingsusernamestatus"[\s\S]{0,80}aria-invalid="false"/,
  'the username field must expose its feedback to assistive technology');
assert.match(css,/\.settings-status\.error\{color:#ff6b5f;font-weight:700\}/,
  'invalid usernames must use clearly red text');
assert.match(css,/#settingsusername\[aria-invalid="true"\]\{border-color:#ff6b5f\}/,
  'the invalid username field must also receive a red border');
assert.match(networking,/kind==='username'&&el\.username\)el\.username\.setAttribute\('aria-invalid',error\?'true':'false'\)/,
  'setting or clearing an error must keep aria-invalid synchronized');
assert.match(networking,/settingsusername'\)\.addEventListener\('input',[\s\S]{0,500}socialUsernameValidationMessage/,
  'editing a rejected username must refresh the exact error instead of leaving stale text');
assert.match(social,/code==='22023'\|\|message\.includes\('USERNAME_INVALID'\)[\s\S]{0,180}socialUsernameValidationMessage/,
  'server-side invalid-name responses must map back to useful client text');

assert.match(index,/outpost-zero\/styles\.css\?v=20260831-hub-tools-settings-v1/);
assert.match(index,/outpost-zero\/js\/networking\.js\?v=20260831-bots-volt-layout-v1/,
  'networking.js needs the current Settings cache tag');
assert.match(index,/outpost-zero\/js\/social\.js\?v=20260831-username-validation-v1/,
  'social.js needs the username-validation cache tag');

console.log('PASS specific red username validation beneath the field');
