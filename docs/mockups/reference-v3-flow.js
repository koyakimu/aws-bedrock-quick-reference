const reviewGeoMapRequested = location.hash === '#geo-map';
const reviewLocalMapRequested = location.hash === '#local-map';
const reviewGlobalMapRequested = location.hash === '#global-map';
const reviewFlowRequested = location.hash === '#flow' || reviewGeoMapRequested || reviewGlobalMapRequested || reviewLocalMapRequested;

// A presentation-only layer over the existing SVG. Region boundaries, paths and claims stay intact.
window.decorateFutureFlow = (() => {
  const NS='http://www.w3.org/2000/svg';
  let sequence=0;
  const make=(tag,attrs={},text)=>{
    const node=document.createElementNS(NS,tag);
    for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
    if(text!==undefined)node.textContent=text;
    return node;
  };
  return () => {
    const en=document.documentElement.lang==='en';
    for(const svg of document.querySelectorAll('figure.flow .flow-scroll > svg:not([data-future-flow])')){
      svg.dataset.futureFlow='true';
      const id=`concept3-flow-${++sequence}`;
      const defs=svg.querySelector('defs');
      const gradient=make('linearGradient',{id:`${id}-surface`,x1:'0%',y1:'0%',x2:'100%',y2:'100%'});
      gradient.append(make('stop',{offset:'0%','stop-color':'#163d58'}),make('stop',{offset:'100%','stop-color':'#112438'}));
      defs.append(gradient);
      svg.style.setProperty('--flow-node-fill',`url(#${id}-surface)`);
      // Replace the stock person silhouette with a client-device outline, preserving the “you” label.
      const glyphs=svg.querySelectorAll('.s-glyph');
      for(const glyph of glyphs)glyph.remove();
      const client=make('g',{'aria-hidden':'true',class:'flow-client-icon'});
      client.append(
        make('rect',{x:23,y:85,width:38,height:29,rx:4}),
        make('path',{d:'M30 94 L36 99 L30 104 M42 104 H51 M36 119 H48 M42 114 V119'}),
        make('circle',{cx:56,cy:90,r:1,class:'flow-client-indicator'}),
      );
      svg.querySelector('[data-node="you"]').before(client);
      // Animate only the existing request / response paths, never add a destination or route.
      for(const selector of ['.s-arrow-accent','.s-arrow-back']){
        const path=svg.querySelector(selector);
        if(!path)continue;
        const glow=path.cloneNode(false);
        glow.removeAttribute('marker-end');
        glow.setAttribute('class','flow-path-glow');
        glow.setAttribute('aria-hidden','true');
        path.before(glow);
        const signal=path.cloneNode(false);
        signal.removeAttribute('marker-end');
        signal.setAttribute('class',selector==='.s-arrow-accent'?'flow-signal flow-request-signal':'flow-signal flow-response-signal');
        signal.setAttribute('aria-hidden','true');
        signal.setAttribute('pathLength','100');
        path.after(signal);
      }
      const origin=svg.querySelector('.s-node-origin');
      if(origin){
        const x=Number(origin.getAttribute('x')),y=Number(origin.getAttribute('y'));
        const w=Number(origin.getAttribute('width')),h=Number(origin.getAttribute('height'));
        const brackets=make('path',{d:`M${x-4} ${y+11}V${y-4}H${x+11} M${x+w-11} ${y-4}H${x+w+4}V${y+11} M${x-4} ${y+h-11}V${y+h+4}H${x+11} M${x+w-11} ${y+h+4}H${x+w+4}V${y+h-11}`,class:'flow-node-brackets','aria-hidden':'true'});
        origin.after(brackets);
      }
      const toolbar=document.createElement('div');toolbar.className='flow-toolbar';
      const label=document.createElement('span');label.className='flow-toolbar-title';label.textContent=en?'REQUEST / RESPONSE':'リクエスト / 応答';
      const mode=document.createElement('span');mode.className='flow-toolbar-mode';
      mode.textContent={inRegion:'IN-REGION',geo:'GEO',global:'GLOBAL'}[svg.dataset.lane]||'';
      const schematic=document.createElement('span');schematic.className='flow-toolbar-note';schematic.textContent=en?'SCHEMATIC':'通信経路の概念図';
      toolbar.append(label,mode,schematic);
      svg.before(toolbar);
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
