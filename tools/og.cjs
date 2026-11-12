const { chromium } = require('playwright'); const fs=require('fs'); const path=require('path');
const F=p=>'file://'+path.resolve(__dirname,'node_modules',p);
const clubs=[
 ['smaa-netball-dashboard','SMAA Netball','St Michael & All Angels','SAUCNA Juniors & Open · Summer 2026/27','smaa.scozo.com.au'],
 ['metrojets-dashboard','Metro Jets Netball','Metro Jets','City Night Division 1 · Summer 2026/27','jets.scozo.com.au'],
 ['contax-dashboard','Contax Netball','Contax','City Night Division 1 · Summer 2026/27','contax.scozo.com.au'],
 ['morialta-dashboard','Morialta Netball','Morialta Uniting','SAUCNA Juniors & Open · Summer 2026/27','mnc.scozo.com.au'],
 ['henley-sharks','Henley Sharks Netball','Henley Sharks','SAUCNA Juniors & Open · Summer 2026/27','henley.scozo.com.au'],
 ['matrics-dashboard','Matrics Netball','Matrics','City Night Division 1 · Summer 2026/27','matrics.scozo.com.au'],
];
(async()=>{const b=await chromium.launch();
const only=process.argv.slice(2);
for (const [repo,eyebrow,club,comp,url] of clubs){ if(only.length&&!only.includes(repo)) continue;
  const dir='/home/claude/'+repo; const s=fs.readFileSync(dir+'/index.html','utf8');
  const a=s.match(/--band-a:\s*(#[0-9a-f]{6})/i)[1], bb=s.match(/--band-b:\s*(#[0-9a-f]{6})/i)[1];
  const sky=(s.match(/--sky:\s*(#[0-9a-f]{6})/i)||[,'#ffffff'])[1];
  const logo=s.match(/<header[\s\S]*?<img src="(assets\/[^"]+)"/)[1];
  const html=`<!doctype html><html><head><style>
  @font-face{font-family:Archivo;src:url(${F('@fontsource-variable/archivo/files/archivo-latin-wdth-italic.woff2')}) format('woff2');font-style:italic;font-weight:100 900;font-stretch:62% 125%}
  @font-face{font-family:Archivo;src:url(${F('@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2')}) format('woff2');font-style:normal;font-weight:100 900;font-stretch:62% 125%}
  @font-face{font-family:'Open Sans';src:url(${F('@fontsource/open-sans/files/open-sans-latin-600-normal.woff2')});font-weight:600}
  html,body{margin:0;width:1200px;height:630px;overflow:hidden}
  body{background:${a};color:#fff;font-family:'Open Sans',sans-serif;position:relative}
  .slab{position:absolute;inset:0;background:linear-gradient(115deg,${a} 0 52%,${bb} 52% 100%)}
  .glow{position:absolute;right:-120px;top:-160px;width:700px;height:700px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,255,255,.10),transparent)}
  .wrap{position:absolute;inset:0;display:flex;align-items:center;gap:64px;padding:0 84px}
  .logo{flex:none;width:300px;height:360px;display:flex;align-items:center;justify-content:center}
  .logo img{max-width:300px;max-height:360px;filter:drop-shadow(0 12px 28px rgba(0,0,0,.35))}
  .eyebrow{font-family:Archivo;font-style:italic;font-weight:800;font-stretch:100%;font-size:34px;letter-spacing:.04em;text-transform:uppercase;color:${sky};margin:0 0 6px}
  h1{font-family:Archivo;font-style:italic;font-weight:900;font-stretch:112%;font-size:108px;line-height:.9;margin:0;text-transform:uppercase;letter-spacing:-.01em}
  .comp{font-size:28px;font-weight:600;opacity:.88;margin:26px 0 0}
  .url{position:absolute;left:84px;bottom:40px;right:84px;display:flex;justify-content:space-between;font-family:Archivo;font-weight:700;font-stretch:100%;font-size:24px;letter-spacing:.06em;opacity:.8}
  </style></head><body><div class="slab"></div><div class="glow"></div>
  <div class="wrap"><div class="logo"><img src="file://${dir}/${logo}" style="${repo==='contax-dashboard'?'max-width:220px':repo==='matrics-dashboard'?'width:300px;background:#fff;padding:22px 26px;border-radius:28px;box-sizing:border-box':''}"></div>
  <div><p class="eyebrow">${eyebrow}</p><h1>Fixtures<br>&amp; Results</h1><p class="comp">${comp}</p></div></div>
  <div class="url"><span>${url.toUpperCase()}</span><span>LIVE FROM PLAYHQ</span></div></body></html>`;
  const p=await b.newPage({viewport:{width:1200,height:630}});
  const f=path.join(__dirname,`card-${repo}.html`); fs.writeFileSync(f,html); await p.goto('file://'+f,{waitUntil:'load'}); await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(200);
  await p.screenshot({path:`${dir}/assets/og.png`}); await p.screenshot({path:path.join(__dirname,`og-${repo}.png`)});
  console.log(repo, fs.statSync(`${dir}/assets/og.png`).size);
}
await b.close();})();
