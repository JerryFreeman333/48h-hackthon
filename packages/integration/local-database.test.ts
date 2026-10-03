import test from 'node:test';
import assert from 'node:assert/strict';
import {industries} from '../../modules/a-profile/src/taxonomy.mjs';
import {matchesDatabaseIndustry} from './local-database';

test('the selectable finance industry admits bank domains without giving a named bank special treatment',()=>{
 assert.ok(industries.some(i=>i.id==='finance'));
 for(const domain of ['金融','城商行','股份制银行','农商行','保险','证券'])assert.equal(matchesDatabaseIndustry(['finance'],domain),true,domain);
 assert.equal(matchesDatabaseIndustry(['finance'],'软件与互联网'),false);
 assert.equal(matchesDatabaseIndustry(['software_it'],'城商行'),false);
 assert.equal(matchesDatabaseIndustry(['software_it'],'金融科技'),true);
 assert.equal(matchesDatabaseIndustry(['finance'],null),true);
 assert.equal(matchesDatabaseIndustry([],'城商行'),true);
});
