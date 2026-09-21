// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { meteredPriceOf, normalizePrices } from '../scripts/lib/prices.mjs';
import { applyPriceSupplements } from '../scripts/lib/price-supplements.mjs';
import { comparisonPrices, buildRow } from '../src/scripts/bedrock-view-model.mjs';
import { buildPriceRows } from '../src/scripts/detail-model.mjs';

const product = (attributes) => ({ sku: 'example', attributes });
const rate = (attributes, usd, unit) => meteredPriceOf(product(attributes), { usd, unit });

describe('トークン以外の課金単位', () => {
  it('Nova Reel の Price List unit=video は動画本数ではなく秒単価', () => {
    expect(rate({ model: 'Nova Reel', inferenceType: 'T2V Medium fps HD Resolution' }, '.08', 'video'))
      .toEqual({ axis: 'output', label: 'Video · HD', unit: 'second', value: .08, scope: 'standard' });
    expect(rate({ model: 'unknown' }, '.08', 'video')).toBeNull();
  });
  it('動画入力、画像、検索、テキスト要求をトークン単価に換算しない', () => {
    expect(rate({ usagetype: 'USE1-MP:USE1_inputVideoSecond-Units' }, '.0007', 'seconds'))
      .toMatchObject({ axis: 'input', unit: 'second', value: .0007 });
    expect(rate({}, '.04', 'image')).toMatchObject({ axis: 'output', unit: 'image', value: .04 });
    expect(rate({}, '.002', 'Search Units')).toMatchObject({ axis: 'input', unit: 'searchUnit', value: .002 });
    expect(rate({}, '.00007', 'Text Requests')).toMatchObject({ axis: 'input', unit: 'request', value: .00007 });
  });
  it('画像条件とGlobal動画課金を保持する', () => {
    expect(rate({ modality: 'Document image' }, '.0006', 'Images Processed').label).toBe('Document image');
    const globalRate = rate({ usagetype: 'USE1-MP:USE1_inputVideoSecond_Global-Units' }, '.00049', 'seconds');
    expect(globalRate).toMatchObject({ scope: 'global', axis: 'input' });
    const prices = { byModel: { pegasus: { tokyo: { metered: [globalRate] } } } };
    expect(buildPriceRows('pegasus', { prices, region: 'tokyo', lane: 'global' })).toEqual([
      { kind: 'metered', label: 'Video', unit: 'second', input: .00049 },
    ]);
    expect(buildPriceRows('pegasus', { prices, region: 'tokyo', lane: 'inRegion' })).toEqual([]);
  });
  it('学習・予約・Guardrailsなどをモデルの推論料金に混ぜない', () => {
    for (const usagetype of ['USE1-NovaCanvas-Customization-Training', 'USE1-Guardrail-ContentPolicyImageUnitsConsumed', 'USE1-DataAutomation-Standard-ImagesProcessed', 'USE1-Nova-ProvisionedThroughput']) {
      expect(rate({ usagetype }, '1', 'image')).toBeNull();
    }
  });
  it('モデルIDへの対応から単位付き価格の保存までを通す', () => {
    const p = product({ model: 'Canvas', usagetype: 'USE1-Canvas-T2I-1024-Standard', inferenceType: 'T2I Standard 1024' });
    const file = { products: { example: p }, terms: { OnDemand: { example: { term: { priceDimensions: { price: { unit: 'image', pricePerUnit: { USD: '.04' } } } } } } } };
    const { prices } = normalizePrices({ files: { AmazonBedrock: { 'us-east-1': file } }, models: { canvas: { name: 'Canvas' } } });
    expect(prices.byModel.canvas['us-east-1'].metered[0]).toMatchObject({ value: .04, unit: 'image', axis: 'output' });
    expect(prices.byModel.canvas['us-east-1'].standard).toBeUndefined();
    const rows = comparisonPrices(prices, 'canvas', 'ap-northeast-1');
    expect(rows[0]).toMatchObject({ reference: true, region: 'us-east-1', value: .04 });
    const row = buildRow({ modelId: 'canvas', model: { name: 'Canvas' }, profiles: {}, region: 'us-east-1', prices });
    expect(row.priceInput).toBeNull();
    expect(row.priceOutput).toBeNull();
    expect(buildPriceRows('canvas', { prices, region: 'us-east-1' })[0]).toMatchObject({ output: .04, unit: 'image' });
    expect(buildPriceRows('canvas', { prices, region: 'us-east-1', lane: 'global' })).toEqual([]);
  });
});

it('補完は指定リージョン限定、既存API価格を保持する', () => {
  const prices = { byModel: { model: { 'us-east-1': { metered: [{ axis: 'output', unit: 'image', value: .05 }] } } } };
  applyPriceSupplements(prices, {}, { byModel: { model: { regions: ['us-east-1', 'us-west-2'], metered: [{ axis: 'output', unit: 'image', value: .07 }], sourceUrl: 'https://aws.amazon.com/bedrock/pricing/', verifiedAt: '2026-09-21' } } });
  expect(prices.byModel.model['us-east-1'].metered[0].value).toBe(.05);
  expect(prices.byModel.model['us-west-2'].metered[0].value).toBe(.07);
  expect(prices.byModel.model['ap-northeast-1']).toBeUndefined();
  expect(prices.byModel.model['us-west-2'].supplementSources.metered.url).toContain('aws.amazon.com');
});

it('実データは公式価格との対応が未確認の旧Titan ID以外を収録する', () => {
  const read = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url)));
  const models = read('models'), prices = read('prices');
  const missing = Object.keys(models).filter(id => comparisonPrices(prices, id, 'ap-northeast-1').length === 0);
  expect(missing).toEqual(['amazon.titan-embed-g1-text-02']);
  const rows = buildPriceRows('openai.gpt-6-astra', { prices, region: 'ap-northeast-1', lane: 'global' });
  expect(rows).toEqual([
    { kind: 'global', input: 10, output: 50, maxInputTokens: 272000 },
    { kind: 'global', input: 20, output: 75, minInputTokens: 272000 },
  ]);
});
