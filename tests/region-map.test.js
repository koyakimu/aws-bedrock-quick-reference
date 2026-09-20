import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decorateRegionMaps } from '../src/scripts/region-map.js';

function mount({model='anthropic.claude-haiku-4-5-20251001-v1:0',lane='geo',off=false}={}) {
  document.documentElement.lang='ja';
  document.body.innerHTML=`<select id="source-region"><option value="ap-northeast-1" selected>Tokyo</option></select><table><tbody><tr data-model-id="${model}"><td><div class="lane-panel" data-lane="${lane}"><div class="lane-block" data-profile-id="jp.${model}"><figure class="flow" data-lane="${lane}"><div class="flow-scroll"><svg>${off?'<g class="s-off"></g>':''}</svg></div></figure></div></div></td></tr></tbody></table>`;
  decorateRegionMaps();
}
beforeEach(()=>{
  // jsdom has no SVG layout; browser checks verify real map bounds and clipping.
  vi.spyOn(SVGElement.prototype,'getBBox').mockImplementation(()=>({x:200,y:160,width:420,height:220}));
});
// Define the absent layout API before installing per-test spies.
SVGElement.prototype.getBBox ??= ()=>({x:0,y:0,width:0,height:0});

describe('production map presentation',()=>{
  it('shows the origin self-loop alongside other Geo candidates and keeps selection interactive',()=>{
    mount();
    expect(document.querySelectorAll('.map-local-route')).toHaveLength(1);
    expect(document.querySelectorAll('.map-routes .map-route')).toHaveLength(1);
    document.querySelector('[data-region="ap-northeast-1"]').click();
    expect(document.querySelector('.map-local-route').classList.contains('is-selected')).toBe(true);
    expect(document.querySelector('.flow-scroll')).toBeNull();
    expect(document.querySelector('.map-retention-exception')).toBeNull();
    decorateRegionMaps();
    expect(document.querySelectorAll('.region-map')).toHaveLength(1);
  });
  it('does not draw a map for unavailable inference',()=>{
    mount({off:true});
    expect(document.querySelector('.map-unavailable')).not.toBeNull();
    expect(document.querySelector('figure svg')).toBeNull();
  });
  it('shows sourced retention only for a matching model',()=>{
    mount({model:'anthropic.claude-fable-5',lane:'global'});
    expect(document.querySelector('.map-retention-exception').textContent).toContain('最大30日間');
    expect(document.querySelectorAll('.map-global-route')).toHaveLength(11);
    expect(document.querySelector('.map-local-route')).toBeNull();
  });
  it('keeps origin-centered zoom reversible',()=>{
    mount();
    const svg=document.querySelector('.inference-map');
    const before=svg.getAttribute('viewBox');
    document.querySelector('[aria-label="地図を拡大"]').click();
    expect(svg.getAttribute('viewBox')).not.toBe(before);
    document.querySelector('[aria-label="推論先全体を表示"]').click();
    expect(svg.getAttribute('viewBox')).toBe(before);
  });
});
