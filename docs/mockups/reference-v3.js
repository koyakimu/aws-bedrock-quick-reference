// Called by the prototype presentation adapter while its observer is disconnected.
window.decorateConcept3 = (() => {
  let context, regionTitle, regionCode, stats, contextNote, advanced, advancedSummary, advancedBody, advancedFields, mobileState;
  const mobileQuery=matchMedia("(max-width:768px)");
  mobileQuery.addEventListener("change",()=>window.decorateConcept3());
  const text = (el,value) => { if(el.textContent!==value)el.textContent=value; };
  return () => {
    const en=document.documentElement.lang==='en';
    const t=(ja,english)=>en?english:ja;
    document.title='AWS Bedrock Reference — Concept 03';
    text(document.querySelector('.concept-label'),t('デザイン案 03','CONCEPT 03'));
    if(!context){
      context=document.createElement('section');context.className='region-overview';
      const origin=document.createElement('div');origin.className='origin-context';
      const heading=document.createElement('div');heading.className='origin-heading';
      regionTitle=document.createElement('h2');regionCode=document.createElement('span');regionCode.className='region-code';
      heading.append(regionTitle,regionCode);origin.append(heading);
      const bar=document.querySelector('#source-bar');bar.before(context);origin.append(bar);
      const connection=bar.querySelector('.connection-details');
      stats=document.createElement('div');stats.className='availability-summary';
      for(const [key,label] of [['local','In-Region'],['geo','Geo'],['global','Global']]){
        const card=document.createElement('div');card.className=`availability-stat stat-${key}`;
        const title=document.createElement('span');title.className='stat-label';title.textContent=label;
        const number=document.createElement('strong');number.className='stat-value';
        const description=document.createElement('span');description.className='stat-description';
        card.append(title,number,description);stats.append(card);
      }
      contextNote=document.createElement('p');contextNote.className='context-note';stats.append(contextNote);
      context.append(origin,stats,connection);
      const callable=document.querySelector('.filter-field:has(#filter-callable)');
      document.querySelector('.filter-summary').append(callable);
      const filterHeading=document.createElement('h2');filterHeading.className='filter-heading';
      document.querySelector('#filter-bar').prepend(filterHeading);
      advanced=document.createElement('details');advanced.className='advanced-filters';
      advancedSummary=document.createElement('summary');advancedBody=document.createElement('div');advancedBody.className='advanced-filter-fields';
      advanced.append(advancedSummary,advancedBody);document.querySelector('.filter-controls').append(advanced);
      advancedFields=['filter-provider','filter-modality','filter-limit'].map(id=>document.getElementById(id).closest('.filter-field'));
    }
    text(advancedSummary,t('提供元・モダリティ・推論先で絞り込む','Filter by provider, modality or destination'));
    if(mobileState!==mobileQuery.matches){
      mobileState=mobileQuery.matches;
      for(const field of advancedFields)(mobileState?advancedBody:document.querySelector('.filter-controls')).append(field);
      advanced.hidden=!mobileState;
    }
    const select=document.querySelector('#source-region');
    const option=select.selectedOptions[0];
    const place=(option?.textContent||select.value).split(' — ').slice(1).join(' — ').replace(/（未取得）|\(not fetched\)/g,'');
    text(regionTitle,place||select.value);text(regionCode,select.value);
    text(document.querySelector('.filter-heading'),t('モデルを絞り込む','Filter models'));
    const rows=[...document.querySelectorAll('#models-table>table>tbody>tr:not(.detail-row)')];
    const denied=!document.querySelector('#denied-banner').hidden;
    const definitions=[['local','.cell-inregion:not(.out-of-limit) .flag-yes',t('起点リージョン内','Within this region')],['geo','.geo-entry:not(.out-of-limit)',t('定義された地理圏内','Within a defined geography')],['global','.cell-global:not(.out-of-limit) .flag-yes',t('世界の対応リージョン','Worldwide supported regions')]];
    for(const [key,selector,label]of definitions){
      const card=stats.querySelector(`.stat-${key}`);
      text(card.querySelector('.stat-value'),denied?'—':String(rows.filter(row=>row.querySelector(selector)).length));
      text(card.querySelector('.stat-description'),label);
    }
    text(contextNote,denied?t('提供件数は未取得です','Availability data has not been fetched'):t('絞り込み結果の利用可能モデル数 · 複数の方式に対応するモデルは重複して集計','Available models in filtered results · A model can support multiple modes'));
    const thead=document.querySelector('#models-table>table>thead');
    let groups=thead.querySelector('.column-groups');
    if(!groups){
      groups=document.createElement('tr');groups.className='column-groups';
      for(const span of [3,3,2,2]){const th=document.createElement('th');th.colSpan=span;th.scope='colgroup';groups.append(th)}
      thead.prepend(groups);
    }
    const labels=[t('モデル','MODEL'),t('推論が実行される場所','INFERENCE LOCATION'),t('標準価格 · USD / 1M tokens','STANDARD PRICE · USD / 1M tokens'),t('その他','ADDITIONAL')];
    [...groups.children].forEach((th,i)=>text(th,labels[i]));
    for(const row of rows){
      const cell=row.querySelector('.sticky-provider');
      if(cell&&!cell.querySelector('.provider-text')){
        const names=[...cell.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());
        for(const node of names){const span=document.createElement('span');span.className='provider-text';span.textContent=node.textContent;node.replaceWith(span)}
      }
    }
  };
})();
