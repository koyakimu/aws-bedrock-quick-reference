import land from '../assets/ne_110m_land.json';
import notes from '../../data/region-notes.json';
import profiles from '../../data/profiles.json';
import policies from '../../data/model-policies.json';
import { retentionNotice } from './model-policy.mjs';
const regionMapData={land:land.features.flatMap(f=>f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates),notes,profiles,policies};

const reviewGeoMapRequested = location.hash === '#geo-map';
const reviewLocalMapRequested = location.hash === '#local-map';
const reviewGlobalMapRequested = location.hash === '#global-map';
const reviewFlowRequested = location.hash === '#flow' || reviewGeoMapRequested || reviewGlobalMapRequested || reviewLocalMapRequested;

// Representative city coordinates only; these are not data-center locations.
export const decorateRegionMaps = (() => {
  const coordinates={
    'af-south-1':[18.42,-33.93],'ap-east-2':[121.56,25.03],
    'ap-northeast-1':[139.69,35.68],'ap-northeast-2':[126.98,37.57],'ap-northeast-3':[135.50,34.69],
    'ap-south-1':[72.88,19.08],'ap-south-2':[78.49,17.39],
    'ap-southeast-1':[103.82,1.35],'ap-southeast-2':[151.21,-33.87],'ap-southeast-3':[106.85,-6.21],
    'ap-southeast-4':[144.96,-37.81],'ap-southeast-5':[101.69,3.14],'ap-southeast-6':[174.76,-36.85],'ap-southeast-7':[100.50,13.76],
    'ca-central-1':[-73.57,45.50],'ca-west-1':[-114.07,51.05],
    'eu-central-1':[8.68,50.11],'eu-central-2':[8.54,47.38],'eu-north-1':[18.07,59.33],
    'eu-south-1':[9.19,45.46],'eu-south-2':[-3.70,40.42],'eu-west-1':[-6.26,53.35],'eu-west-2':[-0.13,51.51],'eu-west-3':[2.35,48.86],
    'il-central-1':[34.78,32.09],'me-central-1':[54.37,24.45],'me-south-1':[50.59,26.22],
    'mx-central-1':[-100.39,20.59],'sa-east-1':[-46.63,-23.55],
    'us-east-1':[-77.44,39.04],'us-east-2':[-82.99,39.96],'us-west-1':[-121.89,37.34],'us-west-2':[-122.68,45.52]
  };
  let mapSequence=0;
  const ns='http://www.w3.org/2000/svg';
  const s=(tag,attrs={},value)=>{const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));if(value)n.textContent=value;return n;};
  const h=(tag,cls,value)=>{const n=document.createElement(tag);n.className=cls;if(value)n.textContent=value;return n;};
  return ()=>{
    const en=document.documentElement.lang==='en';
    const origin=document.querySelector('#source-region').value;
    const name=code=>regionMapData.notes[code]?.[en?'en':'ja']||code;
    for(const figure of document.querySelectorAll('figure.flow:not([data-region-map])')){
      figure.dataset.regionMap='true';
      const flow=figure.querySelector('.flow-scroll'), original=flow?.querySelector('svg');
      if(!original||!coordinates[origin])continue;
      const lane=figure.dataset.lane, off=!!original.querySelector('.s-off');
      if(off){
        const empty=h('div','map-unavailable');
        empty.append(h('strong','',en?'Not offered':'提供なし'),h('span','',en?'Check the inference modes offered for this model and source Region.':'このモデル・送信元リージョンでの提供状況です。他の推論方式やリージョンも確認できます。'));
        figure.replaceChildren(empty);
        continue;
      }
      const profile=figure.closest('.lane-block')?.dataset.profileId;
      const destinations=off?[]:lane==='geo'?(regionMapData.profiles[profile]?.sources?.[origin]||[]):lane==='inRegion'?[origin]:[];
      const points=[...new Set([origin,...destinations])].filter(c=>coordinates[c]);
      const global=lane==='global';
      const shell=h('div','region-map');
      figure.replaceChildren(shell);
      const header=h('div','map-header');
      const title=h('div','');title.append(h('span','map-eyebrow',global?'GLOBAL INFERENCE':'INFERENCE REGIONS'),h('strong','map-title',off?(en?'Not offered':'提供なし'):global?(en?'Worldwide routing':'世界の対応リージョンへ'):lane==='geo'?(en?'Regional routing':'地域内の推論先'):name(origin)));
      header.append(title,h('span','map-count',off?'—':global?'GLOBAL':`${destinations.length} ${en?'REGIONS':'リージョン'}`));shell.append(header);
      const svg=s('svg',{viewBox:'0 0 900 520',role:'img','aria-label':en?'Schematic map of origin and inference regions':'地図から矢印で推論先と監査ログなどの保存先を示す概念図',class:'inference-map'});
      const viewport=h('div','map-diagram-scroll');viewport.tabIndex=0;viewport.setAttribute('aria-label',en?'Map diagram; use the controls to zoom in or fit all inference regions':'地図と保存先の図。ボタンで拡大・全体表示を切り替えられます');viewport.append(svg);shell.append(viewport);
      const mapId=`region-map-${++mapSequence}`;
      const defs=s('defs');
      for(const [key,color] of [['inference','#6ce9ff'],['storage','#f3c783'],['response','#b8acff']]){
        const marker=s('marker',{id:`${mapId}-${key}`,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'});marker.append(s('path',{d:'M1 1L9 5L1 9',fill:'none',stroke:color,'stroke-width':1.5}));defs.append(marker);
      }
      const clip=s('clipPath',{id:`${mapId}-clip`});clip.append(s('rect',{width:900,height:520}));defs.append(clip);svg.append(defs);
      const cs=points.map(c=>coordinates[c]);
      const [cx,cy]=coordinates[origin];
      const radiusX=Math.max(...cs.map(p=>Math.abs(p[0]-cx)));
      const radiusY=Math.max(...cs.map(p=>Math.abs(p[1]-cy)));
      const padding=lane==='geo'?2.35:2.7;
      let spanY=Math.max(lane==='geo'?7.5:13,radiusY*padding,radiusX*padding/(900/520)),spanX=spanY*(900/520);
      if(global){spanY=Math.max(184.5,2*(85+Math.abs(cy)));spanX=spanY*(900/520);}
      const project=([lon,lat])=>[450+(lon-cx)*900/spanX,260-(lat-cy)*520/spanY];
      const land=s('g',{class:'map-land','aria-hidden':'true'});
      for(const offset of [-360,0,360])for(const polygon of regionMapData.land){land.append(s('path',{d:polygon.map(ring=>ring.map((p,i)=>`${i?'L':'M'}${project([p[0]+offset,p[1]]).map(v=>v.toFixed(1)).join(' ')}`).join(' ')+'Z').join(' ')}));}
      land.setAttribute('clip-path',`url(#${mapId}-clip)`);svg.append(land);
      const grid=s('g',{class:'map-grid','aria-hidden':'true'});
      const interval=global?30:spanX>80?20:spanX>35?10:5;
      for(let lon=-180;lon<=180;lon+=interval){const [x]=project([lon,0]);if(x>=0&&x<=900)grid.append(s('path',{d:`M${x} 0V520`}));}
      for(let lat=-60;lat<=85;lat+=interval){const [,y]=project([0,lat]);if(y>=0&&y<=520)grid.append(s('path',{d:`M0 ${y}H900`}));}svg.append(grid);
      const [ox,oy]=project(coordinates[origin]);
      const routes=s('g',{class:'map-routes'});svg.append(routes);
      for(const code of destinations.filter(c=>c!==origin&&coordinates[c])){
        const [x,y]=project(coordinates[code]);
        const qx=(ox+x)/2,qy=Math.min(oy,y)-Math.max(35,Math.abs(x-ox)*.22);
        const length=Math.hypot(x-qx,y-qy);
        const ex=x-(x-qx)/length*13,ey=y-(y-qy)/length*13;
        const d=`M${ox},${oy} Q${qx},${qy} ${ex},${ey}`;
        routes.append(s('path',{d,'data-destination':code,class:'map-route','marker-end':`url(#${mapId}-inference)`}));
      }
      if(destinations.includes(origin)&&!off){
        // A self-loop is an inference candidate, including Geo profiles containing the origin.
        const d=`M${ox-8} ${oy-20} C${ox-115} ${oy-130},${ox+105} ${oy-130},${ox+8} ${oy-20}`;
        routes.append(s('path',{d,class:'map-local-route','data-destination':origin,'marker-end':`url(#${mapId}-inference)`}));
        routes.append(s('path',{d,class:'map-global-signal map-local-signal','data-destination':origin,pathLength:100}));
        routes.append(s('text',{x:ox,y:oy-112,'text-anchor':'middle',class:'map-inference-label'},en?'INFERENCE HERE':'ここで推論'));
      }
      if(lane==='geo'&&!off){
        for(const path of [...routes.querySelectorAll('.map-route')]){
          const d=path.getAttribute('d'),code=path.dataset.destination;
          routes.append(s('path',{d,class:'map-global-signal map-geo-signal','data-destination':code,pathLength:100}));
          routes.append(s('path',{d,class:'map-response-route','data-destination':code,transform:'translate(0 7)','marker-start':`url(#${mapId}-response)`}));
        }
      }
      if(!off){
        const legend=h('div','map-legend');
        for(const [cls,label] of [['input',en?'Inference input':'推論の入力'],['output',en?'Response':'応答'],['logs',en?'Logs at origin':'送信元でログ記録']])legend.append(h('span',`map-legend-${cls}`,label));
        header.after(legend);
      }
      const nodes=s('g');svg.append(nodes);
      const occupied=[{x:ox-65,y:oy-122,w:360,h:225}];
      for(const code of points){
        const [x,y]=project(coordinates[code]),isOrigin=code===origin;
        const g=s('g',{'data-destination':code,class:isOrigin?'map-point map-origin':'map-point'});
        g.append(s('circle',{cx:x,cy:y,r:isOrigin?21:12,class:'map-halo'}),s('circle',{cx:x,cy:y,r:isOrigin?6:4,class:'map-dot'}));
        if(isOrigin){
          g.append(s('text',{x:x+28,y:y-14,class:'map-place map-origin-name'},name(code)),s('text',{x:x+28,y:y+5,class:'map-origin-label'},en?'REQUEST ORIGIN':'リクエスト送信元'));
          if(!off){
            const storage=s('g',{class:'map-origin-storage'});
            storage.append(s('path',{d:`M${x} ${y+23}V${y+43}H${x+25}`,class:'map-storage-link'}));
            storage.append(s('text',{x:x+32,y:y+46,class:'map-storage-title'},en?'Logs recorded here':'ここでログを記録'));
            storage.append(s('text',{x:x+32,y:y+65,class:'map-storage-detail'},'CloudTrail / CloudWatch'));

            g.append(storage);

          }
        }else{
          // Place labels next to their geographic markers, keeping dense regions legible.
          const w=Math.max(88,name(code).length*(en?7:13)+18),height=40;
          let box;
          const candidates=[];
          for(const dy of [-48,14,-94,58,-140,102])for(const dx of [-w-18,18])candidates.push({x:Math.max(12,Math.min(888-w,x+dx)),y:Math.max(18,Math.min(460,y+dy)),w,h:height});
          box=candidates.find(r=>!occupied.some(o=>r.x<o.x+o.w+8&&r.x+r.w+8>o.x&&r.y<o.y+o.h+6&&r.y+r.h+6>o.y))||candidates[0];
          occupied.push(box);
          g.append(s('path',{d:`M${x} ${y}L${Math.max(box.x,Math.min(box.x+w,x))} ${box.y+20}`,class:'map-label-link'}));
          g.append(s('text',{x:box.x+8,y:box.y+16,class:'map-place'},name(code)),s('text',{x:box.x+8,y:box.y+34,class:'map-inference-label'},en?'INFERENCE':'推論'));
        }
        nodes.append(g);
      }
      if(global&&!off){
        // Illustrative global directions, not an inventory of supported AWS destinations.
        const directions=[[-123,46],[-78,38],[-47,-23],[-6,53],[10,50],[25,-28],[55,25],[77,19],[104,1],[151,-34],[127,38]];
        const illustration=s('g',{class:'map-global-routes','aria-hidden':'true'});
        directions.forEach(([lon,lat],i)=>{
          const wrapped=cx+((lon-cx+540)%360)-180;
          const [x,y]=project([wrapped,lat]);
          const qx=(ox+x)/2,qy=Math.min(oy,y)-45-Math.abs(x-ox)*.25;
          const length=Math.hypot(x-qx,y-qy),ex=x-(x-qx)/length*9,ey=y-(y-qy)/length*9;
          const d=`M${ox} ${oy}Q${qx} ${qy} ${ex} ${ey}`;
          illustration.append(s('path',{d,class:'map-global-route','marker-end':`url(#${mapId}-inference)`}));
          illustration.append(s('path',{d,class:'map-response-route',transform:'translate(0 7)','marker-start':`url(#${mapId}-response)`}));
          const signal=s('path',{d,class:'map-global-signal',pathLength:100,style:`animation-delay:-${i*.37}s`});illustration.append(signal);
          illustration.append(s('circle',{cx:x,cy:y,r:6,class:'map-global-endpoint'}));
        });
        routes.append(illustration);
      }
      // Crop symmetrically around the origin, retaining every route and location label.
      // Unlike changing the projection, this removes empty space without shrinking the map.
      const measuringPanel=figure.closest('.lane-panel');
      const wasHidden=measuringPanel?.hidden;
      if(wasHidden)measuringPanel.hidden=false;
      const bounds=[routes.getBBox(),nodes.getBBox()];
      if(wasHidden)measuringPanel.hidden=true;
      const halfHeight=Math.max(165,...bounds.map(box=>Math.max(Math.abs(box.y-oy),Math.abs(box.y+box.height-oy))+22));
      svg.setAttribute('viewBox',`0 ${oy-halfHeight} 900 ${halfHeight*2}`);
      const zoomControls=h('div','map-zoom');
      const zoomOut=h('button','','−'),resetZoom=h('button','',en?'Fit':'全体'),zoomIn=h('button','','＋');
      for(const button of [zoomOut,resetZoom,zoomIn])button.type='button';
      zoomOut.setAttribute('aria-label',en?'Zoom out':'地図を縮小');
      zoomIn.setAttribute('aria-label',en?'Zoom in':'地図を拡大');
      resetZoom.setAttribute('aria-label',en?'Fit all inference regions':'推論先全体を表示');
      let zoom=1;
      const setZoom=value=>{
        zoom=Math.max(1,Math.min(2.5,value));
        const width=900/zoom,height=halfHeight*2/zoom;
        svg.setAttribute('viewBox',`${ox-width/2} ${oy-height/2} ${width} ${height}`);
        // Keep the viewport dimensions stable while changing the area shown.
        svg.style.aspectRatio=`900 / ${halfHeight*2}`;
        zoomOut.disabled=zoom===1;zoomIn.disabled=zoom===2.5;
      };
      zoomOut.onclick=()=>setZoom(zoom-.25);zoomIn.onclick=()=>setZoom(zoom+.25);resetZoom.onclick=()=>setZoom(1);
      zoomControls.append(zoomOut,resetZoom,zoomIn);header.append(zoomControls);setZoom(1);

      const list=h('div','map-destinations');
      if(lane==='geo'&&!off){
        const label=h('span','map-list-label',en?'Inference regions':'推論先');list.append(label);
        for(const code of destinations){const b=h('button','map-region-chip',name(code));b.type='button';b.title=code;b.dataset.region=code;b.setAttribute('aria-pressed','false');b.onclick=()=>{
          const selected=b.getAttribute('aria-pressed')!=='true';
          list.querySelectorAll('button').forEach(n=>n.setAttribute('aria-pressed',String(selected&&n===b)));
          svg.classList.toggle('has-selection',selected);
          svg.querySelectorAll('[data-destination]').forEach(n=>n.classList.toggle('is-selected',selected&&n.dataset.destination===code));
        };list.append(b);}
      }
      shell.append(list);
      const description=off?(en?'Check other inference modes or source Regions.':'他の推論方式やリージョンの提供状況を確認できます。'):global?(en?'AWS routes to a supported region worldwide. Destinations can change.':'世界の対応リージョンへAWSが振り分けます。推論先はリクエストごとに選択され、対応リージョンは追加される場合があります。'):lane==='geo'?(en?'Each request is processed in one of these regions. Lines show possible routes.':'各リクエストは、推論先のいずれか1か所で処理されます。線は経路の候補です。'):(en?'Inference stays in the origin region.':'送信元リージョン内で推論します。');
      shell.append(h('p','map-explanation',global&&!off?(en?'Illustrative worldwide routes; destinations are not fixed.':'世界への振り分けを示す概念図です。地点・経路は模式表現です。'):description));
      if(!off){
        const summary=lane==='inRegion'
          ?(en?'Inference input and output are processed within the source Region.':'推論の入力・出力は、送信元リージョン内で処理されます。')
          :(en?'Inference input (including prompts) and output can cross Regions. CloudTrail records the request in the source Region.':'推論の入力（プロンプトなど）と出力はリージョンをまたぐ場合があります。CloudTrailは送信元リージョンで記録します。');
        const audit=h('div','map-residency-note');

        const modelId=figure.closest('tr[data-model-id]')?.dataset.modelId;
        const notice=retentionNotice(modelId,regionMapData.policies,{language:en?'en':'ja',lane});
        if(notice){
          const note=h('p','map-retention-exception',notice.text);
          const source=h('a','',en?'Source':'出典');source.href=notice.sourceUrl;source.target='_blank';source.rel='noreferrer';
          note.append(document.createTextNode(' '),source);audit.append(note);
        }
        const detail=h('details','map-audit-details');detail.append(h('summary','',en?'Details & sources':'説明・出典'));
        detail.append(h('p','',summary));
        detail.append(h('p','',en?'Arrows include input prompts and output results. Each request runs in one destination; motion is illustrative. Region markers and self-loops are schematic, not data-center locations or region boundaries.':'矢印は入力プロンプト・出力結果の移動を示します。1リクエストの処理先は1か所で、動きは概念表現です。地点・周回線は概略表現で、施設の所在地や地理的な境界ではありません。'));
        detail.append(h('p','',en?'Invocation logging is off by default. When enabled on bedrock-runtime, delivery is to CloudWatch Logs / S3 in the same account and Region as the configuration. Origin placement is an inference from this requirement. Customer-configured forwarding or replication is outside this diagram.':'呼び出しログは既定で無効です。bedrock-runtimeで有効化した場合、設定と同じアカウント・リージョンのCloudWatch Logs / S3へ出力します。送信元での保存はこの要件からの推定です。利用者によるログ転送・複製は、この図の対象外です。'));
        for(const [label,path] of [['Cross-Region inference','cross-region-inference'],['Geographic inference','geographic-cross-region-inference'],['Global inference','global-cross-region-inference'],['Invocation logging','model-invocation-logging']]){const a=h('a','',label);a.href=`https://docs.aws.amazon.com/bedrock/latest/userguide/${path}.html`;a.target='_blank';a.rel='noreferrer';detail.append(a);}
        const credit=h('a','','Natural Earth');credit.href='https://www.naturalearthdata.com/about/terms-of-use/';credit.target='_blank';credit.rel='noreferrer';detail.append(credit);
        audit.append(detail);shell.append(audit);
      }

    }
  };
})();

// A review link can open the first matching model directly at its flow diagram.
window.addEventListener('load',()=>{
  if(!reviewFlowRequested)return;
  requestAnimationFrame(()=>{
    const toggle=document.querySelector('#models-table .detail-toggle');
    if(toggle&&toggle.getAttribute('aria-expanded')!=='true')toggle.click();
    requestAnimationFrame(()=>{
      if(reviewLocalMapRequested)document.querySelector('.lane-tab[data-lane="inRegion"]')?.click();
      if(reviewGlobalMapRequested)document.querySelector('.lane-tab[data-lane="global"]')?.click();
      if(reviewGeoMapRequested)document.querySelector('.lane-tab[data-lane="geo"]')?.click();
      requestAnimationFrame(()=>document.querySelector('.lane-panel:not([hidden]) figure.flow')?.scrollIntoView({block:'center'}));
    });
  });
});
