import { useState, useEffect, useCallback, useRef } from "react";

/*══════════════════════════════════════════════════════
  CREATORSHIP MVP
  Homepage + Brand Dashboard + Creator Portal
  Real APIs: ScrapeCreators, Meta Marketing, TikTok OAuth
══════════════════════════════════════════════════════*/

const C={bg:"#030711",bg2:"#080d1c",card:"rgba(255,255,255,.025)",border:"rgba(255,255,255,.06)",borderH:"rgba(255,255,255,.14)",text:"#eaeff7",sub:"#7d8aaa",dim:"#3d4660",teal:"#00e4b8",coral:"#ff5252",gold:"#ffb400",blue:"#2da1ff",purple:"#9b6dff",green:"#2dd4a0",pink:"#ff6eb4"};
const g=(a,b)=>`linear-gradient(135deg,${a},${b})`;
const gT=(a,b)=>({background:g(a,b),WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"});
const $=n=>n>=1e6?"$"+(n/1e6).toFixed(1)+"M":n>=1000?"$"+(n/1000).toFixed(1)+"K":"$"+Math.round(n);
const fN=n=>n>=1e6?(n/1e6).toFixed(1)+"M":n>=1000?(n/1000).toFixed(1)+"K":""+n;

const KEYS={scrape:"hMbYVLvb7aWNOq0SkAqbykTusMw2",adAccount:"act_132555948",pageId:"101735585760049",metaToken:"EAAZAmUWLbRuwBQylKzUYCRjCXH1mskhr9QQgqUZBj8VNAG6Yc8ZCXW8DaWzJ554jkJsbw2YLVf0CfqJQAbV44wZBZCqPa4DXZA8jNLBa3IXzR5czwgmZC2J0KPKvc6z14UWuf0Ico7t12GBrlBWUQIjJmg0D3OkRMHvKbZC9lJAdb90xZBx2INSNBaZCq2JAZDZD"};

const CSS=`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Outfit',system-ui;-webkit-font-smoothing:antialiased;background:${C.bg};color:${C.text};overflow-x:hidden}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.05);border-radius:2px}
@keyframes fu{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:none}}
@keyframes fi{from{opacity:0}to{opacity:1}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes flow{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
@keyframes dash{to{stroke-dashoffset:0}}
@keyframes glow{0%,100%{filter:blur(40px) brightness(1)}50%{filter:blur(50px) brightness(1.3)}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
.fu{animation:fu .7s cubic-bezier(.16,1,.3,1) both}
.d1{animation-delay:.1s}.d2{animation-delay:.2s}.d3{animation-delay:.3s}.d4{animation-delay:.4s}.d5{animation-delay:.5s}
.mono{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums}
.gl{background:${C.card};backdrop-filter:blur(16px);border:1px solid ${C.border};border-radius:16px;transition:border-color .2s}
.gl:hover{border-color:${C.borderH}}
input[type=range]{-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer;width:100%}
input[type=range]::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:rgba(255,255,255,.08)}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:20px;height:20px;border-radius:50%;border:2px solid currentColor;background:${C.bg};margin-top:-7px;box-shadow:0 0 8px rgba(0,0,0,.4);transition:transform .15s;cursor:grab}
input[type=range]::-webkit-slider-thumb:active{transform:scale(1.25);cursor:grabbing}
input[type=range]::-moz-range-track{height:6px;border-radius:3px;background:rgba(255,255,255,.08)}
input[type=range]::-moz-range-thumb{width:18px;height:18px;border-radius:50%;border:2px solid currentColor;background:${C.bg};box-shadow:0 0 8px rgba(0,0,0,.4);cursor:grab}
input[type=range]::-moz-range-thumb:active{transform:scale(1.25);cursor:grabbing}
`;

function useRoute(){const[r,s]=useState(window.location.hash.slice(1)||"/");useEffect(()=>{const h=()=>s(window.location.hash.slice(1)||"/");window.addEventListener("hashchange",h);return()=>window.removeEventListener("hashchange",h)},[]);return[r,r2=>{window.location.hash=r2}]}

/*══════════════════════════════════════════════════════
  ROI CALCULATOR
  Logarithmic ad spend slider ($1K–$1M)
  Agency costs scale by spend tier (industry benchmarks)
══════════════════════════════════════════════════════*/
const LOG_MIN=Math.log(1000),LOG_MAX=Math.log(1000000);
function spendFromSlider(v){return Math.round(Math.exp(LOG_MIN+(v/1000)*(LOG_MAX-LOG_MIN))/500)*500}
function sliderFromSpend(s){return Math.round(((Math.log(Math.max(s,1000))-LOG_MIN)/(LOG_MAX-LOG_MIN))*1000)}

function getAgencyCosts(spend){
  const cap=40000,pCap=15000;
  if(spend<=5000)  return{agency:Math.min(Math.max(spend*.20,1500),cap), buyer:Math.min(0,pCap),     creative:Math.min(1000,pCap),  tools:300,  tier:"Freelancer / Boutique", pct:"15–20%"};
  if(spend<=15000) return{agency:Math.min(Math.max(spend*.15,3000),cap), buyer:Math.min(2500,pCap),  creative:Math.min(2500,pCap),  tools:500,  tier:"Small Agency",          pct:"12–15%"};
  if(spend<=50000) return{agency:Math.min(Math.max(spend*.12,5000),cap), buyer:Math.min(4000,pCap),  creative:Math.min(5000,pCap),  tools:800,  tier:"Mid-Size Agency",       pct:"10–12%"};
  if(spend<=150000)return{agency:Math.min(Math.max(spend*.10,8000),cap), buyer:Math.min(6000,pCap),  creative:Math.min(10000,pCap), tools:1500, tier:"Full-Service Agency",   pct:"8–10%"};
  if(spend<=500000)return{agency:Math.min(Math.max(spend*.08,15000),cap),buyer:Math.min(12000,pCap), creative:Math.min(15000,pCap), tools:2500, tier:"Performance Agency",    pct:"6–8%"};
  return                 {agency:Math.min(Math.max(spend*.06,30000),cap),buyer:Math.min(15000,pCap), creative:Math.min(15000,pCap), tools:4000, tier:"Enterprise Agency",     pct:"5–6%"};
}

function ROICalculator({nav}){
  const[sliderVal,setSliderVal]=useState(sliderFromSpend(10000));
  const[roas,setRoas]=useState(3);
  const[commPct,setCommPct]=useState(10);

  const adSpend=spendFromSlider(sliderVal);
  const revenue=adSpend*roas;
  const commCost=revenue*(commPct/100);
  const platformFee=revenue*0.04;
  const profit=revenue-adSpend-commCost-platformFee;
  const margin=revenue>0?((profit/revenue)*100):0;

  const ac=getAgencyCosts(adSpend);
  const totalTraditional=ac.agency+ac.buyer+ac.creative+ac.tools;
  const traditionalProfit=revenue-adSpend-commCost-totalTraditional;
  const savings=totalTraditional-platformFee;
  const savingsAnnual=savings*12;

  const fmt=n=>n<0?"−$"+Math.abs(n).toLocaleString("en-US",{maximumFractionDigits:0}):"$"+n.toLocaleString("en-US",{maximumFractionDigits:0});

  const Slider=({label,value,set,min,max,step,suffix,color,fmt:f,sub})=>(
    <div style={{marginBottom:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
        <div><span style={{fontSize:12,fontWeight:600,color:C.sub}}>{label}</span>{sub&&<span style={{fontSize:10,color:C.dim,marginLeft:6}}>{sub}</span>}</div>
        <span className="mono" style={{fontSize:24,fontWeight:800,color}}>{f?f(value):value}{suffix||""}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e=>set(+e.target.value)}
        style={{width:"100%",color,height:6,borderRadius:3}}/>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
        <span style={{fontSize:10,color:C.dim}}>{f?f(min):min}{suffix||""}</span>
        <span style={{fontSize:10,color:C.dim}}>{f?f(max):max}{suffix||""}</span>
      </div>
    </div>
  );

  const Row=({label,amount,color,bold,sub,highlight})=>(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:highlight?"rgba(45,212,160,.05)":"rgba(255,255,255,.015)",borderRadius:9,border:highlight?"1px solid "+C.green+"20":"1px solid transparent"}}>
      <div style={{display:"flex",alignItems:"center",gap:9}}>
        <div style={{width:7,height:7,borderRadius:"50%",background:color,flexShrink:0}}/>
        <div style={{textAlign:"left"}}>
          <div style={{fontSize:13,fontWeight:bold?800:500,color:bold?color:C.text}}>{label}</div>
          {sub&&<div style={{fontSize:10,color:C.dim,marginTop:1}}>{sub}</div>}
        </div>
      </div>
      <div className="mono" style={{fontSize:bold?20:15,fontWeight:800,color}}>{amount}</div>
    </div>
  );

  return <div className="fu d4" style={{marginTop:56,maxWidth:860,margin:"56px auto 0"}}>
    <div style={{textAlign:"center",marginBottom:20}}>
      <div className="mono" style={{fontSize:11,fontWeight:700,letterSpacing:".15em",color:C.teal,textTransform:"uppercase",marginBottom:6}}>ROI Calculator</div>
      <div style={{fontSize:22,fontWeight:800,letterSpacing:"-.02em"}}>See what you keep with <span style={gT(C.teal,C.green)}>Creatorship</span></div>
    </div>
    <div className="gl" style={{padding:0,overflow:"hidden"}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}>
        {/* Left — Inputs */}
        <div style={{padding:"28px 28px 24px",borderRight:"1px solid "+C.border}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:".1em",color:C.dim,textTransform:"uppercase",marginBottom:18}}>Your Numbers</div>

          {/* Ad Spend — logarithmic */}
          <div style={{marginBottom:18}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
              <span style={{fontSize:12,fontWeight:600,color:C.sub}}>Monthly Ad Spend</span>
              <span className="mono" style={{fontSize:24,fontWeight:800,color:C.blue}}>{fmt(adSpend)}</span>
            </div>
            <input type="range" min={0} max={1000} step={1} value={sliderVal} onChange={e=>setSliderVal(+e.target.value)}
              style={{width:"100%",color:C.blue,height:6,borderRadius:3}}/>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
              <span style={{fontSize:10,color:C.dim}}>$1,000</span>
              <span style={{fontSize:10,color:C.dim}}>$1,000,000</span>
            </div>
          </div>

          <Slider label="ROAS" value={roas} set={setRoas} min={1} max={8} step={0.5} suffix="×" color={C.gold} sub="return on ad spend"/>
          <Slider label="Creator Commission" value={commPct} set={setCommPct} min={3} max={25} step={1} suffix="%" color={C.coral} sub="% of revenue"/>

          {/* Revenue summary */}
          <div style={{padding:"14px 16px",background:"rgba(255,255,255,.02)",borderRadius:10,border:"1px solid "+C.border}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:12,color:C.sub}}>Revenue Generated</span>
              <span className="mono" style={{fontSize:24,fontWeight:800,...gT(C.teal,C.green)}}>{fmt(revenue)}</span>
            </div>
            <div style={{fontSize:10,color:C.dim,marginTop:3}}>{fmt(adSpend)} ad spend × {roas}× ROAS</div>
          </div>
        </div>

        {/* Right — Breakdown + Comparison */}
        <div style={{padding:"28px 28px 24px",display:"flex",flexDirection:"column"}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:".1em",color:C.dim,textTransform:"uppercase",marginBottom:14}}>With Creatorship</div>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
            <Row label="Ad spend" amount={"−"+fmt(adSpend)} color={C.blue} sub="Meta ads budget"/>
            <Row label={"Commission ("+commPct+"%)"} amount={"−"+fmt(commCost)} color={C.coral} sub="Paid to creators"/>
            <Row label="Creatorship fee (4%)" amount={"−"+fmt(platformFee)} color={C.teal} sub="Only cost — no monthly fees"/>
            <Row label="Your Profit" amount={fmt(profit)} color={C.green} bold highlight sub={margin.toFixed(0)+"% margin on "+fmt(revenue)+" revenue"}/>
          </div>

          {/* vs Traditional — dynamic by tier */}
          <div style={{padding:"14px 16px",background:C.coral+"06",border:"1px solid "+C.coral+"12",borderRadius:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:".08em",color:C.coral,textTransform:"uppercase"}}>vs. {ac.tier}</div>
              <span style={{fontSize:10,color:C.dim,fontWeight:500}}>Typical fee: {ac.pct} of spend</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:3,marginBottom:10}}>
              {[
                {l:"Agency management fee",v:ac.agency},
                ...(ac.buyer>0?[{l:"Creator manager",v:ac.buyer}]:[]),
                {l:"Admin manager",v:ac.creative},
                {l:"Tools & software",v:ac.tools},
              ].map((r,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
                  <span style={{color:C.sub}}>{r.l}</span>
                  <span className="mono" style={{color:C.coral+"bb"}}>{fmt(r.v)}/mo</span>
                </div>
              ))}
              <div style={{width:"100%",height:1,background:C.coral+"15",margin:"4px 0"}}/>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
                <span style={{color:C.sub,fontWeight:700}}>Monthly overhead</span>
                <span className="mono" style={{color:C.coral,fontWeight:800}}>{fmt(totalTraditional)}/mo</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginTop:2}}>
                <span style={{color:C.dim}}>Their profit (same revenue)</span>
                <span className="mono" style={{color:traditionalProfit>=0?C.sub:C.coral,fontWeight:700}}>{fmt(traditionalProfit)}/mo</span>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",background:C.green+"08",borderRadius:8,border:"1px solid "+C.green+"15"}}>
                <span style={{fontSize:13,fontWeight:700,color:C.green}}>You save monthly</span>
                <span className="mono" style={{fontSize:20,fontWeight:800,color:C.green}}>{fmt(savings)}/mo</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:C.green+"04",borderRadius:8}}>
                <span style={{fontSize:11,fontWeight:600,color:C.green+"bb"}}>Annual savings</span>
                <span className="mono" style={{fontSize:15,fontWeight:800,color:C.green}}>{fmt(savingsAnnual)}/yr</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{padding:"16px 28px",borderTop:"1px solid "+C.border,display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(255,255,255,.01)"}}>
        <div style={{display:"flex",gap:16}}>
          {["No subscriptions","No setup fees","No minimums","Cancel anytime"].map((t,i)=>(
            <div key={i} style={{fontSize:11,color:C.sub,display:"flex",alignItems:"center",gap:4}}>
              <span style={{color:C.teal,fontSize:12}}>✓</span>{t}
            </div>
          ))}
        </div>
        <button onClick={()=>nav("#/brand")} style={{padding:"10px 24px",background:C.teal,color:C.bg,fontSize:13,fontWeight:700,border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit"}}>Start Free →</button>
      </div>
    </div>
  </div>;
}

/*══════════════════════════════════════════════════════
  SECTION 1 — HERO: Creators → Creatorship → Brands
══════════════════════════════════════════════════════*/
function HeroSection({nav}){
  return <section style={{position:"relative",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
    {/* Background */}
    <div style={{position:"absolute",inset:0,backgroundImage:"radial-gradient(rgba(255,255,255,.015) 1px,transparent 1px)",backgroundSize:"40px 40px"}}/>
    <div style={{position:"absolute",top:"10%",left:"15%",width:500,height:500,borderRadius:"50%",background:C.coral,filter:"blur(200px)",opacity:.04,animation:"glow 8s ease infinite"}}/>
    <div style={{position:"absolute",bottom:"10%",right:"15%",width:500,height:500,borderRadius:"50%",background:C.teal,filter:"blur(200px)",opacity:.04,animation:"glow 8s ease infinite 4s"}}/>

    <div style={{position:"relative",zIndex:1,textAlign:"center",maxWidth:1100,padding:"100px 40px 60px"}}>
      {/* The connection visual */}
      <div className="fu" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:0,marginBottom:48}}>
        {/* Creators side */}
        <div style={{textAlign:"right",minWidth:200}}>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginBottom:10}}>
            {["🎬","📱","🎥"].map((e,i)=><div key={i} style={{width:44,height:44,borderRadius:12,background:C.coral+"12",border:"1px solid "+C.coral+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,animation:`float 3s ease infinite ${i*.4}s`}}>{e}</div>)}
          </div>
          <div style={{fontSize:28,fontWeight:800,letterSpacing:"-.02em",...gT(C.coral,C.pink)}}>Creators</div>
          <div style={{fontSize:13,color:C.sub,marginTop:4}}>Making content that sells</div>
        </div>

        {/* Connection line → Creatorship → Connection line */}
        <div style={{display:"flex",alignItems:"center",gap:0,margin:"0 20px"}}>
          <svg width="80" height="4" style={{opacity:.3}}><line x1="0" y1="2" x2="80" y2="2" stroke={C.coral} strokeWidth="2" strokeDasharray="6 4"/></svg>
          <div style={{padding:"14px 28px",background:g(C.coral+"15",C.teal+"15"),border:"1px solid rgba(255,255,255,.1)",borderRadius:14,position:"relative"}}>
            <div style={{position:"absolute",inset:-1,borderRadius:14,background:g(C.coral+"30",C.teal+"30"),filter:"blur(20px)",opacity:.5,zIndex:-1}}/>
            <div style={{fontSize:13,fontWeight:800,letterSpacing:".08em",color:"rgba(255,255,255,.5)",textTransform:"uppercase"}}>AI</div>
            <div style={{fontSize:20,fontWeight:900,letterSpacing:"-.01em"}}><span style={gT(C.coral,C.gold)}>Creator</span><span style={gT(C.blue,C.teal)}>ship</span></div>
          </div>
          <svg width="80" height="4" style={{opacity:.3}}><line x1="0" y1="2" x2="80" y2="2" stroke={C.teal} strokeWidth="2" strokeDasharray="6 4"/></svg>
        </div>

        {/* Brands side */}
        <div style={{textAlign:"left",minWidth:200}}>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            {["📊","💰","🚀"].map((e,i)=><div key={i} style={{width:44,height:44,borderRadius:12,background:C.teal+"12",border:"1px solid "+C.teal+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,animation:`float 3s ease infinite ${i*.4+.2}s`}}>{e}</div>)}
          </div>
          <div style={{fontSize:28,fontWeight:800,letterSpacing:"-.02em",...gT(C.blue,C.teal)}}>Brands</div>
          <div style={{fontSize:13,color:C.sub,marginTop:4}}>Running ads that convert</div>
        </div>
      </div>

      {/* Headline */}
      <h1 className="fu d1" style={{fontSize:52,fontWeight:900,lineHeight:1.08,letterSpacing:"-.04em",marginBottom:20,maxWidth:800,margin:"0 auto 20px"}}>
        Creatorship AI turns <span style={gT(C.coral,C.pink)}>TikTok Shop videos</span><br/>into <span style={gT(C.teal,C.blue)}>winning Meta ads</span>
      </h1>

      <p className="fu d2" style={{fontSize:18,color:C.sub,lineHeight:1.65,maxWidth:640,margin:"0 auto 36px"}}>
        Creatorship finds your top-performing TikTok creators, downloads the video, and launches it as a Meta ad — automatically. You only pay when products sell. Get the most out of videos that are already working: turn what’s driving organic sales on TikTok into scaled, high-ROAS Meta campaigns.
      </p>

      <div className="fu d3" style={{display:"flex",gap:12,justifyContent:"center"}}>
        <button onClick={()=>nav("#/brand")} style={{padding:"15px 36px",background:C.teal,color:C.bg,fontSize:15,fontWeight:700,border:"none",borderRadius:12,cursor:"pointer",fontFamily:"inherit",letterSpacing:"-.01em"}}>I'm a Brand →</button>
        <button onClick={()=>nav("#/creator")} style={{padding:"15px 36px",background:C.teal,color:C.bg,fontSize:15,fontWeight:700,border:"none",borderRadius:12,cursor:"pointer",fontFamily:"inherit",letterSpacing:"-.01em"}}>I'm a Creator</button>
      </div>

      <ROICalculator nav={nav}/>
    </div>
  </section>;
}

/*══════════════════════════════════════════════════════
  SECTION 2 — AI Pipeline Visual
══════════════════════════════════════════════════════*/
function AutomationSection(){
  const steps=[
    {n:"01",title:"You don't know who's selling your product",
     desc:"Creatorship scans your TikTok Shop listing and surfaces every creator who's posted a video — with their views, engagement, and sales data attached.",
     pain:"Hundreds of creators are making content about your product right now. You have no idea who they are, how their videos perform, or which ones are actually driving sales.",
     result:"10 seconds",resultLabel:"to find every creator",icon:"🔍",color:C.teal,
     visual:[{l:"Creators found",v:"47",c:C.teal},{l:"Videos scanned",v:"183",c:C.purple},{l:"Data points",v:"2,196",c:C.green}]},
    {n:"02",title:"You can't tell which creators are worth it",
     desc:"AI scores every video on real performance — views, engagement rate, hook quality, estimated GMV, and predicted ROAS. Only creators above your threshold qualify.",
     pain:"You're guessing which content will convert. No scoring system, no ranking, no way to compare 50 creators side by side. You end up picking based on follower count alone.",
     result:"Instant AI scoring",resultLabel:"ranked by real data",icon:"🧠",color:C.purple,
     visual:[{l:"AI Score",v:"92",c:C.green},{l:"Est. GMV",v:"$14.2K",c:C.teal},{l:"Pred. ROAS",v:"4.2×",c:C.gold}]},
    {n:"03",title:"Getting the video file takes forever",
     desc:"Creatorship downloads the winning video directly from TikTok's CDN. No outreach. No waiting. No wrong file formats.",
     pain:"You email the creator, wait 3 days for a reply, get the wrong aspect ratio, ask again, wait another 2 days. Half the time they never respond at all.",
     result:"Instant download",resultLabel:"direct from CDN",icon:"⬇",color:C.teal,
     visual:[{l:"Format",v:"MP4",c:C.teal},{l:"Quality",v:"1080p",c:C.green},{l:"Size",v:"18MB",c:C.dim}]},
    {n:"04",title:"Building a Meta campaign is a 2-hour job",
     desc:"AI uploads the video, creates the campaign, sets targeting, writes ad copy from the caption, and builds the creative — all in one click. Launches PAUSED for your review.",
     pain:"Open Ads Manager. Upload video. Create campaign. Set objective. Build ad set. Choose targeting. Write copy. Create creative. Link ad. You do this per creator, per video.",
     result:"One click",resultLabel:"full campaign built",icon:"🚀",color:C.coral,
     visual:[{l:"Campaign",v:"Created",c:C.green},{l:"Ad Set",v:"US 18-65",c:C.teal},{l:"Budget",v:"$50/day",c:C.gold}]},
    {n:"05",title:"You can't monitor every ad 24/7",
     desc:"Creatorship tracks every campaign in real time. Auto-scales winners above 3× ROAS, pauses losers below 1×, and catches ad fatigue before you waste spend.",
     pain:"You check performance once a day — if you remember. By the time you spot a losing ad, it's burned $500. By the time you notice fatigue, the ROAS has already tanked.",
     result:"24/7 automated",resultLabel:"scale, pause, replace",icon:"📊",color:C.green,
     visual:[{l:"ROAS",v:"3.8×",c:C.green},{l:"Spend",v:"$1,247",c:C.teal},{l:"Revenue",v:"$4,738",c:C.gold}]},
    {n:"06",title:"Paying creators is a monthly headache",
     desc:"Creators get paid automatically. You keep your profit. Creatorship takes 4% of GMV. Stripe handles weekly payouts. No invoices, no chasing.",
     pain:"You're tracking commissions in spreadsheets, sending PayPal transfers manually, chasing creators for W-9s, and spending hours on accounting that adds zero revenue.",
     result:"Automated weekly",resultLabel:"zero manual payouts",icon:"💰",color:C.gold,
     visual:[{l:"Creator",v:"10%",c:C.coral},{l:"Platform",v:"4%",c:C.teal},{l:"You keep",v:"86%",c:C.green}]},
  ];

  return <section style={{background:C.bg2,padding:"100px 40px",position:"relative"}}>
    <div style={{position:"absolute",top:0,left:0,right:0,height:1,background:g("transparent",C.border+"80","transparent")}}/>
    <div style={{position:"absolute",bottom:0,left:0,right:0,height:1,background:g("transparent",C.border+"80","transparent")}}/>
    <div style={{maxWidth:1000,margin:"0 auto"}}>
      <div style={{textAlign:"center",marginBottom:64}}>
        <div className="fu mono" style={{fontSize:11,fontWeight:700,letterSpacing:".15em",color:C.teal,textTransform:"uppercase",marginBottom:10}}>The Full Pipeline</div>
        <h2 className="fu d1" style={{fontSize:42,fontWeight:900,letterSpacing:"-.03em"}}>Six steps. <span style={gT(C.teal,C.green)}>Fully automated.</span></h2>
        <p className="fu d2" style={{fontSize:16,color:C.sub,marginTop:12,maxWidth:550,margin:"12px auto 0"}}>Every pain point you've felt managing creator content — solved by AI in minutes instead of weeks.</p>
      </div>

      {/* Pipeline */}
      <div style={{position:"relative"}}>
        {/* Vertical line */}
        <div style={{position:"absolute",left:32,top:0,bottom:0,width:2,background:g(C.teal+"30",C.green+"30",C.gold+"30"),zIndex:0}}/>

        {steps.map((s,i)=>(
          <div key={i} className={"fu d"+Math.min(i+1,5)} style={{position:"relative",display:"flex",gap:28,marginBottom:i<steps.length-1?36:0,alignItems:"flex-start"}}>
            {/* Step number node */}
            <div style={{width:66,flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",zIndex:1}}>
              <div style={{width:46,height:46,borderRadius:"50%",background:s.color+"15",border:"2px solid "+s.color+"40",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,position:"relative"}}>
                <div style={{position:"absolute",inset:-4,borderRadius:"50%",background:s.color,filter:"blur(16px)",opacity:.12}}/>
                {s.icon}
              </div>
              <div className="mono" style={{fontSize:10,fontWeight:800,color:s.color,marginTop:6,letterSpacing:".05em"}}>{s.n}</div>
            </div>

            {/* Content card */}
            <div className="gl" style={{flex:1,padding:0,overflow:"hidden"}}>
              <div style={{display:"flex"}}>
                {/* Main content */}
                <div style={{flex:1,padding:"24px 28px"}}>
                  {/* Title */}
                  <div style={{fontSize:20,fontWeight:800,letterSpacing:"-.02em",color:C.text,lineHeight:1.25,marginBottom:14}}>{s.title}</div>

                  {/* Pain — readable, no boxes */}
                  <p style={{fontSize:14,color:"#8a92a8",lineHeight:1.65,margin:"0 0 16px"}}>{s.pain}</p>

                  {/* Divider */}
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                    <div style={{height:1,flex:1,background:C.border}}/>
                    <span style={{fontSize:10,fontWeight:700,letterSpacing:".1em",color:s.color,textTransform:"uppercase",flexShrink:0}}>Creatorship solves this</span>
                    <div style={{height:1,flex:1,background:C.border}}/>
                  </div>

                  {/* Solution */}
                  <p style={{fontSize:14,color:C.text,lineHeight:1.65,margin:"0 0 14px"}}>{s.desc}</p>

                  {/* Result tag */}
                  <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"7px 14px",background:C.green+"08",borderRadius:8,border:"1px solid "+C.green+"12"}}>
                    <span className="mono" style={{fontSize:15,fontWeight:800,color:C.green}}>{s.result}</span>
                    <span style={{fontSize:12,color:C.green+"bb"}}>{s.resultLabel}</span>
                  </div>
                </div>

                {/* Right visual panel */}
                <div style={{width:150,borderLeft:"1px solid "+C.border,padding:"20px 16px",display:"flex",flexDirection:"column",justifyContent:"center",gap:12,background:"rgba(255,255,255,.008)"}}>
                  {s.visual.map((v,vi)=>(
                    <div key={vi}>
                      <div style={{fontSize:9,fontWeight:700,color:C.dim,letterSpacing:".08em",textTransform:"uppercase",marginBottom:3}}>{v.l}</div>
                      <div className="mono" style={{fontSize:22,fontWeight:800,color:v.c}}>{v.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom summary */}
      <div className="fu d5" style={{marginTop:48,textAlign:"center"}}>
        <div className="gl" style={{display:"inline-flex",gap:32,padding:"20px 40px",alignItems:"center"}}>
          {[
            {v:"6 steps",l:"fully automated",c:C.teal},
            {v:"< 2 min",l:"paste URL to live campaign",c:C.green},
            {v:"$0",l:"monthly platform cost",c:C.gold},
            {v:"24/7",l:"AI monitoring & optimization",c:C.teal},
          ].map((s,i)=>(
            <div key={i} style={{textAlign:"center"}}>
              <div className="mono" style={{fontSize:20,fontWeight:800,color:s.c}}>{s.v}</div>
              <div style={{fontSize:10,color:C.dim,marginTop:2}}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>;
}

/*══════════════════════════════════════════════════════
  SECTION 3 — Creator + Brand Deep Sell
══════════════════════════════════════════════════════*/
function EarnSection({nav}){
  return <section style={{padding:"100px 40px",position:"relative"}}>
    <div style={{maxWidth:1000,margin:"0 auto"}}>

      {/* ─── CREATOR SECTION ─── */}
      <div className="gl fu" style={{padding:0,overflow:"hidden",position:"relative",marginBottom:40}}>
        <div style={{position:"absolute",top:-40,left:-40,width:180,height:180,borderRadius:"50%",background:C.coral,filter:"blur(80px)",opacity:.05}}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}>
          {/* Left — The sell */}
          <div style={{padding:"36px 36px 32px",borderRight:"1px solid "+C.border}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
              <div style={{width:36,height:36,borderRadius:10,background:C.coral+"12",border:"1px solid "+C.coral+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🎬</div>
              <div style={{fontSize:12,fontWeight:700,color:C.coral,letterSpacing:".08em",textTransform:"uppercase"}}>For Creators</div>
            </div>
            <h3 style={{fontSize:30,fontWeight:900,letterSpacing:"-.02em",lineHeight:1.15,marginBottom:16}}>
              You already made the video.<br/><span style={gT(C.coral,C.pink)}>Now get paid for it again.</span>
            </h3>
            <p style={{fontSize:15,color:"#8a92a8",lineHeight:1.7,marginBottom:20}}>
              You spent hours filming, editing, and posting a TikTok that drove real sales. That video has value beyond TikTok — and brands want to run it as a Meta ad. You should earn every time they do.
            </p>
            <p style={{fontSize:15,color:C.text,lineHeight:1.7,marginBottom:24}}>
              Creatorship makes this effortless. Connect your TikTok once — that's it. No uploading videos. No digging through your camera roll. No back-and-forth with brands. AI handles the rest. You just watch the commission hit your account.
            </p>

            {/* How it works for creators */}
            <div style={{fontSize:11,fontWeight:700,color:C.dim,letterSpacing:".06em",textTransform:"uppercase",marginBottom:12}}>How it works</div>
            {[
              {step:"Connect TikTok",detail:"One click. 30 seconds. That's the only setup.",color:C.coral},
              {step:"Brands find your content",detail:"AI surfaces your videos to brands in your niche — automatically.",color:C.gold},
              {step:"Your video runs as a Meta ad",detail:"No re-filming, no resizing, no approvals. It just goes live.",color:C.teal},
              {step:"You earn on every sale",detail:"Commission deposited weekly. No invoicing, no chasing payments.",color:C.green},
            ].map((s,i)=>(
              <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:12}}>
                <div className="mono" style={{width:24,height:24,borderRadius:7,background:s.color+"10",border:"1px solid "+s.color+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:s.color,flexShrink:0,marginTop:1}}>{i+1}</div>
                <div><div style={{fontSize:14,fontWeight:700,color:C.text}}>{s.step}</div><div style={{fontSize:13,color:"#8a92a8",marginTop:2}}>{s.detail}</div></div>
              </div>
            ))}
          </div>

          {/* Right — Visual mock */}
          <div style={{padding:"36px 32px",display:"flex",flexDirection:"column",justifyContent:"center"}}>
            <div style={{padding:"18px 20px",background:"rgba(255,255,255,.015)",borderRadius:12,border:"1px solid "+C.border,marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <span style={{fontSize:11,fontWeight:700,color:C.dim,letterSpacing:".06em",textTransform:"uppercase"}}>Your Earnings</span>
                <span style={{fontSize:10,color:C.green,fontWeight:700}}>● 3 Active Deals</span>
              </div>
              {[
                {brand:"Intake Breathing",product:"Nasal Strips",earned:"$2,847",orders:"71",status:"Earning"},
                {brand:"GlowUp Skin",product:"Serum Kit",earned:"$1,203",orders:"34",status:"Earning"},
                {brand:"FitFuel",product:"Protein Bars",earned:"$486",orders:"12",status:"New"},
              ].map((d,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderTop:i>0?"1px solid "+C.border:"none"}}>
                  <div><div style={{fontSize:14,fontWeight:600}}>{d.brand}</div><div style={{fontSize:11,color:C.dim}}>{d.product} · {d.orders} orders</div></div>
                  <div style={{textAlign:"right"}}><div className="mono" style={{fontSize:17,fontWeight:800,color:C.green}}>{d.earned}</div><div style={{fontSize:9,color:C.green+"99"}}>{d.status}</div></div>
                </div>
              ))}
              <div style={{marginTop:12,padding:"12px 14px",background:C.green+"06",borderRadius:8,border:"1px solid "+C.green+"12",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:12,fontWeight:600,color:C.sub}}>Total Earned</span>
                <span className="mono" style={{fontSize:22,fontWeight:800,color:C.green}}>$4,536</span>
              </div>
            </div>
            <div style={{textAlign:"center",padding:"12px 16px",background:"rgba(255,255,255,.02)",borderRadius:8,border:"1px solid "+C.border}}>
              <div style={{fontSize:13,color:"#8a92a8",lineHeight:1.5}}>All from videos you already posted. No extra work. No uploads. No negotiations.</div>
            </div>
            <button onClick={()=>nav("#/creator")} style={{marginTop:16,width:"100%",padding:"13px 0",background:C.coral,border:"none",borderRadius:10,color:C.bg,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Connect TikTok — Start Earning →</button>
          </div>
        </div>
      </div>

      {/* ─── BRAND SECTION ─── */}
      <div className="gl fu d2" style={{padding:0,overflow:"hidden",position:"relative"}}>
        <div style={{position:"absolute",top:-40,right:-40,width:180,height:180,borderRadius:"50%",background:C.teal,filter:"blur(80px)",opacity:.05}}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}>
          {/* Left — The pain */}
          <div style={{padding:"36px 36px 32px",borderRight:"1px solid "+C.border}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
              <div style={{width:36,height:36,borderRadius:10,background:C.teal+"12",border:"1px solid "+C.teal+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>📊</div>
              <div style={{fontSize:12,fontWeight:700,color:C.teal,letterSpacing:".08em",textTransform:"uppercase"}}>For Brands</div>
            </div>
            <h3 style={{fontSize:30,fontWeight:900,letterSpacing:"-.02em",lineHeight:1.15,marginBottom:16}}>
              Stop losing weeks on<br/><span style={gT(C.teal,C.green)}>one creator video.</span>
            </h3>
            <p style={{fontSize:15,color:"#8a92a8",lineHeight:1.7,marginBottom:12}}>
              Right now, getting a single TikTok creator's video into a Meta ad takes 2–3 weeks. You DM the creator. Wait for a response. Negotiate usage rights. Wait again. Get the file in the wrong format. Re-request. Upload to Ads Manager. Build the campaign manually. Set targeting. Write copy.
            </p>
            <p style={{fontSize:15,color:"#8a92a8",lineHeight:1.7,marginBottom:12}}>
              And you can only test a handful of ads because each one takes that long. The best-performing creator videos — the ones with 50K views but not enough to justify the agency overhead — never get tested at all.
            </p>
            <p style={{fontSize:15,color:C.text,lineHeight:1.7,marginBottom:0}}>
              Creatorship does all of this in <span style={{color:C.teal,fontWeight:800}}>90 seconds</span>. Paste your product URL. AI finds every creator, scores their content, downloads the MP4, and launches a full Meta campaign. Every video is worth testing now — because it only costs you a click.
            </p>
          </div>

          {/* Right — The old way vs new way visual */}
          <div style={{padding:"36px 32px",display:"flex",flexDirection:"column",justifyContent:"center"}}>
            {/* Old way */}
            <div style={{padding:"16px 18px",background:"rgba(255,82,82,.02)",borderRadius:10,border:"1px solid rgba(255,82,82,.08)",marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:C.coral,letterSpacing:".06em",textTransform:"uppercase",marginBottom:12}}>The old way — per creator</div>
              {[
                {task:"Find creator & review content",time:"2–4 hours"},
                {task:"DM, negotiate, get usage rights",time:"3–7 days"},
                {task:"Receive file, check format, re-request",time:"1–3 days"},
                {task:"Upload to Ads Manager, build campaign",time:"1–2 hours"},
                {task:"Write copy, set targeting, launch",time:"1–2 hours"},
              ].map((r,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderTop:i>0?"1px solid rgba(255,82,82,.06)":"none"}}>
                  <span style={{fontSize:13,color:"#8a92a8"}}>{r.task}</span>
                  <span className="mono" style={{fontSize:12,fontWeight:700,color:C.coral+"bb",flexShrink:0,marginLeft:12}}>{r.time}</span>
                </div>
              ))}
              <div style={{marginTop:10,padding:"10px 12px",background:"rgba(255,82,82,.04)",borderRadius:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,fontWeight:700,color:C.coral}}>Total per creator</span>
                <span className="mono" style={{fontSize:16,fontWeight:800,color:C.coral}}>2–3 weeks</span>
              </div>
              <div style={{marginTop:6,fontSize:12,color:C.dim,textAlign:"center"}}>Most brands can only test 3–5 creators per month this way</div>
            </div>

            {/* New way */}
            <div style={{padding:"16px 18px",background:C.teal+"04",borderRadius:10,border:"1px solid "+C.teal+"15",marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:C.teal,letterSpacing:".06em",textTransform:"uppercase",marginBottom:12}}>With Creatorship AI — per creator</div>
              {[
                {task:"AI finds & scores all creators",time:"10 sec"},
                {task:"Downloads video from CDN",time:"5 sec"},
                {task:"Builds full Meta campaign",time:"60 sec"},
                {task:"Launches PAUSED for review",time:"15 sec"},
              ].map((r,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderTop:i>0?"1px solid "+C.teal+"10":"none"}}>
                  <span style={{fontSize:13,color:C.text}}>{r.task}</span>
                  <span className="mono" style={{fontSize:12,fontWeight:700,color:C.teal,flexShrink:0,marginLeft:12}}>{r.time}</span>
                </div>
              ))}
              <div style={{marginTop:10,padding:"10px 12px",background:C.green+"08",borderRadius:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,fontWeight:700,color:C.green}}>Total per creator</span>
                <span className="mono" style={{fontSize:16,fontWeight:800,color:C.green}}>~90 seconds</span>
              </div>
              <div style={{marginTop:6,fontSize:12,color:C.teal,textAlign:"center",fontWeight:600}}>Test every creator. Even the ones that "weren't worth the time" before.</div>
            </div>

            <button onClick={()=>nav("#/brand")} style={{width:"100%",padding:"13px 0",background:C.teal,border:"none",borderRadius:10,color:C.bg,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Launch Your First Campaign →</button>
          </div>
        </div>
      </div>
    </div>
  </section>;
}

/*══════════════════════════════════════════════════════
  SECTION 4 — CTA + Footer
══════════════════════════════════════════════════════*/
function CTASection(){
  return <section style={{padding:"40px 40px 16px"}}>
    <footer style={{borderTop:"1px solid "+C.border,padding:"32px 0 16px",display:"flex",justifyContent:"space-between",alignItems:"center",maxWidth:1100,margin:"0 auto"}}>
      <div style={{fontSize:18,fontWeight:900}}><span style={gT(C.coral,C.gold)}>Creator</span><span style={gT(C.blue,C.teal)}>ship</span></div>
      <div style={{fontSize:12,color:C.dim}}>TikTok creators × Meta ads × AI</div>
    </footer>
  </section>;
}

function Homepage({nav}){
  return <div>
    <nav style={{position:"fixed",top:0,left:0,right:0,zIndex:100,padding:"14px 40px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(3,7,17,.85)",backdropFilter:"blur(20px)",borderBottom:"1px solid "+C.border}}>
      <div style={{fontSize:20,fontWeight:900,cursor:"pointer"}} onClick={()=>nav("#/")}><span style={gT(C.coral,C.gold)}>Creator</span><span style={gT(C.blue,C.teal)}>ship</span></div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>nav("#/brand")} style={{padding:"8px 20px",background:"transparent",border:"1px solid "+C.border,borderRadius:8,color:C.text,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Brands</button>
        <button onClick={()=>nav("#/creator")} style={{padding:"8px 20px",background:C.teal,border:"none",borderRadius:8,color:C.bg,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Creators</button>
      </div>
    </nav>
    <HeroSection nav={nav}/>
    <AutomationSection/>
    <EarnSection nav={nav}/>
    <CTASection/>
  </div>;
}

/*══════════════════════════════════════════════════════
  BRAND DASHBOARD — Full working product
══════════════════════════════════════════════════════*/
function BrandDashboard({nav}){
  const[tab,setTab]=useState("scan");
  const[metaToken,setMetaToken]=useState(KEYS.metaToken);
  const[productUrl,setProductUrl]=useState("https://www.tiktok.com/shop/pdp/intake-breathing/1729534724196766508");
  const[commission,setCommission]=useState(10);
  const[gmvFloor,setGmvFloor]=useState(200);
  const[price,setPrice]=useState(39.99);
  const[scan,setScan]=useState(null);
  const[scanning,setScanning]=useState(false);
  const[storeProducts,setStoreProducts]=useState(null);
  const[loadingStore,setLoadingStore]=useState(false);
  const[storeInfo,setStoreInfo]=useState(null);
  const[selectedStoreProduct,setSelectedStoreProduct]=useState(null);
  const[error,setError]=useState(null);
  const[toast,setToast]=useState(null);
  const[selected,setSelected]=useState({});
  const[preview,setPreview]=useState(null);
  const[launching,setLaunching]=useState({});
  const[launched,setLaunched]=useState({});
  const[camps,setCamps]=useState(null);
  const[loadingCamps,setLoadingCamps]=useState(false);
  const[campError,setCampError]=useState(null);
  const[toggling,setToggling]=useState({});
  const[deepScan,setDeepScan]=useState(null);
  const[deepScanning,setDeepScanning]=useState(false);
  const[deepProgress,setDeepProgress]=useState(null);
  const[deepSearchQuery,setDeepSearchQuery]=useState("");
  const[deepMaxPages,setDeepMaxPages]=useState(50);
  const[connectedCreators,setConnectedCreators]=useState([]);
  const deepAbort=useRef(null);
  const fire=useCallback(m=>{setToast(m);setTimeout(()=>setToast(null),4000)},[]);

  const fetchCamps=useCallback(async()=>{
    const loadDemo=async()=>{try{const r=await fetch("/api/campaigns/demo");const d=await r.json();setCamps(d.campaigns||[]);return true}catch(_){return false}};
    if(!metaToken){await loadDemo();return}
    setLoadingCamps(true);setCampError(null);
    try{
      const r=await fetch("/api/campaigns?metaToken="+encodeURIComponent(metaToken)+"&adAccount="+encodeURIComponent(KEYS.adAccount||""));
      const d=await r.json();
      if(d.error)throw new Error(d.error);
      setCamps(d.campaigns||[]);
    }catch(e){setCampError(e.message);await loadDemo()}
    setLoadingCamps(false);
  },[metaToken]);

  const toggleCamp=async(campId,currentStatus)=>{
    const newStatus=currentStatus==="ACTIVE"?"PAUSED":"ACTIVE";
    setToggling(t=>({...t,[campId]:true}));
    try{
      const r=await fetch("/api/campaigns/toggle",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({metaToken,campaignId:campId,newStatus})});
      const d=await r.json();
      if(d.success){setCamps(c=>c.map(x=>x.id===campId?{...x,status:newStatus}:x));fire(newStatus==="ACTIVE"?"▶ Campaign activated":"⏸ Campaign paused")}
      else fire("Error: "+(d.error||"Unknown"));
    }catch(e){fire(e.message)}
    setToggling(t=>({...t,[campId]:false}));
  };

  useEffect(()=>{fetch("/api/status").then(r=>r.json()).then(d=>{if(d.hasScan){setScan(d);setTab("results")}}).catch(()=>{})},[]);
  useEffect(()=>{fetch("/api/creators").then(r=>r.json()).then(d=>setConnectedCreators(Array.isArray(d)?d:[])).catch(()=>{})},[]);

  useEffect(()=>{
    if(tab!=="campaigns")return;
    const ensureDemo=async()=>{
      try{
        const r=await fetch("/api/campaigns/demo");
        const d=await r.json();
        const demo=d.campaigns||[];
        if(demo.length===0)return;
        setCamps(c=>{
          if(!c||c.length===0)return demo;
          if(c.some(x=>x.isDemo))return c;
          return [...demo,...c.filter(x=>!x.isDemo)];
        });
      }catch(_){}
    };
    if(!camps||camps.length===0){ensureDemo();return}
    if(!camps.some(c=>c.isDemo))ensureDemo();
  },[tab,camps]);

  const isStoreUrl=(url)=>/tiktok\.com\/shop\/store\//i.test(url)||/tiktok\.com\/shop\/[^/]+\/\d+/i.test(url)&&!/pdp/i.test(url);

  const fetchStore=async()=>{
    setLoadingStore(true);setStoreProducts(null);setStoreInfo(null);
    try{
      const r=await fetch("/api/store",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scrapeKey:KEYS.scrape,storeUrl:productUrl})});
      const d=await r.json();
      if(d.error)throw new Error(d.error);
      setStoreInfo(d.shop);setStoreProducts(d.products||[]);
    }catch(e){fire("Error: "+e.message)}
    setLoadingStore(false);
  };

  const selectProduct=(p)=>{
    setProductUrl(p.url||("https://www.tiktok.com/shop/product/"+p.id));
    setPrice(+p.price||39.99);
    setSelectedStoreProduct(p);
  };
  const backToStore=()=>{
    setSelectedStoreProduct(null);
    setProductUrl("");
  };

  const runScan=async()=>{
    setScanning(true);setError(null);
    try{const r=await fetch("/api/scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scrapeKey:KEYS.scrape,productUrl,commission,gmvFloor,productPrice:price})});const d=await r.json();if(d.error)throw new Error(d.error);setScan(d);setTab("results")}catch(e){setError(e.message)}
    setScanning(false);
  };

  const launchDeal=async(v)=>{
    if(!metaToken){fire("Add Meta token in Settings → then try again");return}
    if(!KEYS.adAccount){fire("Add Meta Ad Account ID in Settings");return}
    fire("Launching "+v.creator+" on Meta...");
    setLaunching(l=>({...l,[v.id]:true}));
    try{
      const r=await fetch("/api/launch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({videoId:v.id,metaToken,adAccount:KEYS.adAccount,pageId:KEYS.pageId,dailyBudget:50})});
      const d=await r.json();
      if(d.success){setLaunched(l=>({...l,[v.id]:d}));fire("Campaign created for "+v.creator+" (ID: "+d.ids.campaign+")")}
      else fire("Launch failed: "+(d.error||"Unknown error"))
    }catch(e){fire("Launch error: "+e.message)}
    setLaunching(l=>({...l,[v.id]:false}));
  };

  const dlVideo=async(v)=>{
    fire("Downloading "+v.creator+"...");
    try{
      const r=await fetch("/api/download",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({videoId:v.id,scrapeKey:KEYS.scrape})});
      if(!r.ok){const d=await r.json();fire(d.error||"Download failed");return}
      const blob=await r.blob();
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;
      a.download=(v.creator||"video").replace(/[^a-zA-Z0-9]/g,"_")+"_"+v.id+".mp4";
      document.body.appendChild(a);a.click();document.body.removeChild(a);
      URL.revokeObjectURL(url);
      fire("Downloaded "+v.creator+" MP4");
    }catch(e){fire("Error: "+e.message)}
  };

  const startDeepScan=()=>{
    const query=deepSearchQuery||(scan?.product?.title?.slice(0,50)||scan?.product?.seller)||"";
    if(!query){fire("Enter a search query or run a scan first");return}
    setDeepScanning(true);setDeepScan(null);setDeepProgress({page:0,totalFound:0,confirmed:0,credits:0});
    const pid=scan?.product?.id||"";
    const url="/api/deep-scan?scrapeKey="+encodeURIComponent(KEYS.scrape)+"&searchQuery="+encodeURIComponent(query)+"&productId="+encodeURIComponent(pid)+"&maxPages="+deepMaxPages+"&productPrice="+price;
    const es=new EventSource(url);
    deepAbort.current=es;
    es.onmessage=(e)=>{
      try{
        const d=JSON.parse(e.data);
        if(d.type==="progress")setDeepProgress(d);
        else if(d.type==="complete"){
          setDeepScan(d);setDeepScanning(false);setDeepProgress(null);
          const mergeVideos=[...(d.confirmed||[]),...(d.broader||[]).filter(v=>v.isAffiliate)].map(v=>({...v,source:"deep"}));
          setScan(prev=>{
            if(!prev)return prev;
            const ids=new Set([...(prev.qualified||[]),...(prev.filtered||[])].map(x=>x.id));
            const fresh=mergeVideos.filter(v=>!ids.has(v.id));
            const nq=fresh.filter(v=>v.est_gmv>=gmvFloor);
            const nf=fresh.filter(v=>v.est_gmv<gmvFloor);
            return{...prev,qualified:[...(prev.qualified||[]),...nq],filtered:[...(prev.filtered||[]),...nf],total:(prev.total||0)+fresh.length};
          });
          fire("Deep scan complete: "+mergeVideos.length+" videos merged ("+d.confirmedCount+" confirmed, "+(d.broader||[]).filter(v=>v.isAffiliate).length+" affiliate matches)");
          es.close();
        }else if(d.type==="error"){
          fire("Deep scan error: "+d.error);setDeepScanning(false);setDeepProgress(null);
          if(d.partial?.length){
            const confirmed=d.partial.filter(v=>v.matchesProduct);
            const broader=d.partial.filter(v=>!v.matchesProduct);
            setDeepScan({confirmed,broader,totalFound:d.partial.length,confirmedCount:confirmed.length,credits:d.credits});
            const mergeVideos=[...confirmed,...broader.filter(v=>v.isAffiliate)].map(v=>({...v,source:"deep"}));
            setScan(prev=>{
              if(!prev)return prev;
              const ids=new Set([...(prev.qualified||[]),...(prev.filtered||[])].map(x=>x.id));
              const fresh=mergeVideos.filter(v=>!ids.has(v.id));
              return{...prev,qualified:[...(prev.qualified||[]),...fresh.filter(v=>v.est_gmv>=gmvFloor)],filtered:[...(prev.filtered||[]),...fresh.filter(v=>v.est_gmv<gmvFloor)],total:(prev.total||0)+fresh.length};
            });
          }
          es.close();
        }
      }catch(_){}
    };
    es.onerror=()=>{setDeepScanning(false);setDeepProgress(null);es.close()};
  };
  const stopDeepScan=()=>{if(deepAbort.current){deepAbort.current.close();setDeepScanning(false);setDeepProgress(null);fire("Deep scan stopped")}};

  const allVideos=[...(scan?.qualified||[]),...(scan?.filtered||[])];
  const q=allVideos.filter(v=>v.est_gmv>=gmvFloor).sort((a,b)=>b.ai_score-a.ai_score);
  const bl=allVideos.filter(v=>v.est_gmv<gmvFloor);
  const toggleSel=id=>setSelected(s=>({...s,[id]:!s[id]}));

  const Sidebar=()=><div style={{width:200,background:C.bg2,borderRight:"1px solid "+C.border,padding:"16px 0",flexShrink:0,display:"flex",flexDirection:"column",minHeight:"100vh"}}>
    <div style={{padding:"0 16px 20px",cursor:"pointer"}} onClick={()=>nav("#/")}><span style={{fontSize:17,fontWeight:900,...gT(C.coral,C.gold)}}>Creator</span><span style={{fontSize:17,fontWeight:900,...gT(C.blue,C.teal)}}>ship</span><div style={{fontSize:10,color:C.dim,marginTop:1}}>Brand Dashboard</div></div>
    {[{id:"scan",l:"Scan Product",i:"📡"},{id:"results",l:"Creators",i:"🧠"},{id:"campaigns",l:"Campaigns",i:"🚀"},{id:"settings",l:"Settings",i:"⚙"}].map(t=><div key={t.id} onClick={()=>setTab(t.id)} style={{padding:"9px 16px",cursor:"pointer",fontSize:13,fontWeight:tab===t.id?600:400,color:tab===t.id?C.teal:C.sub,background:tab===t.id?C.teal+"06":"transparent",borderRight:tab===t.id?"2px solid "+C.teal:"2px solid transparent"}}>{t.i} {t.l}</div>)}
    <div style={{flex:1}}/><div style={{padding:"10px 16px",borderTop:"1px solid "+C.border,fontSize:11,color:C.dim,cursor:"pointer"}} onClick={()=>nav("#/creator")}>Creator Portal →</div>
  </div>;

  return <div style={{display:"flex"}}>
    <Sidebar/>
    <div style={{flex:1,padding:"28px 36px",maxWidth:860,overflow:"auto"}}>

    {tab==="scan"&&(()=>{
      const csFee=4;
      const sugComm=price>=100?"5–10":price>=50?"8–12":price>=20?"10–15":"15–20";
      const estOrders=gmvFloor>0&&price>0?Math.ceil(gmvFloor/price):0;
      const commDollar=(price*(commission/100)).toFixed(2);
      const csFeeDollar=(price*(csFee/100)).toFixed(2);
      const totalFees=price*(commission/100)+price*(csFee/100);
      const netPerUnit=Math.max(price-totalFees,0).toFixed(2);
      const netMarginPct=price>0?((netPerUnit/price)*100).toFixed(0):"0";

      const Inp=({label,value,onChange,prefix,suffix,hint,color,width})=>(
        <div style={{flex:width||1}}>
          <label style={{fontSize:11,fontWeight:600,color:C.sub,display:"block",marginBottom:6}}>{label}</label>
          <div style={{position:"relative"}}>
            {prefix&&<span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:13,color:C.dim,fontWeight:600,pointerEvents:"none"}}>{prefix}</span>}
            <input value={value} onChange={onChange} type="number" style={{width:"100%",padding:"10px 12px",paddingLeft:prefix?"28px":"12px",paddingRight:suffix?"36px":"12px",background:"rgba(255,255,255,.03)",border:"1px solid "+C.border,borderRadius:8,color:C.text,fontSize:15,fontFamily:"'JetBrains Mono'",fontWeight:600,outline:"none",textAlign:"left"}} onFocus={e=>e.target.style.borderColor=color||C.teal} onBlur={e=>e.target.style.borderColor=C.border}/>
            {suffix&&<span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",fontSize:13,color:C.dim,fontWeight:600,pointerEvents:"none"}}>{suffix}</span>}
          </div>
          {hint&&<div style={{fontSize:10,color:C.dim,marginTop:4}}>{hint}</div>}
        </div>
      );

      return <div>
      <div className="fu" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div>
          <h1 style={{fontSize:24,fontWeight:800,letterSpacing:"-.02em",marginBottom:4}}>Find Winning Creator Content</h1>
          <p style={{fontSize:13,color:"#8a92a8"}}>Scan any TikTok Shop product to discover creators already driving sales — then launch their videos as Meta ads in 90 seconds.</p>
        </div>
        {scan&&<button onClick={()=>setTab("results")} style={{padding:"8px 16px",background:C.teal+"10",border:"1px solid "+C.teal+"20",borderRadius:8,color:C.teal,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0,marginLeft:16}}>View Results ({scan.qualified?.length||0}) →</button>}
      </div>

      {/* Step 1: Product URL */}
      <div className="gl fu d1" style={{padding:0,overflow:"hidden",marginBottom:16}}>
        <div style={{padding:"14px 20px",borderBottom:"1px solid "+C.border,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:22,height:22,borderRadius:6,background:C.teal+"12",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:C.teal}}>1</div>
            <span style={{fontSize:13,fontWeight:700,color:C.text}}>TikTok Shop Product</span>
          </div>
          <div style={{fontSize:10,color:C.dim}}>Paste a product URL or a store URL to browse all products</div>
        </div>
        <div style={{padding:"16px 20px"}}>
          <div style={{display:"flex",gap:8}}>
            <input value={productUrl} onChange={e=>{setProductUrl(e.target.value);setStoreProducts(null);setStoreInfo(null);setSelectedStoreProduct(null)}} placeholder="https://www.tiktok.com/shop/store/brand-name/... or /pdp/..." style={{flex:1,padding:"11px 14px",background:"rgba(255,255,255,.03)",border:"1px solid "+C.border,borderRadius:8,color:C.text,fontSize:13,fontFamily:"'JetBrains Mono'",outline:"none"}} onFocus={e=>e.target.style.borderColor=C.teal} onBlur={e=>e.target.style.borderColor=C.border}/>
            {isStoreUrl(productUrl)&&!storeProducts&&<button onClick={fetchStore} disabled={loadingStore} style={{padding:"0 16px",background:C.teal,border:"none",borderRadius:8,color:C.bg,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0,opacity:loadingStore?.5:1}}>{loadingStore?"Loading...":"Browse Products"}</button>}
            {productUrl&&<button onClick={()=>{setProductUrl("");setStoreProducts(null);setStoreInfo(null);setSelectedStoreProduct(null)}} style={{padding:"0 12px",background:"rgba(255,255,255,.03)",border:"1px solid "+C.border,borderRadius:8,color:C.dim,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Clear</button>}
          </div>

          {/* Store product picker — show list when no product selected */}
          {storeProducts&&!selectedStoreProduct&&<div style={{marginTop:14}}>
            {storeInfo&&<div style={{padding:"14px 16px",background:"rgba(255,255,255,.02)",borderRadius:10,border:"1px solid "+C.border,marginBottom:14,display:"flex",alignItems:"center",gap:14}}>
              {storeInfo.logo?<img src={storeInfo.logo} alt="" style={{width:44,height:44,borderRadius:10,objectFit:"cover",flexShrink:0,border:"1px solid "+C.border}}/>:
              <div style={{width:44,height:44,borderRadius:10,background:C.teal+"10",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>🏪</div>}
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:700}}>{storeInfo.name}</div>
                <div style={{display:"flex",gap:10,alignItems:"center",marginTop:4,flexWrap:"wrap"}}>
                  <span style={{fontSize:11,color:C.sub,fontWeight:600}}>{storeInfo.productCount} products</span>
                  <span style={{fontSize:11,color:C.dim}}>·</span>
                  <span style={{fontSize:11,color:C.teal,fontWeight:700}}>{storeInfo.formatSold||fN(storeInfo.soldCount)} sold</span>
                  <span style={{fontSize:11,color:C.dim}}>·</span>
                  <span style={{fontSize:11,color:C.sub}}>★ {storeInfo.rating}</span>
                  <span style={{fontSize:11,color:C.dim}}>({fN(storeInfo.reviewCount)} reviews)</span>
                  {storeInfo.formatFollowers&&<><span style={{fontSize:11,color:C.dim}}>·</span><span style={{fontSize:11,color:C.sub}}>{storeInfo.formatFollowers} followers</span></>}
                  {storeInfo.videoCount&&+storeInfo.videoCount>0&&<><span style={{fontSize:11,color:C.dim}}>·</span><span style={{fontSize:11,color:C.sub}}>▶ {fN(+storeInfo.videoCount)} videos</span></>}
                </div>
              </div>
            </div>}
            <div style={{fontSize:12,fontWeight:700,color:C.sub,marginBottom:8}}>Select a product to scan ({storeProducts.length} available)</div>
            <div style={{maxHeight:440,overflow:"auto",borderRadius:10,border:"1px solid "+C.border}}>
              {storeProducts.map((p,i)=>{
                const soldNum=typeof p.sold==="number"?p.sold:parseInt(p.sold)||0;
                const soldStr=soldNum>=1000000?(soldNum/1000000).toFixed(1)+"M":soldNum>=1000?(soldNum/1000).toFixed(1)+"K":soldNum.toString();
                return <div key={p.id||i} onClick={()=>selectProduct(p)} style={{padding:"14px 16px",display:"flex",gap:14,cursor:"pointer",borderBottom:i<storeProducts.length-1?"1px solid "+C.border:"none",background:"transparent",transition:"background .1s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.03)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  {p.image?<img src={p.image} alt="" style={{width:56,height:56,borderRadius:10,objectFit:"cover",flexShrink:0,border:"1px solid "+C.border}}/>:
                  <div style={{width:56,height:56,borderRadius:10,background:C.teal+"08",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>📦</div>}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:600,lineHeight:1.3,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{p.title}</div>
                    <div style={{display:"flex",gap:12,alignItems:"center",marginTop:6,flexWrap:"wrap"}}>
                      <span className="mono" style={{fontSize:15,color:C.green,fontWeight:700}}>{p.currency}{p.price}</span>
                      {p.originalPrice&&+p.originalPrice>+p.price&&<span className="mono" style={{fontSize:12,textDecoration:"line-through",color:C.dim}}>{p.currency}{p.originalPrice}</span>}
                      {p.discount&&<span style={{fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:4,background:C.coral+"12",color:C.coral}}>{p.discount} OFF</span>}
                    </div>
                    <div style={{display:"flex",gap:10,alignItems:"center",marginTop:6,flexWrap:"wrap"}}>
                      {soldNum>0&&<span style={{fontSize:11,color:C.sub,display:"flex",alignItems:"center",gap:3}}>
                        <span style={{fontWeight:700,color:C.teal}}>{soldStr}</span> sold
                      </span>}
                      {p.rating>0&&<span style={{fontSize:11,color:C.sub}}>★ {p.rating} <span style={{color:C.dim}}>({fN(+p.reviews)} reviews)</span></span>}
                      {p.videos>0&&<span style={{fontSize:11,color:C.sub,display:"flex",alignItems:"center",gap:3}}>▶ <span style={{fontWeight:700,color:"#a78bfa"}}>{p.videos}</span> videos</span>}
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",justifyContent:"center",flexShrink:0,gap:4}}>
                    <div style={{fontSize:12,fontWeight:700,color:C.teal}}>Select →</div>
                    {soldNum>0&&<div style={{fontSize:10,color:C.dim}}>{p.currency}{(soldNum*+p.price).toLocaleString("en",{maximumFractionDigits:0})} GMV</div>}
                  </div>
                </div>;
              })}
              {storeProducts.length===0&&<div style={{padding:"24px 14px",textAlign:"center",color:C.dim,fontSize:13}}>No products found for this store.</div>}
            </div>
          </div>}

          {/* Selected product card with back button */}
          {selectedStoreProduct&&<div style={{marginTop:14}}>
            <button onClick={backToStore} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",color:C.teal,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:"0 0 10px 0"}}>← Back to all products{storeInfo?` (${storeInfo.name})`:""}
            </button>
            <div style={{padding:"14px 16px",background:"rgba(255,255,255,.02)",borderRadius:10,border:"1px solid "+C.teal+"40",display:"flex",gap:14,alignItems:"center"}}>
              {selectedStoreProduct.image?<img src={selectedStoreProduct.image} alt="" style={{width:56,height:56,borderRadius:10,objectFit:"cover",flexShrink:0,border:"1px solid "+C.border}}/>:
              <div style={{width:56,height:56,borderRadius:10,background:C.teal+"08",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>📦</div>}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:700,lineHeight:1.3,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{selectedStoreProduct.title}</div>
                <div style={{display:"flex",gap:10,alignItems:"center",marginTop:5,flexWrap:"wrap"}}>
                  <span className="mono" style={{fontSize:15,color:C.green,fontWeight:700}}>{selectedStoreProduct.currency}{selectedStoreProduct.price}</span>
                  {(()=>{const s=typeof selectedStoreProduct.sold==="number"?selectedStoreProduct.sold:parseInt(selectedStoreProduct.sold)||0;return s>0?<span style={{fontSize:11,color:C.sub}}><span style={{fontWeight:700,color:C.teal}}>{fN(s)}</span> sold</span>:null})()}
                  {selectedStoreProduct.rating>0&&<span style={{fontSize:11,color:C.sub}}>★ {selectedStoreProduct.rating} <span style={{color:C.dim}}>({fN(+selectedStoreProduct.reviews)} reviews)</span></span>}
                  {selectedStoreProduct.videos>0&&<span style={{fontSize:11,color:C.sub}}>▶ <span style={{fontWeight:700,color:"#a78bfa"}}>{selectedStoreProduct.videos}</span> videos</span>}
                </div>
              </div>
              <span style={{fontSize:10,fontWeight:700,padding:"4px 12px",borderRadius:6,background:C.teal+"14",color:C.teal,flexShrink:0}}>SELECTED</span>
            </div>
          </div>}

          {/* Rich product info from scan */}
          {!storeProducts&&!selectedStoreProduct&&scan?.product&&(()=>{const p=scan.product;return <div style={{marginTop:14}}>
            <div style={{padding:"16px 18px",background:"rgba(255,255,255,.02)",borderRadius:10,border:"1px solid "+C.border}}>
              <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
                {p.images?.[0]?<img src={p.images[0]} alt="" style={{width:64,height:64,borderRadius:10,objectFit:"cover",flexShrink:0,border:"1px solid "+C.border}}/>:
                <div style={{width:64,height:64,borderRadius:10,background:C.teal+"08",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>📦</div>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700,lineHeight:1.3}}>{p.title}</div>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginTop:6,flexWrap:"wrap"}}>
                    <span className="mono" style={{fontSize:14,color:C.green,fontWeight:700}}>{p.priceRange||p.price}</span>
                    {p.category&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:"rgba(255,255,255,.04)",color:C.sub}}>{p.category}</span>}
                  </div>
                  <div style={{display:"flex",gap:10,alignItems:"center",marginTop:6,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,color:C.sub}}><span style={{fontWeight:700,color:C.teal}}>{fN(p.totalSold)}</span> sold</span>
                    {p.reviewCount>0&&<span style={{fontSize:11,color:C.sub}}>★ {p.reviewRating} <span style={{color:C.dim}}>({p.reviewCountStr} reviews)</span></span>}
                    {p.totalStock>0&&<span style={{fontSize:11,color:C.sub}}>{fN(p.totalStock)} in stock</span>}
                    {p.shipping?.free&&<span style={{fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:4,background:"#007B7B18",color:"#00B8B9"}}>Free shipping</span>}
                  </div>
                </div>
                <span style={{fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:6,background:C.green+"12",color:C.green,flexShrink:0}}>SCANNED</span>
              </div>

              {/* Seller row */}
              <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid "+C.border,display:"flex",alignItems:"center",gap:10}}>
                {p.sellerAvatar?<img src={p.sellerAvatar} alt="" style={{width:28,height:28,borderRadius:7,objectFit:"cover",border:"1px solid "+C.border}}/>:
                <div style={{width:28,height:28,borderRadius:7,background:C.teal+"08",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>🏪</div>}
                <div style={{flex:1,minWidth:0}}>
                  <span style={{fontSize:12,fontWeight:600}}>{p.seller}</span>
                  {p.sellerLocation&&<span style={{fontSize:10,color:C.dim,marginLeft:6}}>{p.sellerLocation}</span>}
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {p.sellerRating>0&&<span style={{fontSize:10,color:C.sub,fontWeight:600}}>★ {p.sellerRating}</span>}
                  {p.followersStr!=='0'&&<span style={{fontSize:10,color:C.dim}}>{p.followersStr} followers</span>}
                  {p.sellerPerformance>0&&<span style={{fontSize:10,padding:"2px 6px",borderRadius:4,background:p.sellerPerformance>=70?C.green+"12":C.coral+"12",color:p.sellerPerformance>=70?C.green:C.coral,fontWeight:700}}>Top {100-p.sellerPerformance}%</span>}
                </div>
              </div>

              {/* Seller metrics */}
              {p.sellerMetrics?.length>0&&<div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                {p.sellerMetrics.map((m,i)=><span key={i} style={{fontSize:10,padding:"3px 8px",borderRadius:5,background:"rgba(255,255,255,.03)",border:"1px solid "+C.border,color:C.sub}}>{m.value}% {m.desc}</span>)}
                {p.responseRate>0&&<span style={{fontSize:10,padding:"3px 8px",borderRadius:5,background:"rgba(255,255,255,.03)",border:"1px solid "+C.border,color:C.sub}}>{p.responseRate}% chat response</span>}
              </div>}

              {/* SKU variants */}
              {p.skus?.length>1&&<div style={{marginTop:10,paddingTop:10,borderTop:"1px solid "+C.border}}>
                <div style={{fontSize:10,fontWeight:700,color:C.dim,letterSpacing:".04em",marginBottom:5}}>SKU INVENTORY</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {p.skus.map(s=><span key={s.id} style={{fontSize:10,padding:"3px 8px",borderRadius:5,background:"rgba(255,255,255,.03)",border:"1px solid "+C.border,color:C.sub}}>{s.name} — {p.currency}{s.price} <span style={{color:C.dim}}>({fN(s.stock)})</span></span>)}
                </div>
              </div>}
            </div>
          </div>})()}
        </div>
      </div>

      {/* Step 2: Affiliate Commission & Qualifying Threshold */}
      <div className="gl fu d2" style={{padding:0,overflow:"hidden",marginBottom:16}}>
        <div style={{padding:"14px 20px",borderBottom:"1px solid "+C.border,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:22,height:22,borderRadius:6,background:C.gold+"12",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:C.gold}}>2</div>
            <span style={{fontSize:13,fontWeight:700,color:C.text}}>Affiliate Deal Terms</span>
          </div>
          <div style={{fontSize:10,color:C.dim}}>Set the commission creators earn + minimum GMV to qualify</div>
        </div>
        <div style={{padding:"16px 20px"}}>
          <div style={{display:"flex",gap:16,marginBottom:18}}>
            <Inp label="Product Price" value={price} onChange={e=>setPrice(+e.target.value)} prefix="$" color={C.text} hint="Your TikTok Shop listing price"/>
            <Inp label="Creator Commission" value={commission} onChange={e=>setCommission(Math.min(Math.max(+e.target.value,1),80))} suffix="%" color={C.gold} hint={"Suggested: "+sugComm+"% for $"+price.toFixed(2)+" products"}/>
            <Inp label="Min. GMV to Qualify" value={gmvFloor} onChange={e=>setGmvFloor(+e.target.value)} prefix="$" color={C.teal} hint={estOrders>0?"≈ "+estOrders+" orders at $"+price.toFixed(2)+" each":"Set a threshold"}/>
          </div>

          {/* Real fee breakdown */}
          <div style={{padding:"16px 18px",background:"rgba(255,255,255,.015)",borderRadius:10,border:"1px solid "+C.border}}>
            <div style={{fontSize:11,fontWeight:700,color:C.sub,letterSpacing:".04em",marginBottom:12}}>Per-Sale Unit Economics</div>
            <div style={{display:"flex",flexDirection:"column",gap:0}}>
              {[
                {l:"Sale price",v:"+$"+price.toFixed(2),c:C.text,desc:"Customer pays"},
                {l:"Creator commission ("+commission+"%)",v:"−$"+commDollar,c:C.gold,desc:"Paid to affiliate creator per sale"},
                {l:"Creatorship fee ("+csFee+"%)",v:"−$"+csFeeDollar,c:C.teal,desc:"AI scanning + Meta ad infrastructure"},
              ].map((row,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:i<2?"1px solid rgba(255,255,255,.04)":"none"}}>
                  <div>
                    <span style={{fontSize:13,color:i===0?C.text:C.sub}}>{row.l}</span>
                    <span style={{fontSize:10,color:C.dim,marginLeft:8}}>{row.desc}</span>
                  </div>
                  <span className="mono" style={{fontSize:14,fontWeight:700,color:row.c}}>{row.v}</span>
                </div>
              ))}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0 4px",borderTop:"2px solid "+C.green+"20",marginTop:4}}>
                <div>
                  <span style={{fontSize:14,fontWeight:700,color:C.green}}>Your net revenue per sale</span>
                  <span style={{fontSize:11,color:C.dim,marginLeft:8}}>{netMarginPct}% margin</span>
                </div>
                <span className="mono" style={{fontSize:18,fontWeight:800,color:C.green}}>$${netPerUnit}</span>
              </div>
            </div>
          </div>

          {+netPerUnit<0&&<div style={{marginTop:10,padding:"10px 14px",background:C.coral+"08",border:"1px solid "+C.coral+"18",borderRadius:8,fontSize:12,color:C.coral}}>⚠ Negative margin — lower your commission or raise your price.</div>}
        </div>
      </div>

      {/* Step 3: Scan */}
      <div className="gl fu d3" style={{padding:0,overflow:"hidden"}}>
        <div style={{padding:"14px 20px",borderBottom:"1px solid "+C.border,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:22,height:22,borderRadius:6,background:C.green+"12",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:C.green}}>3</div>
            <span style={{fontSize:13,fontWeight:700,color:C.text}}>Scan & Discover Creators</span>
          </div>
        </div>
        <div style={{padding:"16px 20px"}}>
          <div style={{fontSize:13,color:"#8a92a8",lineHeight:1.6,marginBottom:14}}>
            AI scans every affiliate video for this product on TikTok Shop. Creators are ranked by views, engagement, estimated GMV, and predicted Meta ad performance. Only creators above your <span className="mono" style={{color:C.teal,fontWeight:700}}>{$(gmvFloor)}</span> GMV threshold are shown as qualified.
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
            {[
              {l:"Threshold",v:$(gmvFloor)+" GMV",c:C.teal,desc:"Min. estimated GMV"},
              {l:"Commission",v:commission+"% / $"+commDollar,c:C.gold,desc:"Per "+price.toFixed(2)+" sale"},
              {l:"Net margin",v:netMarginPct+"% / $"+netPerUnit,c:C.green,desc:"After all fees"},
              {l:"Connected Creators",v:String(connectedCreators.length),c:C.blue,desc:"Creators who authorized Creatorship"},
            ].map((s,i)=>(
              <div key={i} style={{padding:"12px 14px",background:"rgba(255,255,255,.018)",borderRadius:8,border:"1px solid "+C.border}}>
                <div style={{fontSize:9,fontWeight:600,color:C.dim,letterSpacing:".05em",textTransform:"uppercase",marginBottom:4}}>{s.l}</div>
                <div className="mono" style={{fontSize:15,fontWeight:700,color:s.c}}>{s.v}</div>
                <div style={{fontSize:10,color:C.dim,marginTop:2}}>{s.desc}</div>
              </div>
            ))}
          </div>

          <button onClick={runScan} disabled={scanning||!productUrl} style={{width:"100%",padding:14,background:(!productUrl)?C.dim:C.teal,color:C.bg,fontSize:14,fontWeight:700,border:"none",borderRadius:8,cursor:(!productUrl)?"not-allowed":"pointer",fontFamily:"inherit",opacity:scanning?.5:1,letterSpacing:"-.01em",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            {scanning?<><span style={{display:"inline-block",width:14,height:14,border:"2px solid rgba(0,0,0,.2)",borderTopColor:C.bg,borderRadius:"50%",animation:"pulse 1s infinite"}}/>Scanning affiliate creators...</>:
            !productUrl?"Enter a TikTok Shop product URL above":"Scan Product for Creators →"}
          </button>
          {error&&<div style={{marginTop:12,padding:"10px 14px",background:C.coral+"08",border:"1px solid "+C.coral+"18",borderRadius:8,fontSize:12,color:C.coral,display:"flex",alignItems:"center",gap:8}}>
            {error}
            <button onClick={runScan} style={{marginLeft:"auto",padding:"4px 12px",background:C.coral+"15",border:"1px solid "+C.coral+"25",borderRadius:6,color:C.coral,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>Retry</button>
          </div>}
        </div>
      </div>

      {/* What this scan does — educational */}
      <div style={{marginTop:16,padding:"14px 18px",borderRadius:10,border:"1px dashed rgba(255,255,255,.06)"}}>
        <div style={{fontSize:11,fontWeight:700,color:C.dim,letterSpacing:".04em",marginBottom:10}}>What the scan returns</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
          {[
            "Every creator who has posted a video featuring this product",
            "Views, likes, shares, engagement rate per video",
            "Estimated GMV each creator has driven",
            "AI performance score predicting Meta ad success",
            "Predicted ROAS range if run as a paid ad",
            "Direct video download + one-click Meta campaign launch",
          ].map((s,i)=>(
            <div key={i} style={{display:"flex",gap:6,alignItems:"flex-start"}}>
              <span style={{color:C.teal,fontSize:10,fontWeight:800,marginTop:1,flexShrink:0}}>✓</span>
              <span style={{fontSize:11,color:C.dim,lineHeight:1.4}}>{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>})()}

    {tab==="results"&&<div>
      {!scan?<div className="gl" style={{padding:36,textAlign:"center",color:C.dim}}>Run a scan first</div>:<>
        <div className="gl fu" style={{padding:18,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:10,fontWeight:700,letterSpacing:".1em",color:C.teal,textTransform:"uppercase",marginBottom:3}}>Product</div><div style={{fontSize:20,fontWeight:800}}>{scan.product?.title}</div><div className="mono" style={{fontSize:11,color:C.dim}}>{scan.product?.seller} · {scan.product?.price} · {scan.product?.sold} sold</div></div>
          <div style={{textAlign:"right"}}><div className="mono" style={{fontSize:28,fontWeight:800,color:C.green}}>{q.length}</div><div style={{fontSize:10,color:C.dim}}>qualified</div></div>
        </div>
        <div className="fu d1" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
          {[{n:q.length,l:"Qualified Videos",c:C.green},{n:$(q.reduce((s,v)=>s+v.est_gmv,0)),l:"Total Est. GMV",c:C.teal},{n:commission+"%",l:"Commission",c:C.gold},{n:q.length>0?(q.reduce((s,v)=>s+v.ai_score,0)/q.length).toFixed(0):"—",l:"Avg AI Score",c:C.blue}].map((s,i)=><div key={i} className="gl" style={{padding:"14px 16px"}}><div className="mono" style={{fontSize:24,fontWeight:700,color:s.c}}>{s.n}</div><div style={{fontSize:10,color:C.dim,marginTop:2}}>{s.l}</div></div>)}
        </div>

        {/* Deep Scan */}
        <div className="gl fu d2" style={{padding:16,marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:deepScanning||deepScan?12:0}}>
            <div>
              <div style={{fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>
                <span style={{...gT(C.purple,C.pink)}}>Deep Scan</span>
                <span style={{fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:4,background:C.purple+"12",color:C.purple}}>BETA</span>
              </div>
              <div style={{fontSize:11,color:C.dim,marginTop:2}}>Use product name (not just brand) to find linked videos · e.g. &quot;Intake Breathing Magnetic Nasal Strip&quot;</div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
              {!deepScanning&&<>
                <input value={deepSearchQuery||(scan?.product?.title?.slice(0,45)||scan?.product?.seller)||""} onChange={e=>setDeepSearchQuery(e.target.value)} placeholder="Product name (e.g. Magnetic Nasal Strip)" title="Use product-specific terms to find linked videos" style={{padding:"7px 12px",background:"rgba(255,255,255,.04)",border:"1px solid "+C.border,borderRadius:8,color:C.text,fontSize:12,fontFamily:"inherit",width:220,outline:"none"}}/>
                <select value={deepMaxPages} onChange={e=>setDeepMaxPages(+e.target.value)} style={{padding:"7px 8px",background:"rgba(255,255,255,.04)",border:"1px solid "+C.border,borderRadius:8,color:C.text,fontSize:11,fontFamily:"inherit",outline:"none",cursor:"pointer"}}>
                  <option value={10}>10 pages</option><option value={25}>25 pages</option><option value={50}>50 pages</option><option value={100}>100 pages</option><option value={200}>200 pages</option>
                </select>
                <button onClick={startDeepScan} style={{padding:"8px 20px",background:g(C.purple,C.pink),border:"none",borderRadius:8,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>Scan All Videos</button>
              </>}
              {deepScanning&&<button onClick={stopDeepScan} style={{padding:"8px 16px",background:C.coral+"15",border:"1px solid "+C.coral+"30",borderRadius:8,color:C.coral,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Stop</button>}
            </div>
          </div>

          {/* Progress */}
          {deepScanning&&deepProgress&&<div>
            <div style={{display:"flex",gap:16,alignItems:"center",marginBottom:8}}>
              <div style={{flex:1,height:6,borderRadius:3,background:"rgba(255,255,255,.06)",overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:3,background:g(C.purple,C.pink),width:Math.min((deepProgress.page/deepMaxPages)*100,100)+"%",transition:"width .3s"}}/>
              </div>
              <span className="mono" style={{fontSize:12,color:C.purple,fontWeight:700,flexShrink:0}}>Page {deepProgress.page}/{deepMaxPages}</span>
            </div>
            <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
              <span style={{fontSize:12,color:C.text}}><span className="mono" style={{fontWeight:700,color:C.green,fontSize:14}}>{deepProgress.confirmed}</span> <span style={{color:C.dim}}>confirmed product videos</span></span>
              <span style={{fontSize:12,color:C.text}}><span className="mono" style={{fontWeight:700,color:C.purple,fontSize:14}}>{deepProgress.totalFound}</span> <span style={{color:C.dim}}>total videos found</span></span>
              <span style={{fontSize:12,color:C.dim}}>{deepProgress.credits} credits used</span>
              <span style={{fontSize:11,color:C.dim,animation:"pulse 1s infinite"}}>Searching...</span>
            </div>
          </div>}

          {/* Results summary */}
          {deepScan&&!deepScanning&&<div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
              {[
                {n:deepScan.confirmedCount||0,l:"Confirmed Videos",c:C.green},
                {n:(deepScan.broader||[]).length,l:"Broader Matches",c:C.purple},
                {n:deepScan.totalFound||0,l:"Total Found",c:C.blue},
                {n:deepScan.credits||0,l:"Credits Used",c:C.gold},
              ].map((s,i)=><div key={i} style={{padding:"10px 12px",background:"rgba(255,255,255,.02)",borderRadius:8,border:"1px solid "+C.border}}>
                <div className="mono" style={{fontSize:20,fontWeight:700,color:s.c}}>{fN(s.n)}</div>
                <div style={{fontSize:9,color:C.dim,marginTop:2,textTransform:"uppercase",letterSpacing:".04em"}}>{s.l}</div>
              </div>)}
            </div>

            {/* Confirmed note — full cards are in the main list below */}
            {deepScan.confirmed?.length>0&&<div style={{padding:"10px 14px",background:C.green+"08",border:"1px solid "+C.green+"18",borderRadius:8,marginBottom:8}}>
              <span style={{fontSize:12,fontWeight:700,color:C.green}}>{deepScan.confirmed.length} confirmed product videos</span>
              <span style={{fontSize:11,color:C.sub,marginLeft:8}}>merged into results below with full Launch / Download controls</span>
            </div>}
            {deepScan.confirmedCount===0&&deepScan.totalFound>0&&<div style={{padding:"12px 14px",background:C.gold+"0a",border:"1px solid "+C.gold+"20",borderRadius:8,marginBottom:8}}>
              <span style={{fontSize:12,fontWeight:700,color:C.gold}}>0 confirmed</span>
              <span style={{fontSize:11,color:C.sub,marginLeft:8}}>— Try searching with the full product name (e.g. &quot;{scan?.product?.title?.slice(0,40)||"Intake Breathing Magnetic Nasal Strip"}...&quot;) to find videos that link to this product</span>
            </div>}

            {/* Broader matches */}
            {deepScan.broader?.length>0&&<div style={{marginTop:12}}>
              <div style={{fontSize:11,fontWeight:700,color:C.purple,letterSpacing:".04em",marginBottom:6}}>BROADER MATCHES — {deepScan.broader.length} videos from keyword search</div>
              <div style={{maxHeight:300,overflow:"auto",borderRadius:8,border:"1px solid "+C.border}}>
                {deepScan.broader.slice(0,200).map((v,i)=><div key={v.id||i} style={{padding:"8px 14px",borderBottom:"1px solid "+C.border,display:"flex",gap:10,alignItems:"center",opacity:.6,cursor:"pointer"}} onClick={()=>v.url&&window.open(v.url,"_blank")}>
                  {v.avatar&&<img src={v.avatar} alt="" style={{width:16,height:16,borderRadius:8,objectFit:"cover"}}/>}
                  <span style={{fontSize:12,fontWeight:600,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.creator}</span>
                  <span className="mono" style={{fontSize:10,color:C.blue}}>{fN(v.views)}</span>
                  <span className="mono" style={{fontSize:10,color:C.pink}}>{fN(v.likes)}</span>
                  <span className="mono" style={{fontSize:10,color:C.green}}>{$(v.est_gmv)}</span>
                  <span style={{fontSize:10,color:v.isAffiliate?C.purple:C.dim}}>{v.isAffiliate?"has shop link":"no link"}</span>
                </div>)}
                {deepScan.broader.length>200&&<div style={{padding:"10px 14px",textAlign:"center",fontSize:11,color:C.dim}}>+{deepScan.broader.length-200} more</div>}
              </div>
            </div>}
          </div>}
        </div>

        {q.length+bl.length>0&&<div className="fu d2" style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:20}}>
          <div style={{flex:1,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:11,color:C.dim,flexShrink:0}}>GMV Floor</span>
            <input type="range" min={0} max={500000} step={5000} value={gmvFloor} onChange={e=>setGmvFloor(+e.target.value)} style={{flex:1,accentColor:C.teal}}/>
            <span className="mono" style={{fontSize:14,fontWeight:700,color:C.teal,minWidth:60}}>{$(gmvFloor)}</span>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={()=>{const s={};q.forEach(v=>{s[v.id]=true});setSelected(s)}} style={{padding:"5px 12px",background:C.blue+"10",border:"1px solid "+C.blue+"18",borderRadius:6,color:C.text,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Select All</button>
            <span style={{fontSize:11,color:C.dim}}>{Object.values(selected).filter(Boolean).length} selected</span>
            {Object.values(selected).filter(Boolean).length>0&&metaToken&&<button onClick={()=>{Object.keys(selected).filter(k=>selected[k]).forEach((id,i)=>{const v=q.find(x=>x.id===id);if(v&&!launched[id])setTimeout(()=>launchDeal(v),i*5000)})}} style={{padding:"7px 18px",background:C.teal,color:C.bg,border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>🚀 Launch {Object.values(selected).filter(Boolean).length}</button>}
          </div>
        </div>}
        {q.length>0&&<div style={{fontSize:12,fontWeight:700,color:C.green,letterSpacing:".05em",marginBottom:10}}>QUALIFIED — {q.length} videos above ${$(gmvFloor)}</div>}
        {q.map((v,idx)=>{
          const s=v.ai_score,[rL,rH]=v.predicted_roas||[0,0],isLive=!!launched[v.id],isL=!!launching[v.id];
          return <div key={v.id} className="gl" style={{padding:0,overflow:"hidden",marginBottom:14,borderColor:isLive?C.green+"25":selected[v.id]?C.gold+"18":C.border}}>
            {/* Top section: thumbnail + info */}
            <div style={{padding:"18px 20px",display:"flex",gap:16}}>
              {/* Checkbox */}
              <div onClick={()=>!isLive&&toggleSel(v.id)} style={{width:20,height:20,borderRadius:6,border:"2px solid "+(isLive?C.green:selected[v.id]?C.gold:C.dim),background:isLive?C.green:selected[v.id]?C.gold:"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,marginTop:14}}>{(isLive||selected[v.id])&&<span style={{fontSize:11,color:C.bg,fontWeight:800}}>✓</span>}</div>

              {/* Thumbnail */}
              <div onClick={()=>setPreview(v)} style={{flexShrink:0,width:80,height:110,borderRadius:10,overflow:"hidden",background:C.purple+"08",border:"1px solid "+C.border,cursor:"pointer",position:"relative"}}>
                {v.cover?<img src={v.cover} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:
                <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,color:C.purple+"40"}}>▶</div>}
                <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.3)",display:"flex",alignItems:"center",justifyContent:"center",opacity:0,transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0}><span style={{fontSize:24,color:"#fff"}}>▶</span></div>
              </div>

              {/* Info */}
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    {v.avatar&&<img src={v.avatar} alt="" style={{width:32,height:32,borderRadius:16,objectFit:"cover",border:"1px solid "+C.border,flexShrink:0}}/>}
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:17,fontWeight:700}}>{v.creator}</span>
                        {v.connected&&<span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:6,background:C.green+"15",color:C.green,border:"1px solid "+C.green+"30",display:"inline-flex",alignItems:"center",gap:4}}>✓ Connected</span>}
                        {v.source==="deep"&&<span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,background:C.purple+"15",color:C.purple,letterSpacing:".03em"}}>DEEP SCAN</span>}
                        {v.matchesProduct&&v.source==="deep"&&<span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,background:C.green+"15",color:C.green,letterSpacing:".03em"}}>CONFIRMED</span>}
                        {v.isAffiliate&&<span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,background:"#a78bfa15",color:"#a78bfa",letterSpacing:".03em"}}>AFFILIATE</span>}
                      </div>
                      <div style={{fontSize:12,color:C.sub,marginTop:3}}>{fN(v.views)} views · {v.duration?Math.round(v.duration/1000)+"s":""} · {(v.engagement_rate||0).toFixed(1)}% eng.</div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    {isLive&&<span style={{fontSize:10,fontWeight:700,padding:"4px 12px",borderRadius:6,background:C.green+"15",color:C.green}}>● LIVE</span>}
                    {isL&&<span style={{fontSize:10,fontWeight:700,padding:"4px 12px",borderRadius:6,background:C.blue+"15",color:C.blue,animation:"pulse 1s infinite"}}>LAUNCHING</span>}
                    <div className="mono" style={{padding:"6px 12px",borderRadius:8,background:(s>=85?C.green:s>=70?C.gold:C.coral)+"0d",border:"1px solid "+(s>=85?C.green:s>=70?C.gold:C.coral)+"20"}}>
                      <span style={{fontSize:20,fontWeight:800,color:s>=85?C.green:s>=70?C.gold:C.coral}}>{s}</span>
                    </div>
                  </div>
                </div>

                {/* Metrics */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                  {[{n:$(v.est_gmv),l:"Est. GMV",c:C.green},{n:rL+"–"+rH+"×",l:"Pred. ROAS",c:C.gold},{n:fN(v.views),l:"Views",c:C.blue}].map((m,i)=>(
                    <div key={i} style={{textAlign:"center",padding:"10px 8px",background:"rgba(255,255,255,.02)",borderRadius:8,border:"1px solid rgba(255,255,255,.04)"}}>
                      <div className="mono" style={{fontSize:16,fontWeight:700,color:m.c}}>{m.n}</div>
                      <div style={{fontSize:9,color:C.sub,marginTop:3,textTransform:"uppercase",letterSpacing:".05em",fontWeight:500}}>{m.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Caption */}
            {v.caption&&<div style={{padding:"0 20px 14px"}}><div style={{fontSize:12,color:C.sub,lineHeight:1.5,padding:"8px 12px",background:"rgba(255,255,255,.015)",borderRadius:8}}>"{v.caption.slice(0,150)}{v.caption.length>150?"...":""}"</div></div>}

            {/* Meta IDs if launched */}
            {launched[v.id]&&<div style={{padding:"0 20px 14px"}}><div style={{fontSize:11,color:C.dim,padding:"8px 12px",background:C.green+"06",border:"1px solid "+C.green+"12",borderRadius:8}}><span style={{color:C.green,fontWeight:700}}>Meta:</span> Campaign {launched[v.id].ids?.campaign} · Ad {launched[v.id].ids?.ad||"manual"}</div></div>}

            {/* Launch CTA — the big deal */}
            {!isLive&&!isL&&metaToken&&<div style={{padding:"0 20px 14px"}}>
              <button onClick={()=>launchDeal(v)} style={{width:"100%",padding:"14px 0",background:"linear-gradient(135deg,"+C.teal+","+C.green+")",color:C.bg,fontSize:15,fontWeight:800,border:"none",borderRadius:10,cursor:"pointer",fontFamily:"inherit",letterSpacing:"-.01em",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>🚀 Launch as Meta Ad Campaign</button>
            </div>}
            {!isLive&&!isL&&!metaToken&&<div style={{padding:"0 20px 14px"}}><div style={{width:"100%",padding:"12px 0",background:"rgba(255,255,255,.02)",border:"1px dashed rgba(255,255,255,.08)",borderRadius:10,textAlign:"center",fontSize:13,color:C.dim}}>Add Meta token in Settings to launch campaigns</div></div>}

            {/* Secondary actions */}
            <div style={{padding:"12px 20px",borderTop:"1px solid "+C.border,background:"rgba(255,255,255,.01)",display:"flex",gap:8}}>
              <button onClick={()=>setPreview(v)} style={{padding:"8px 16px",background:"transparent",border:"1px solid "+C.border,borderRadius:8,color:C.sub,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>▶ Preview</button>
              <button onClick={()=>dlVideo(v)} style={{padding:"8px 16px",background:"transparent",border:"1px solid "+C.border,borderRadius:8,color:C.sub,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>⬇ MP4</button>
              {v.url&&<button onClick={()=>window.open(v.url,"_blank")} style={{padding:"8px 16px",background:"transparent",border:"1px solid "+C.border,borderRadius:8,color:C.sub,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>TikTok ↗</button>}
            </div>
          </div>;
        })}
        {bl.length>0&&<div style={{marginTop:20}}><div style={{fontSize:11,fontWeight:700,color:C.dim,letterSpacing:".05em",marginBottom:5}}>BELOW ${gmvFloor} — {bl.length}</div>{bl.map(v=><div key={v.id} className="gl" style={{padding:"8px 12px",marginBottom:3,opacity:.25,display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12,fontWeight:600}}>{v.creator}</span>{v.isAffiliate&&<span style={{fontSize:8,fontWeight:700,padding:"1px 5px",borderRadius:3,background:"#a78bfa15",color:"#a78bfa"}}>AFF</span>}<span className="mono" style={{marginLeft:"auto",fontSize:11,color:C.coral}}>{$(v.est_gmv)}</span></div>)}</div>}
      </>}
    </div>}

    {tab==="campaigns"&&(()=>{
      const pA=(actions,type)=>{if(!actions)return 0;const a=actions.find(x=>x.action_type===type);return a?+a.value:0};
      const pR=(roas)=>{if(!roas||!roas[0])return 0;return +roas[0].value||0};
      const pV=(arr,type)=>{if(!arr)return 0;const a=arr.find(x=>x.action_type===type);return a?+a.value:0};

      const totalSpend=camps?camps.reduce((s,c)=>s+(c.insights?+c.insights.spend:0),0):0;
      const totalReach=camps?camps.reduce((s,c)=>s+(c.insights?+c.insights.reach:0),0):0;
      const totalClicks=camps?camps.reduce((s,c)=>s+(c.insights?+c.insights.clicks:0),0):0;
      const totalPurchases=camps?camps.reduce((s,c)=>s+pA(c.insights?.actions,"purchase"),0):0;
      const totalCreatorPayout=camps?camps.reduce((s,c)=>s+(c.payouts?.creatorPayout||0),0):0;
      const totalCreatorshipFee=camps?camps.reduce((s,c)=>s+(c.payouts?.creatorshipFee||0),0):0;

      if(!camps&&!loadingCamps)fetchCamps();

      const updateBudget=async(adsetId,newBudget)=>{
        try{
          const r=await fetch("/api/campaigns/budget",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({metaToken,adsetId,dailyBudget:newBudget})});
          const d=await r.json();
          if(d.success)fire("Budget updated to $"+newBudget+"/day");else fire("Error: "+(d.error||"Unknown"));
        }catch(e){fire(e.message)}
      };

      const SparkBar=({data,maxH=40})=>{
        if(!data||data.length===0)return null;
        const vals=data.map(d=>+d.spend||0);
        const mx=Math.max(...vals,1);
        return <div style={{display:"flex",gap:1,alignItems:"flex-end",height:maxH}}>
          {vals.map((v,i)=><div key={i} style={{flex:1,height:Math.max((v/mx)*maxH,1),background:C.teal+"60",borderRadius:2,minWidth:2}} title={data[i].date_start+": $"+v.toFixed(2)}/>)}
        </div>;
      };

      return <div>
      <div className="fu" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
        <div>
          <h1 style={{fontSize:26,fontWeight:800,letterSpacing:"-.02em",marginBottom:6}}>Meta Campaigns</h1>
          <p style={{fontSize:14,color:C.sub}}>Full campaign analytics — manage everything from here.</p>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={fetchCamps} disabled={loadingCamps} style={{padding:"10px 20px",background:C.teal+"12",border:"1px solid "+C.teal+"25",borderRadius:10,color:C.teal,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:loadingCamps?.5:1}}>{loadingCamps?"Refreshing...":"↻ Refresh"}</button>
          <button onClick={()=>window.open("https://adsmanager.facebook.com/adsmanager/manage/campaigns?act="+KEYS.adAccount.replace("act_",""),"_blank")} style={{padding:"10px 20px",background:"transparent",border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Ads Manager ↗</button>
        </div>
      </div>

      {!metaToken&&!camps?<div className="gl" style={{padding:48,textAlign:"center"}}><div style={{fontSize:36,marginBottom:12}}>🔑</div><div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Meta token required</div><div style={{fontSize:14,color:C.sub,marginBottom:20}}>Add your access token in Settings to view campaigns, or view the payout demo.</div><button onClick={async()=>{try{const r=await fetch("/api/campaigns/demo");const d=await r.json();setCamps(d.campaigns||[])}catch(e){fire("Error: "+e.message)}}} style={{padding:"12px 24px",background:C.purple+"20",border:"1px solid "+C.purple+"40",borderRadius:10,color:C.purple,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>View payout demo (Sarah_breathebetter)</button></div>:
      campError?<div className="gl" style={{padding:36,textAlign:"center"}}><div style={{fontSize:14,color:C.coral,marginBottom:12}}>{campError}</div><button onClick={fetchCamps} style={{padding:"10px 24px",background:C.coral+"12",border:"1px solid "+C.coral+"25",borderRadius:10,color:C.coral,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Retry</button></div>:
      loadingCamps&&!camps?<div className="gl" style={{padding:48,textAlign:"center",color:C.sub,fontSize:14}}><span style={{display:"inline-block",width:16,height:16,border:"2px solid rgba(255,255,255,.1)",borderTopColor:C.teal,borderRadius:"50%",animation:"pulse 1s infinite",marginRight:10,verticalAlign:"middle"}}/>Loading campaigns from Meta...</div>:
      camps&&camps.length===0?<div className="gl" style={{padding:48,textAlign:"center"}}><div style={{fontSize:36,marginBottom:12}}>📡</div><div style={{fontSize:18,fontWeight:700,marginBottom:8}}>No Creatorship campaigns found</div><div style={{fontSize:14,color:C.sub,lineHeight:1.6}}>Launch a creator video from the Creators tab to create your first campaign.<br/>Only campaigns with "[Creatorship]" in the name appear here.</div></div>:
      camps?<div>
        {/* Summary stats */}
        <div className="fu d1" style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:12,marginBottom:20}}>
          {[
            {l:"Total Spend",v:"$"+totalSpend.toFixed(2),c:C.coral},
            {l:"People Reached",v:fN(totalReach),c:C.blue},
            {l:"Link Clicks",v:fN(totalClicks),c:C.teal},
            {l:"Purchases",v:totalPurchases.toString(),c:C.green},
            {l:"Creator Payouts",v:"$"+totalCreatorPayout.toFixed(2),c:C.gold,sub:"based on sales"},
            {l:"Creatorship (4%)",v:"$"+totalCreatorshipFee.toFixed(2),c:C.purple,sub:"platform fee"},
          ].map((s,i)=><div key={i} className="gl" style={{padding:"18px 20px"}}><div className="mono" style={{fontSize:24,fontWeight:800,color:s.c}}>{s.v}</div><div style={{fontSize:12,color:C.sub,marginTop:4,fontWeight:500}}>{s.l}</div>{s.sub&&<div style={{fontSize:10,color:C.dim,marginTop:2}}>{s.sub}</div>}</div>)}
        </div>

        <div style={{fontSize:12,fontWeight:700,color:C.sub,letterSpacing:".05em",marginBottom:12}}>{camps.length} CAMPAIGN{camps.length!==1?"S":""}</div>

        {camps.map(c=>{
          const ins=c.insights;
          const spend=ins?+ins.spend:0;
          const impr=ins?+ins.impressions:0;
          const reach=ins?+ins.reach:0;
          const freq=ins?+ins.frequency:0;
          const clicks=ins?+ins.clicks:0;
          const uClicks=ins?+(ins.unique_clicks||0):0;
          const ctr=ins?+ins.ctr:0;
          const cpc=ins?+ins.cpc:0;
          const cpm=ins?+ins.cpm:0;
          const purchases=pA(ins?.actions,"purchase");
          const addToCart=pA(ins?.actions,"add_to_cart");
          const viewContent=pA(ins?.actions,"view_content");
          const linkClicks=pA(ins?.actions,"link_click");
          const roas=pR(ins?.purchase_roas);
          const costPerPurch=purchases>0?(spend/purchases):0;
          const vidP25=pV(ins?.video_p25_watched_actions,"video_view");
          const vidP50=pV(ins?.video_p50_watched_actions,"video_view");
          const vidP75=pV(ins?.video_p75_watched_actions,"video_view");
          const vidP100=pV(ins?.video_p100_watched_actions,"video_view");
          const qRank=ins?.quality_ranking||"—";
          const eRank=ins?.engagement_rate_ranking||"—";
          const cRank=ins?.conversion_rate_ranking||"—";
          const isActive=c.status==="ACTIVE";
          const isPaused=c.status==="PAUSED";
          const creatorName=c.name.replace("[Creatorship] ","").replace("[CS] ","");
          const budgetVal=c.daily_budget?(+c.daily_budget/100):(c.adsets?.[0]?.daily_budget?+c.adsets[0].daily_budget/100:0);
          const adset=c.adsets&&c.adsets[0];
          const daysActive=c.created_time?Math.max(1,Math.floor((Date.now()-new Date(c.created_time).getTime())/86400000)):0;
          const tgt=adset?.targeting;
          const countries=tgt?.geo_locations?.countries||[];
          const ageMin=tgt?.age_min||18;
          const ageMax=tgt?.age_max||65;
          const optGoal=adset?.optimization_goal||"—";
          const bidStrat=adset?.bid_strategy||"LOWEST_COST";

          return <div key={c.id} className="gl" style={{padding:0,overflow:"hidden",marginBottom:16,borderColor:isActive?C.green+"25":C.border}}>
            {/* Header */}
            <div style={{padding:"20px 24px",borderBottom:"1px solid "+C.border}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:20,fontWeight:800,letterSpacing:"-.01em"}}>{creatorName}</span>
                    {c.isDemo&&<span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:4,background:C.purple+"20",color:C.purple,letterSpacing:".04em"}}>DEMO</span>}
                  </div>
                  <div style={{fontSize:12,color:C.sub,marginTop:4}}>
                    {!c.isDemo&&<><span className="mono" style={{color:C.dim}}>ID {c.id}</span><span style={{margin:"0 8px",color:C.border}}>·</span></>}
                    Created {new Date(c.created_time).toLocaleDateString()}
                    {daysActive>0&&<><span style={{margin:"0 8px",color:C.border}}>·</span><span>{daysActive} days active</span></>}
                    {budgetVal>0&&<><span style={{margin:"0 8px",color:C.border}}>·</span><span>${budgetVal}/day budget</span></>}
                    {(c.ads&&c.ads.length>0)?<><span style={{margin:"0 8px",color:C.border}}>·</span>{c.ads.length} ad{c.ads.length!==1?"s":""}</>:c.isDemo?<><span style={{margin:"0 8px",color:C.border}}>·</span>1 ad</>:null}
                  </div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  {!c.isDemo&&<button onClick={()=>toggleCamp(c.id,c.status)} disabled={!!toggling[c.id]} style={{padding:"8px 20px",background:isActive?"transparent":C.green,color:isActive?C.gold:C.bg,border:isActive?"1px solid "+C.gold+"30":"none",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:toggling[c.id]?.5:1}}>{toggling[c.id]?"...":(isActive?"⏸ Pause":"▶ Activate")}</button>}
                  <span style={{fontSize:12,fontWeight:700,padding:"6px 14px",borderRadius:8,background:(isActive?C.green:isPaused?C.gold:C.dim)+"15",color:isActive?C.green:isPaused?C.gold:C.dim}}>{isActive?"● ACTIVE":c.status}</span>
                </div>
              </div>
            </div>

            <div>
              {/* Primary KPIs */}
              <div style={{padding:"16px 24px",borderBottom:"1px solid "+C.border}}>
                <div style={{fontSize:10,fontWeight:700,color:C.dim,letterSpacing:".06em",marginBottom:10}}>PERFORMANCE</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                  {[
                    {l:"Spend",v:"$"+spend.toFixed(2),c:C.coral},
                    {l:"Reach",v:fN(reach),c:C.blue},
                    {l:"Frequency",v:freq.toFixed(2)+"×",c:C.blue},
                    {l:"Link Clicks",v:fN(clicks),c:C.teal},
                    {l:"CTR",v:ctr.toFixed(2)+"%",c:C.teal},
                    {l:"CPC",v:"$"+cpc.toFixed(2),c:C.gold},
                    {l:"CPM",v:"$"+cpm.toFixed(2),c:C.gold},
                    {l:"ROAS",v:roas>0?roas.toFixed(2)+"×":"—",c:roas>=2?C.green:roas>=1?C.gold:C.coral},
                  ].map((m,i)=>(
                    <div key={i} style={{textAlign:"center",padding:"12px 8px",background:"rgba(255,255,255,.02)",borderRadius:10,border:"1px solid rgba(255,255,255,.04)"}}>
                      <div className="mono" style={{fontSize:17,fontWeight:700,color:m.c}}>{m.v}</div>
                      <div style={{fontSize:9,color:C.sub,marginTop:4,textTransform:"uppercase",letterSpacing:".05em",fontWeight:500}}>{m.l}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Conversion funnel + Video retention */}
              <div style={{padding:"16px 24px",borderBottom:"1px solid "+C.border,display:"flex",gap:16}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.dim,letterSpacing:".06em",marginBottom:10}}>CONVERSION FUNNEL</div>
                  {[
                    {l:"Page Views",v:fN(viewContent),c:C.blue},
                    {l:"Add to Cart",v:fN(addToCart),c:C.gold},
                    {l:"Purchases",v:fN(purchases),c:C.green},
                    {l:"Cost per Purchase",v:costPerPurch>0?"$"+costPerPurch.toFixed(2):"—",c:costPerPurch>0&&costPerPurch<30?C.green:C.gold},
                  ].map((row,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:i<3?"1px solid rgba(255,255,255,.03)":"none"}}>
                      <span style={{fontSize:13,color:C.sub}}>{row.l}</span>
                      <span className="mono" style={{fontSize:14,fontWeight:700,color:row.c}}>{row.v}</span>
                    </div>
                  ))}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.dim,letterSpacing:".06em",marginBottom:10}}>VIDEO RETENTION</div>
                  {[
                    {l:"25% watched",v:fN(vidP25),pct:impr>0?((vidP25/impr)*100).toFixed(1)+"%":"—"},
                    {l:"50% watched",v:fN(vidP50),pct:impr>0?((vidP50/impr)*100).toFixed(1)+"%":"—"},
                    {l:"75% watched",v:fN(vidP75),pct:impr>0?((vidP75/impr)*100).toFixed(1)+"%":"—"},
                    {l:"100% watched",v:fN(vidP100),pct:impr>0?((vidP100/impr)*100).toFixed(1)+"%":"—"},
                  ].map((row,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:i<3?"1px solid rgba(255,255,255,.03)":"none"}}>
                      <span style={{fontSize:13,color:C.sub}}>{row.l}</span>
                      <div style={{display:"flex",gap:10,alignItems:"center"}}>
                        <span className="mono" style={{fontSize:12,color:C.dim}}>{row.v}</span>
                        <span className="mono" style={{fontSize:13,fontWeight:700,color:C.teal,minWidth:40,textAlign:"right"}}>{row.pct}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Commission breakdown: Creator + Creatorship 4% */}
              {c.payouts&&<div style={{padding:"20px 24px",borderBottom:"1px solid "+C.border,background:"linear-gradient(180deg,rgba(255,255,255,.02) 0%,rgba(255,255,255,.005) 100%)"}}>
                <div style={{fontSize:10,fontWeight:700,color:C.dim,letterSpacing:".06em",marginBottom:14}}>COMMISSIONS & PAYOUTS</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14}}>
                  <div style={{padding:"16px",background:C.green+"0a",borderRadius:10,border:"1px solid "+C.green+"20"}}>
                    <div className="mono" style={{fontSize:22,fontWeight:800,color:C.green}}>${(c.payouts.revenue||0).toFixed(2)}</div>
                    <div style={{fontSize:11,color:C.sub,marginTop:4}}>Revenue</div>
                    <div style={{fontSize:10,color:C.dim,marginTop:2}}>({c.payouts.purchases||0} sales × ${(c.payoutMeta?.productPrice||39.99).toFixed(2)})</div>
                  </div>
                  <div style={{padding:"16px",background:C.gold+"0a",borderRadius:10,border:"1px solid "+C.gold+"20"}}>
                    <div className="mono" style={{fontSize:22,fontWeight:800,color:C.gold}}>${(c.payouts.creatorPayout||0).toFixed(2)}</div>
                    <div style={{fontSize:11,color:C.sub,marginTop:4}}>Creator payout</div>
                    <div style={{fontSize:10,color:C.dim,marginTop:2}}>{(c.payoutMeta?.creatorCommission||10)}% · ${((c.payoutMeta?.productPrice||39.99)*(c.payoutMeta?.creatorCommission||10)/100).toFixed(2)}/sale</div>
                  </div>
                  <div style={{padding:"16px",background:C.purple+"0a",borderRadius:10,border:"1px solid "+C.purple+"20"}}>
                    <div className="mono" style={{fontSize:22,fontWeight:800,color:C.purple}}>${(c.payouts.creatorshipFee||0).toFixed(2)}</div>
                    <div style={{fontSize:11,color:C.sub,marginTop:4}}>Creatorship</div>
                    <div style={{fontSize:10,color:C.dim,marginTop:2}}>{(c.payouts.csFeePct||4)}% platform fee · ${((c.payoutMeta?.productPrice||39.99)*(c.payouts.csFeePct||4)/100).toFixed(2)}/sale</div>
                  </div>
                  <div style={{padding:"16px",background:"rgba(255,255,255,.03)",borderRadius:10,border:"1px solid "+C.border}}>
                    <div className="mono" style={{fontSize:22,fontWeight:800,color:C.text}}>${((c.payouts.revenue||0)-(c.payouts.creatorPayout||0)-(c.payouts.creatorshipFee||0)).toFixed(2)}</div>
                    <div style={{fontSize:11,color:C.sub,marginTop:4}}>Brand net</div>
                    <div style={{fontSize:10,color:C.dim,marginTop:2}}>~86% of revenue</div>
                  </div>
                </div>
                {/* Split bar */}
                <div style={{marginTop:16}}>
                  <div style={{display:"flex",height:8,borderRadius:4,overflow:"hidden",background:"rgba(255,255,255,.06)"}}>
                    <div style={{width:"10%",background:C.gold}} title="Creator 10%"/>
                    <div style={{width:"4%",background:C.purple}} title="Creatorship 4%"/>
                    <div style={{flex:1,background:C.green+"60"}} title="Brand 86%"/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontSize:10,color:C.dim}}>
                    <span>Creator {(c.payoutMeta?.creatorCommission||10)}%</span>
                    <span>Creatorship {(c.payouts.csFeePct||4)}%</span>
                    <span>Brand ~86%</span>
                  </div>
                </div>
                <div style={{marginTop:12,padding:"10px 14px",background:C.teal+"08",borderRadius:8,border:"1px solid "+C.teal+"15",fontSize:12,color:C.sub}}>
                  Payouts run weekly via Stripe — creators and Creatorship paid automatically when sales are tracked from Meta.
                </div>
              </div>}

              {/* Quality + Daily spend sparkline */}
              <div style={{padding:"16px 24px",borderBottom:"1px solid "+C.border,display:"flex",gap:16}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.dim,letterSpacing:".06em",marginBottom:10}}>META QUALITY SIGNALS</div>
                  {[
                    {l:"Quality Ranking",v:qRank},
                    {l:"Engagement Rate",v:eRank},
                    {l:"Conversion Rate",v:cRank},
                  ].map((row,i)=>{
                    const good=typeof row.v==="string"&&(row.v.includes("ABOVE")||row.v.includes("AVERAGE"));
                    const bad=typeof row.v==="string"&&row.v.includes("BELOW");
                    return <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:i<2?"1px solid rgba(255,255,255,.03)":"none"}}>
                      <span style={{fontSize:13,color:C.sub}}>{row.l}</span>
                      <span style={{fontSize:12,fontWeight:700,color:good?C.green:bad?C.coral:C.sub,textTransform:"capitalize"}}>{typeof row.v==="string"?row.v.replace(/_/g," ").toLowerCase():row.v}</span>
                    </div>;
                  })}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.dim,letterSpacing:".06em",marginBottom:10}}>DAILY SPEND (30 DAYS)</div>
                  {c.daily&&c.daily.length>0?<div>
                    <SparkBar data={c.daily}/>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
                      <span style={{fontSize:10,color:C.dim}}>{c.daily[0]?.date_start}</span>
                      <span style={{fontSize:10,color:C.dim}}>{c.daily[c.daily.length-1]?.date_start}</span>
                    </div>
                  </div>:<div style={{fontSize:12,color:C.dim,padding:"16px 0",textAlign:"center"}}>No daily data — activate to start tracking</div>}
                </div>
              </div>
            </div>

            {/* Settings: Budget + Targeting */}
            <div style={{padding:"16px 24px",borderTop:"1px solid "+C.border,background:"rgba(255,255,255,.012)"}}>
              <div style={{fontSize:10,fontWeight:700,color:C.dim,letterSpacing:".06em",marginBottom:10}}>CAMPAIGN SETTINGS</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
                <div>
                  <div style={{fontSize:11,color:C.sub,marginBottom:4}}>Daily Budget</div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <span className="mono" style={{fontSize:16,fontWeight:700,color:C.text}}>${budgetVal.toFixed(0)}</span>
                    <span style={{fontSize:11,color:C.dim}}>/day</span>
                    {adset&&adset.id&&!c.isDemo&&<>
                      <button onClick={()=>{const nb=budgetVal+10;updateBudget(adset.id,nb);setCamps(cs=>cs.map(x=>x.id===c.id?{...x,daily_budget:""+(nb*100)}:x))}} style={{width:22,height:22,borderRadius:5,background:"rgba(255,255,255,.04)",border:"1px solid "+C.border,color:C.sub,fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                      <button onClick={()=>{const nb=Math.max(budgetVal-10,5);updateBudget(adset.id,nb);setCamps(cs=>cs.map(x=>x.id===c.id?{...x,daily_budget:""+(nb*100)}:x))}} style={{width:22,height:22,borderRadius:5,background:"rgba(255,255,255,.04)",border:"1px solid "+C.border,color:C.sub,fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                    </>}
                  </div>
                </div>
                <div>
                  <div style={{fontSize:11,color:C.sub,marginBottom:4}}>Targeting</div>
                  <div style={{fontSize:13,fontWeight:600,color:C.text}}>{countries.join(", ")||"All"} · Ages {ageMin}–{ageMax}</div>
                </div>
                <div>
                  <div style={{fontSize:11,color:C.sub,marginBottom:4}}>Optimization</div>
                  <div style={{fontSize:13,fontWeight:600,color:C.text}}>{optGoal.replace(/_/g," ")}</div>
                  <div style={{fontSize:10,color:C.dim,marginTop:2}}>{bidStrat.replace(/_/g," ")}</div>
                </div>
              </div>
            </div>
          </div>;
        })}

      </div>:null}
    </div>})()}

    {tab==="settings"&&<div>
      <h1 className="fu" style={{fontSize:26,fontWeight:800,marginBottom:4}}>Settings</h1>
      <p className="fu d1" style={{fontSize:13,color:C.sub,marginBottom:20}}>Meta API credentials</p>
      <div className="gl fu d2" style={{padding:24}}>
        <label style={{fontSize:10,fontWeight:700,color:C.dim,letterSpacing:".06em",textTransform:"uppercase",display:"block",marginBottom:5}}>Meta Access Token</label>
        <input value={metaToken} onChange={e=>setMetaToken(e.target.value)} type="password" placeholder="From developers.facebook.com/tools/explorer" style={{width:"100%",padding:"10px 14px",background:"rgba(255,255,255,.025)",border:"1px solid "+C.border,borderRadius:8,color:C.text,fontSize:12,fontFamily:"'JetBrains Mono'",outline:"none",marginBottom:14}}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div><label style={{fontSize:10,fontWeight:700,color:C.dim,letterSpacing:".06em",textTransform:"uppercase",display:"block",marginBottom:4}}>Ad Account</label><div className="mono" style={{padding:"10px 14px",background:"rgba(255,255,255,.02)",border:"1px solid "+C.border,borderRadius:8,fontSize:12,color:C.teal}}>{KEYS.adAccount}</div></div>
          <div><label style={{fontSize:10,fontWeight:700,color:C.dim,letterSpacing:".06em",textTransform:"uppercase",display:"block",marginBottom:4}}>Page ID</label><div className="mono" style={{padding:"10px 14px",background:"rgba(255,255,255,.02)",border:"1px solid "+C.border,borderRadius:8,fontSize:12,color:C.teal}}>{KEYS.pageId}</div></div>
        </div>
        {metaToken?<div style={{marginTop:14,padding:10,background:C.green+"08",border:"1px solid "+C.green+"18",borderRadius:8,fontSize:12,color:C.green}}>✓ Token set</div>:<div style={{marginTop:14,padding:10,background:C.gold+"08",border:"1px solid "+C.gold+"18",borderRadius:8,fontSize:12,color:C.gold}}>⚠ Add token to launch ads</div>}
      </div>
    </div>}

    </div>

    {/* Video Preview Modal */}
    {preview&&<div onClick={()=>setPreview(null)} style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,.85)",backdropFilter:"blur(12px)",display:"flex",alignItems:"center",justifyContent:"center",animation:"fi .2s ease"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.bg2,border:"1px solid "+C.border,borderRadius:20,overflow:"hidden",width:420,maxHeight:"90vh",display:"flex",flexDirection:"column",animation:"fu .3s cubic-bezier(.16,1,.3,1)"}}>
        {/* Video player */}
        <div style={{position:"relative",background:"#000",aspectRatio:"9/16",maxHeight:"60vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
          {preview.content_url?
            <video src={preview.content_url} controls autoPlay playsInline style={{width:"100%",height:"100%",objectFit:"contain"}}/>:
            <div style={{textAlign:"center",padding:40}}>
              <div style={{fontSize:48,marginBottom:12,opacity:.3}}>▶</div>
              <div style={{fontSize:13,color:C.dim}}>No video URL available</div>
              <div style={{fontSize:11,color:C.dim,marginTop:4}}>Download from server first</div>
            </div>
          }
          <button onClick={()=>setPreview(null)} style={{position:"absolute",top:12,right:12,width:32,height:32,borderRadius:8,background:"rgba(0,0,0,.6)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,.1)",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>

        {/* Video info */}
        <div style={{padding:"16px 20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div>
              <div style={{fontSize:16,fontWeight:700}}>{preview.creator}</div>
              <div style={{fontSize:11,color:C.dim,marginTop:2}}>{fN(preview.views)} views · {preview.duration?Math.round(preview.duration/1000)+"s":""} · {preview.engagement_rate?.toFixed(1)}% engagement</div>
            </div>
            <div className="mono" style={{padding:"4px 10px",borderRadius:7,background:(preview.ai_score>=85?C.green:preview.ai_score>=70?C.gold:C.coral)+"0d",border:"1px solid "+(preview.ai_score>=85?C.green:preview.ai_score>=70?C.gold:C.coral)+"20"}}>
              <span style={{fontSize:18,fontWeight:800,color:preview.ai_score>=85?C.green:preview.ai_score>=70?C.gold:C.coral}}>{preview.ai_score}</span>
            </div>
          </div>

          {/* Metrics row */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
            {[{l:"Est. GMV",v:$(preview.est_gmv),c:C.green},{l:"Pred. ROAS",v:(preview.predicted_roas||[0,0]).join("–")+"×",c:C.gold},{l:"Views",v:fN(preview.views),c:C.blue}].map((m,i)=>(
              <div key={i} style={{textAlign:"center",padding:"8px 6px",background:"rgba(255,255,255,.015)",borderRadius:8}}>
                <div className="mono" style={{fontSize:14,fontWeight:700,color:m.c}}>{m.v}</div>
                <div style={{fontSize:8,color:C.dim,marginTop:2,textTransform:"uppercase",letterSpacing:".04em"}}>{m.l}</div>
              </div>
            ))}
          </div>

          {preview.caption&&<div style={{fontSize:11,color:C.sub,lineHeight:1.5,padding:"8px 10px",background:"rgba(255,255,255,.012)",borderRadius:6,marginBottom:12,maxHeight:60,overflow:"auto"}}>"{preview.caption.slice(0,200)}{preview.caption.length>200?"...":""}"</div>}

          {/* Actions */}
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{dlVideo(preview)}} style={{flex:1,padding:"10px 0",background:C.blue+"12",border:"1px solid "+C.blue+"25",borderRadius:8,color:C.text,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>⬇ Download MP4</button>
            {metaToken&&<button onClick={()=>{launchDeal(preview);setPreview(null)}} style={{flex:1,padding:"10px 0",background:C.teal,border:"none",borderRadius:8,color:C.bg,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>🚀 Launch on Meta</button>}
          </div>
          {preview.url&&<button onClick={()=>window.open(preview.url,"_blank")} style={{width:"100%",marginTop:8,padding:"8px 0",background:"transparent",border:"1px solid "+C.border,borderRadius:8,color:C.sub,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>View on TikTok ↗</button>}
        </div>
      </div>
    </div>}

    {toast&&<div style={{position:"fixed",bottom:20,right:20,padding:"11px 18px",borderRadius:11,fontSize:13,fontWeight:600,zIndex:999,animation:"fu .3s ease",background:"rgba(8,13,28,.95)",backdropFilter:"blur(20px)",border:"1px solid "+C.borderH}}>{toast}</div>}
  </div>;
}

/*══════════════════════════════════════════════════════
  CREATOR PORTAL
══════════════════════════════════════════════════════*/
function CreatorPortal({nav}){
  const[ttConnected,setTtConnected]=useState(false);
  const[ttUser,setTtUser]=useState({});
  const[tab,setTab]=useState("connect");
  const[toast,setToast]=useState(null);
  const[deals,setDeals]=useState(null);
  const[earnings,setEarnings]=useState(null);
  const[loadingDeals,setLoadingDeals]=useState(false);
  const[loadingEarnings,setLoadingEarnings]=useState(false);
  const fire=useCallback(m=>{setToast(m);setTimeout(()=>setToast(null),4000)},[]);

  const handleDisconnect=async()=>{
    try{
      const r=await fetch("/api/tiktok/disconnect",{method:"POST",headers:{"Content-Type":"application/json"}});
      if(!r.ok)throw new Error("Disconnect failed");
      setTtConnected(false);setTtUser({});fire("Disconnected");
    }catch(e){fire("Disconnect failed: "+(e.message||"try again"))}
  };

  useEffect(()=>{
    fetch("/api/tiktok/status").then(r=>r.json()).then(d=>{if(d.connected){setTtConnected(true);setTtUser(d);setTab("deals")}}).catch(()=>{});
    if(window.location.search?.includes("connected=true")){setTtConnected(true);setTab("deals");fire("TikTok connected!")}
  },[]);

  useEffect(()=>{
    if(!ttConnected||tab!=="deals")return;
    setLoadingDeals(true);
    fetch("/api/creator/deals").then(r=>r.json()).then(d=>{setDeals(d);setLoadingDeals(false)}).catch(()=>setLoadingDeals(false));
  },[ttConnected,tab]);

  useEffect(()=>{
    if(!ttConnected||tab!=="earnings")return;
    setLoadingEarnings(true);
    fetch("/api/creator/earnings").then(r=>r.json()).then(d=>{setEarnings(d);setLoadingEarnings(false)}).catch(()=>setLoadingEarnings(false));
  },[ttConnected,tab]);

  const Sidebar=()=><div style={{width:200,background:C.bg2,borderRight:"1px solid "+C.border,padding:"16px 0",flexShrink:0,display:"flex",flexDirection:"column",minHeight:"100vh"}}>
    <div style={{padding:"0 16px 20px",cursor:"pointer"}} onClick={()=>nav("#/")}><span style={{fontSize:17,fontWeight:900,...gT(C.coral,C.gold)}}>Creator</span><span style={{fontSize:17,fontWeight:900,...gT(C.blue,C.teal)}}>ship</span><div style={{fontSize:10,color:C.dim,marginTop:1}}>Creator Portal</div></div>
    {[{id:"connect",l:"Connect TikTok",i:"🔗"},{id:"deals",l:"Deals",i:"💰"},{id:"earnings",l:"Earnings",i:"📈"}].map(t=><div key={t.id} onClick={()=>setTab(t.id)} style={{padding:"9px 16px",cursor:"pointer",fontSize:13,fontWeight:tab===t.id?600:400,color:tab===t.id?C.teal:C.sub,background:tab===t.id?C.teal+"06":"transparent",borderRight:tab===t.id?"2px solid "+C.teal:"2px solid transparent"}}>{t.i} {t.l}</div>)}
    <div style={{flex:1}}/><div style={{padding:"10px 16px",borderTop:"1px solid "+C.border,fontSize:11,color:C.dim,cursor:"pointer"}} onClick={()=>nav("#/brand")}>Brand Dashboard →</div>
  </div>;

  return <div style={{display:"flex"}}>
    <Sidebar/>
    <div style={{flex:1,padding:"28px 36px",maxWidth:700}}>

    {tab==="connect"&&<div>
      {ttConnected?<div>
        <h1 className="fu" style={{fontSize:24,fontWeight:800,marginBottom:4}}>TikTok Connected</h1>
        <p className="fu d1" style={{fontSize:13,color:C.sub,marginBottom:20}}>Your account is linked. Brands can discover your content.</p>
        <div className="gl fu d2" style={{padding:24,borderColor:C.green+"22"}}>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <div style={{width:56,height:56,borderRadius:14,background:C.green+"12",border:"2px solid "+C.green+"30",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>✓</div>
            <div style={{flex:1}}>
              <div style={{fontSize:18,fontWeight:800,color:C.green}}>{ttUser.display_name||"Creator"}</div>
              <div style={{fontSize:13,color:C.sub,marginTop:2}}>{fN(ttUser.follower_count||0)} followers · {ttUser.video_count||0} videos</div>
            </div>
            <button onClick={handleDisconnect} style={{padding:"8px 16px",background:"transparent",border:"1px solid "+C.border,borderRadius:8,color:C.sub,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Disconnect</button>
          </div>
        </div>
        <div className="gl fu d3" style={{padding:20,marginTop:12}}>
          <div style={{fontSize:12,fontWeight:700,color:C.dim,letterSpacing:".04em",marginBottom:10}}>What happens next</div>
          {["Brands scanning TikTok Shop products will see your videos","If your content qualifies, you'll get a deal offer in the Deals tab","When a brand runs your video as a Meta ad, you earn commission on every sale","Payouts are deposited weekly — no invoicing needed"].map((s,i)=>(
            <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:8}}>
              <span style={{color:C.teal,fontSize:11,fontWeight:800,marginTop:1}}>✓</span>
              <span style={{fontSize:13,color:C.sub}}>{s}</span>
            </div>
          ))}
        </div>
      </div>:<div>
        <h1 className="fu" style={{fontSize:24,fontWeight:800,marginBottom:4}}>Get Paid for Content You Already Made</h1>
        <p className="fu d1" style={{fontSize:13,color:"#8a92a8",marginBottom:24}}>Connect your TikTok once. That's the only setup. Everything else is automatic.</p>

        {/* The sell */}
        <div className="gl fu d2" style={{padding:0,overflow:"hidden",marginBottom:16}}>
          <div style={{padding:"28px 28px 20px"}}>
            <div style={{fontSize:18,fontWeight:800,lineHeight:1.3,marginBottom:12}}>You made a video. It got views. It drove sales.<br/><span style={{color:C.coral}}>You should keep earning from it.</span></div>
            <p style={{fontSize:14,color:"#8a92a8",lineHeight:1.7,marginBottom:16}}>
              Right now, your best TikToks are driving sales for brands on TikTok Shop — and that's where the money stops. But those same videos could be running as Meta ads, reaching millions more people, and generating sales on Facebook and Instagram too.
            </p>
            <p style={{fontSize:14,color:C.text,lineHeight:1.7,marginBottom:0}}>
              Creatorship makes that happen automatically. Brands find your content through AI, license it with one click, and launch it as a paid ad. Every time that ad drives a sale, <span style={{color:C.green,fontWeight:700}}>you earn commission</span>. No extra work on your end. No re-filming. No uploads. No negotiations.
            </p>
          </div>
          <div style={{padding:"16px 28px",borderTop:"1px solid "+C.border,background:"rgba(255,255,255,.01)"}}>
            <div style={{display:"flex",gap:20}}>
              {[{v:"$0",l:"Extra work required",c:C.teal},{v:"10%+",l:"Commission per sale",c:C.green},{v:"Weekly",l:"Automatic payouts",c:C.gold}].map((s,i)=>(
                <div key={i}>
                  <div className="mono" style={{fontSize:18,fontWeight:800,color:s.c}}>{s.v}</div>
                  <div style={{fontSize:10,color:C.dim,marginTop:1}}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="gl fu d3" style={{padding:24,marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:700,color:C.dim,letterSpacing:".04em",marginBottom:16}}>How it works — 30 seconds to set up, then it's passive</div>
          {[
            {step:"Connect your TikTok",detail:"One click authorization. We only read your public profile and video list. We never post on your behalf.",icon:"🔗",color:C.coral},
            {step:"AI shows your content to brands",detail:"When a brand scans their TikTok Shop product, AI finds every creator video — including yours. They see your views, engagement, and estimated GMV.",icon:"🧠",color:C.purple},
            {step:"Brand licenses your video",detail:"If your video qualifies, the brand licenses it to run as a Meta ad. You'll see the deal offer in your Deals tab with the commission rate.",icon:"🤝",color:C.gold},
            {step:"Your video runs as a Meta ad",detail:"The brand launches your content on Facebook and Instagram. No resizing, no re-editing needed. Your original TikTok is the ad.",icon:"🚀",color:C.teal},
            {step:"You earn on every sale",detail:"Every purchase driven by your ad earns you commission. Payouts deposited weekly via Stripe. No invoicing, no chasing brands for money.",icon:"💰",color:C.green},
          ].map((s,i)=>(
            <div key={i} style={{display:"flex",gap:14,alignItems:"flex-start",marginBottom:i<4?16:0}}>
              <div style={{width:36,height:36,borderRadius:10,background:s.color+"10",border:"1px solid "+s.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{s.icon}</div>
              <div>
                <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:2}}>{s.step}</div>
                <div style={{fontSize:13,color:"#8a92a8",lineHeight:1.55}}>{s.detail}</div>
              </div>
            </div>
          ))}
        </div>

        {/* FAQ / Objection handling */}
        <div className="gl fu d4" style={{padding:24,marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:700,color:C.dim,letterSpacing:".04em",marginBottom:14}}>Common questions</div>
          {[
            {q:"Do I have to upload any videos?",a:"No. We pull your content directly from TikTok. You never upload, export, or send a single file."},
            {q:"Can brands use my video without my permission?",a:"You control everything. You see every deal offer before it goes live and can decline any brand."},
            {q:"How much do I earn?",a:"Commission rates are set by the brand — typically 8–15% per sale. The more sales your video drives, the more you earn."},
            {q:"When do I get paid?",a:"Payouts are calculated weekly and deposited directly to your bank via Stripe."},
          ].map((faq,i)=>(
            <div key={i} style={{marginBottom:i<3?14:0}}>
              <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:3}}>{faq.q}</div>
              <div style={{fontSize:13,color:"#8a92a8",lineHeight:1.55}}>{faq.a}</div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <a href="/auth/tiktok" style={{display:"block",width:"100%",padding:"16px 0",background:C.teal,color:C.bg,fontSize:16,fontWeight:700,borderRadius:10,textDecoration:"none",fontFamily:"inherit",textAlign:"center"}}>Connect TikTok — Start Earning →</a>
        <div style={{textAlign:"center",marginTop:10,fontSize:12,color:C.dim}}>Takes 30 seconds. Read-only access. We never post on your behalf.</div>
      </div>}
    </div>}

    {tab==="deals"&&<div>
      <h1 className="fu" style={{fontSize:24,fontWeight:800,marginBottom:4}}>Brand Deals</h1>
      <p className="fu d1" style={{fontSize:13,color:C.sub,marginBottom:20}}>Brands have licensed your videos as Meta ads. You earn commission on every sale they drive.</p>
      {!ttConnected?<div className="gl" style={{padding:36,textAlign:"center"}}><div style={{fontSize:28,marginBottom:10}}>🔗</div><div style={{fontSize:15,fontWeight:700,marginBottom:6}}>Connect TikTok to see deals</div><div style={{fontSize:13,color:C.dim}}>Brands can't find your content until you link your account.</div></div>:
      loadingDeals?<div className="gl" style={{padding:48,textAlign:"center",color:C.sub}}><span style={{display:"inline-block",width:20,height:20,border:"2px solid rgba(255,255,255,.1)",borderTopColor:C.teal,borderRadius:"50%",animation:"pulse 1s infinite",marginRight:10,verticalAlign:"middle"}}/>Loading deals...</div>:
      <div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:20}}>
          {[{l:"Available",v:String(deals?.available??0),c:C.teal},{l:"Active",v:String(deals?.accepted??0),c:C.green},{l:"Lifetime",v:String(deals?.lifetime??0),c:C.gold}].map((s,i)=><div key={i} className="gl" style={{padding:14}}><div style={{fontSize:10,color:C.dim}}>{s.l}</div><div className="mono" style={{fontSize:22,fontWeight:700,color:s.c,marginTop:3}}>{s.v}</div></div>)}
        </div>
        {(deals?.deals?.length??0)>0?deals.deals.map((d,i)=><div key={d.id||i} className="gl" style={{padding:0,overflow:"hidden",marginBottom:12,borderColor:d.isDemo?C.purple+"25":C.border}}>
          <div style={{padding:"16px 20px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div>
                <div style={{fontSize:16,fontWeight:700}}>{d.brand}</div>
                <div style={{fontSize:13,color:C.sub,marginTop:2}}>{d.product}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:10,fontWeight:700,padding:"4px 12px",borderRadius:6,background:d.status==="active"?C.green+"12":C.teal+"12",color:d.status==="active"?C.green:C.teal}}>{d.status==="active"?"● ACTIVE":"NEW OFFER"}</span>
                {d.isDemo&&<span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:4,background:C.purple+"15",color:C.purple}}>DEMO</span>}
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:12}}>
              {[{l:"Commission",v:d.commission,c:C.gold},{l:"Per Sale",v:d.perSale,c:C.green},{l:"Product Price",v:d.price,c:C.text},{l:"Launched",v:d.launchedAt?new Date(d.launchedAt).toLocaleDateString():"—",c:C.teal}].map((m,mi)=>(
                <div key={mi} style={{padding:"10px 8px",background:"rgba(255,255,255,.015)",borderRadius:8,textAlign:"center"}}>
                  <div className="mono" style={{fontSize:14,fontWeight:700,color:m.c}}>{m.v}</div>
                  <div style={{fontSize:9,color:C.dim,marginTop:2,textTransform:"uppercase"}}>{m.l}</div>
                </div>
              ))}
            </div>
            <div style={{fontSize:12,color:"#8a92a8",lineHeight:1.5}}>Your video is running as a Meta ad for this product. You earn {d.commission} ({d.perSale}) on every sale the ad drives. Payouts weekly.</div>
          </div>
        </div>):<div className="gl" style={{padding:36,textAlign:"center"}}><div style={{fontSize:32,marginBottom:10}}>💰</div><div style={{fontSize:15,fontWeight:700,marginBottom:6}}>No active deals yet</div><div style={{fontSize:13,color:C.dim}}>When a brand discovers your content and launches it as a Meta ad, the deal will appear here.</div></div>}
      </div>}
    </div>}

    {tab==="earnings"&&<div>
      <h1 className="fu" style={{fontSize:24,fontWeight:800,marginBottom:4}}>Earnings</h1>
      <p className="fu d1" style={{fontSize:13,color:C.sub,marginBottom:20}}>Commission earned from Meta ads running your content.</p>
      {!ttConnected?<div className="gl" style={{padding:36,textAlign:"center"}}><div style={{fontSize:28,marginBottom:10}}>🔗</div><div style={{fontSize:15,fontWeight:700,marginBottom:6}}>Connect TikTok first</div><div style={{fontSize:13,color:C.dim}}>Link your account to start receiving deals and earning commission.</div></div>:
      loadingEarnings?<div className="gl" style={{padding:48,textAlign:"center",color:C.sub}}><span style={{display:"inline-block",width:20,height:20,border:"2px solid rgba(255,255,255,.1)",borderTopColor:C.teal,borderRadius:"50%",animation:"pulse 1s infinite",marginRight:10,verticalAlign:"middle"}}/>Loading earnings...</div>:
      <div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
          {[{l:"Total Earned",v:"$"+(earnings?.totalEarned??0).toFixed(2),c:C.green},{l:"This Month",v:"$"+(earnings?.thisMonth??0).toFixed(2),c:C.teal},{l:"Next Payout",v:"$"+(earnings?.nextPayout??0).toFixed(2),c:C.gold}].map((s,i)=><div key={i} className="gl" style={{padding:18}}><div style={{fontSize:10,color:C.dim}}>{s.l}</div><div className="mono" style={{fontSize:26,fontWeight:700,color:s.c,marginTop:4}}>{s.v}</div></div>)}
        </div>
        <div className="gl" style={{padding:0,overflow:"hidden"}}>
          <div style={{padding:"16px 20px",borderBottom:"1px solid "+C.border,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:12,fontWeight:700,color:C.dim,letterSpacing:".04em"}}>Payout History</div>
            <span style={{fontSize:11,color:C.dim}}>Payouts deposited weekly via Stripe</span>
          </div>
          {(earnings?.payouts?.length??0)>0?<div style={{maxHeight:280,overflow:"auto"}}>
            {earnings.payouts.map((p,i)=><div key={p.campaignId||i} style={{padding:"14px 20px",borderBottom:"1px solid "+C.border,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:14,fontWeight:700}}>{p.product||"Campaign"}</div>
                <div style={{fontSize:11,color:C.dim,marginTop:2}}>{p.date} · {p.campaignId?.startsWith("demo")?"Demo":"Campaign"}</div>
              </div>
              <div className="mono" style={{fontSize:18,fontWeight:800,color:C.green}}>+${(p.amount||0).toFixed(2)}</div>
            </div>)}
          </div>:<div style={{padding:"28px 20px",textAlign:"center"}}>
            <div style={{fontSize:14,color:C.dim,marginBottom:6}}>No payouts yet</div>
            <div style={{fontSize:12,color:C.dim}}>Earnings will appear here once a brand launches your content and sales are tracked.</div>
          </div>}
        </div>
        <div className="gl" style={{padding:20,marginTop:12}}>
          <div style={{fontSize:12,fontWeight:700,color:C.dim,letterSpacing:".04em",marginBottom:10}}>How earnings work</div>
          {["A brand runs your video as a Meta ad","Every purchase tracked back to your ad earns you commission","Earnings are calculated daily, batched weekly","Stripe deposits directly to your bank every Friday"].map((s,i)=>(
            <div key={i} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
              <div className="mono" style={{width:20,height:20,borderRadius:6,background:C.green+"10",border:"1px solid "+C.green+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:C.green,flexShrink:0}}>{i+1}</div>
              <span style={{fontSize:13,color:C.sub}}>{s}</span>
            </div>
          ))}
        </div>
      </div>}
    </div>}

    </div>
    {toast&&<div style={{position:"fixed",bottom:20,right:20,padding:"11px 18px",borderRadius:11,fontSize:13,fontWeight:600,zIndex:999,animation:"fu .3s ease",background:"rgba(8,13,28,.95)",backdropFilter:"blur(20px)",border:"1px solid "+C.borderH}}>{toast}</div>}
  </div>;
}

/*══════════════════════════════════════════════════════
  APP ROOT
══════════════════════════════════════════════════════*/
export default function App(){
  const[route,nav]=useRoute();
  const p=route.startsWith("/brand")?"brand":route.startsWith("/creator")?"creator":"home";
  return <div style={{background:C.bg,color:C.text,minHeight:"100vh"}}>
    <style>{CSS}</style>
    {p==="home"&&<Homepage nav={nav}/>}
    {p==="brand"&&<BrandDashboard nav={nav}/>}
    {p==="creator"&&<CreatorPortal nav={nav}/>}
  </div>;
}
