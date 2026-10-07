import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGoals} from '../lib/config/goals';
import {defaultGoals} from '../lib/config/defaults';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {ProfileChart} from '../components/dashboard/reference-charts';
test('goals reject missing, extra, fractional and nonnumeric fields',()=>{assert.deepEqual(validateGoals(defaultGoals),defaultGoals);for(const values of [null,{...defaultGoals,GOBIERNO:10},{...defaultGoals,general:0},{...defaultGoals,general:1.5},{...defaultGoals,general:'100000'},{...defaultGoals,general:1000000001}])assert.throws(()=>validateGoals(values));});
test('dashboard shows Government with no invented goal and uses supplied goals',()=>{const markup=renderToStaticMarkup(createElement(ProfileChart,{rows:[{year:2026,week:40,count:102,amountCents:0,profiles:{PREPAGO:10,GOBIERNO:92}}],goals:{...defaultGoals,PREPAGO:120}}));assert.match(markup,/GOBIERNO/);assert.match(markup,/92/);assert.match(markup,/Sin meta asignada/);assert.match(markup,/Meta 120/);assert.ok(!markup.includes('Meta 46,400'));});
