// @vitest-environment node
import { expect, it } from 'vitest';
import { applyPriceSupplements } from '../scripts/lib/price-supplements.mjs';
const supplements={byProfile:{'global.example':{kind:'global',price:{input:3,output:15},sourceUrl:'https://docs.aws.amazon.com/example',verifiedAt:'2026-09-21'}}};
it('supplements only confirmed origins, preserves API prices and records provenance',()=>{
  const prices={byModel:{model:{tokyo:{global:{input:2}}}}};
  applyPriceSupplements(prices,{'global.example':{modelId:'model',sources:{tokyo:['*']}}},supplements);
  expect(prices.byModel.model.tokyo.global).toEqual({input:2,output:15});
  expect(prices.byModel.model.tokyo.supplementSources.global.url).toBe('https://docs.aws.amazon.com/example');
  expect(Object.keys(prices.byModel.model)).toEqual(['tokyo']);
});
it('does not invent availability when the profile is absent',()=>{
  expect(applyPriceSupplements({byModel:{}},{},supplements)).toEqual({byModel:{}});
});
