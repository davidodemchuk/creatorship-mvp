import { useState, useEffect, useCallback, useRef } from "react";
import { Routes, Route, useNavigate, Link } from "react-router-dom";

/*══════════════════════════════════════════════════════
  CREATORSHIP MVP
  Homepage + Brand Dashboard + Creator Portal
  Real APIs: ScrapeCreators, Meta Marketing, TikTok OAuth
══════════════════════════════════════════════════════*/

const C={bg:"#030711",bg2:"#080d1c",card:"rgba(255,255,255,.025)",border:"rgba(255,255,255,.06)",borderH:"rgba(255,255,255,.14)",text:"#eaeff7",sub:"#7d8aaa",dim:"#3d4660",teal:"#00e4b8",coral:"#ff5252",gold:"#ffb400",blue:"#2da1ff",purple:"#9b6dff",green:"#2dd4a0",pink:"#ff6eb4",orange:"#ff9f43",success:"#34d399",error:"#ef4444"};
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
.bottom-nav{display:none;position:fixed;bottom:0;left:0;right:0;z-index:90;background:rgba(8,13,28,.95);backdrop-filter:blur(20px);border-top:1px solid rgba(255,255,255,.06);padding:8px 0;padding-bottom:max(8px,env(safe-area-inset-bottom));justify-content:space-around;align-items:center}
@media(max-width:768px){
.hero-stack{flex-direction:column!important;gap:20px!important}
.hero-visual .hero-side{min-width:auto!important;text-align:center!important}
.hero-visual .hero-side:first-child .hero-icons{justify-content:center!important}
.hero-visual .hero-mid{margin:0!important;flex-direction:column!important}
.hero-visual .hero-mid svg{transform:rotate(90deg)}
.hero-headline{font-size:clamp(28px,6vw,72px)!important;line-height:1.2!important}
.hero-sub{font-size:15px!important}
.hero-btns{flex-direction:column!important;width:100%;max-width:280px;margin:0 auto}
.hero-btns a,.hero-btns button{width:100%;text-align:center;padding:14px 24px!important}
.hero-pad{padding:80px 20px 40px!important}
.roi-grid{grid-template-columns:1fr!important}
.roi-left{border-right:none!important;border-bottom:1px solid rgba(255,255,255,.06)!important;padding:20px 20px 20px!important}
.roi-right{padding:20px 20px 24px!important}
.roi-bar{flex-direction:column!important;gap:12px!important;text-align:center}
.roi-bar-tags{flex-wrap:wrap;justify-content:center;gap:8px}
.auto-grid{grid-template-columns:repeat(2,1fr)!important;gap:12px!important}
.earn-grid{grid-template-columns:1fr!important}
.earn-col{border-right:none!important;border-bottom:1px solid rgba(255,255,255,.06)!important}
.earn-pad{padding:24px 20px!important}
.sec-pad{padding:60px 20px!important}
.sec-pad-lg{padding:80px 20px 60px!important}
.footer-flex{flex-direction:column!important;gap:16px!important;text-align:center}
.nav-pad{padding:12px 16px!important}
.nav-hide-mobile{display:none!important}
.nav-btns a,.nav-btns button{padding:8px 14px!important;font-size:12px!important}
.bottom-gap{padding-bottom:80px!important}
.sidebar-wrap{display:none!important}
.content-pad{padding:20px 16px!important;max-width:100%!important}
.mobile-card{padding:16px!important}
.settings-meta-grid{grid-template-columns:1fr!important}
.heading-h2{font-size:clamp(22px,4vw,36px)!important}
.heading-h3{font-size:clamp(18px,3vw,24px)!important}
.touch-target{min-height:44px;min-width:44px}
.overview-grid{grid-template-columns:1fr!important}
.creators-grid{grid-template-columns:1fr!important}
.onboarding-progress-track{background:rgba(255,255,255,.06);border-radius:999px;overflow:hidden;height:8px}
.onboarding-progress-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#00e0b4,#00b894);transition:width .5s cubic-bezier(.16,1,.3,1)}
.onboarding-step-card{transition:border-color .2s,background .2s}
.onboarding-step-card.current{border-color:rgba(0,224,180,.4);background:#1a2236;box-shadow:0 0 0 1px rgba(0,224,180,.15)}
.onboarding-step-card.completed{border-color:rgba(52,211,153,.3)}
.onboarding-step-card.locked{opacity:.7}
.summary-row{flex-wrap:wrap!important;gap:12px!important}
.pipeline-flow{display:flex!important;flex-direction:column!important;gap:0!important}
.creators-discovery-layout{flex-direction:column!important}
.creators-discovery-layout>div{flex-direction:column!important}
.creators-discovery-layout>div>div:first-child{width:100%!important;max-width:none!important;max-height:200px!important;border-right:none!important;border-bottom:1px solid rgba(255,255,255,.06)!important}
.bottom-nav{display:flex!important}
.campaign-metrics-row{flex-direction:column!important;gap:12px!important}
}
@media(max-width:480px){
.auto-grid{grid-template-columns:1fr!important}
.hero-headline{font-size:26px!important}
.hero-visual .hero-side{display:block}
}
`;

const navPath=(p)=>(p||'/').replace(/^#/,'')||'/';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

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

  return <div className="fu d4" style={{marginTop:56,maxWidth:860,width:'100%',padding:'0 16px',margin:"56px auto 0",boxSizing:'border-box'}}>
    <div style={{textAlign:"center",marginBottom:20}}>
      <div className="mono" style={{fontSize:11,fontWeight:700,letterSpacing:".15em",color:C.teal,textTransform:"uppercase",marginBottom:6}}>ROI Calculator</div>
      <div style={{fontSize:22,fontWeight:800,letterSpacing:"-.02em"}}>See what you keep with <span style={gT(C.teal,C.green)}>Creatorship</span></div>
    </div>
    <div className="gl" style={{padding:0,overflow:"hidden"}}>
      <div className="roi-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}>
        {/* Left — Inputs */}
        <div className="roi-left" style={{padding:"28px 28px 24px",borderRight:"1px solid "+C.border}}>
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
        <div className="roi-right" style={{padding:"28px 28px 24px",display:"flex",flexDirection:"column"}}>
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
      <div className="roi-bar" style={{padding:"16px 28px",borderTop:"1px solid "+C.border,display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(255,255,255,.01)"}}>
        <div className="roi-bar-tags" style={{display:"flex",gap:16}}>
          {["No subscriptions","No setup fees","No minimums","Cancel anytime"].map((t,i)=>(
            <div key={i} style={{fontSize:11,color:C.sub,display:"flex",alignItems:"center",gap:4}}>
              <span style={{color:C.teal,fontSize:12}}>✓</span>{t}
            </div>
          ))}
        </div>
        <Link to="/brand" style={{padding:"10px 24px",background:C.teal,color:C.bg,fontSize:13,fontWeight:700,border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",textDecoration:"none",display:"inline-block"}}>Start Free →</Link>
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

    <div className="hero-pad" style={{position:"relative",zIndex:1,textAlign:"center",maxWidth:1100,padding:"100px 40px 60px"}}>
      {/* The connection visual */}
      <div className="fu hero-stack hero-visual" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:0,marginBottom:48}}>
        {/* Creators side */}
        <div className="hero-side" style={{textAlign:"right",minWidth:200}}>
          <div className="hero-icons" style={{display:"flex",justifyContent:"flex-end",gap:8,marginBottom:10}}>
            {["🎬","📱","🎥"].map((e,i)=><div key={i} style={{width:44,height:44,borderRadius:12,background:C.coral+"12",border:"1px solid "+C.coral+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,animation:`float 3s ease infinite ${i*.4}s`}}>{e}</div>)}
          </div>
          <div style={{fontSize:28,fontWeight:800,letterSpacing:"-.02em",...gT(C.coral,C.pink)}}>Creators</div>
          <div style={{fontSize:13,color:C.sub,marginTop:4}}>Making content that sells</div>
        </div>

        {/* Connection line → Creatorship → Connection line */}
        <div className="hero-mid" style={{display:"flex",alignItems:"center",gap:0,margin:"0 20px"}}>
          <svg width="80" height="4" style={{opacity:.3}}><line x1="0" y1="2" x2="80" y2="2" stroke={C.coral} strokeWidth="2" strokeDasharray="6 4"/></svg>
          <div style={{padding:"14px 28px",background:g(C.coral+"15",C.teal+"15"),border:"1px solid rgba(255,255,255,.1)",borderRadius:14,position:"relative"}}>
            <div style={{position:"absolute",inset:-1,borderRadius:14,background:g(C.coral+"30",C.teal+"30"),filter:"blur(20px)",opacity:.5,zIndex:-1}}/>
            <div style={{fontSize:13,fontWeight:800,letterSpacing:".08em",color:"rgba(255,255,255,.5)",textTransform:"uppercase"}}>AI</div>
            <div style={{fontSize:20,fontWeight:900,letterSpacing:"-.01em"}}><span style={gT(C.coral,C.gold)}>Creator</span><span style={gT(C.blue,C.teal)}>ship</span></div>
          </div>
          <svg width="80" height="4" style={{opacity:.3}}><line x1="0" y1="2" x2="80" y2="2" stroke={C.teal} strokeWidth="2" strokeDasharray="6 4"/></svg>
        </div>

        {/* Brands side */}
        <div className="hero-side" style={{textAlign:"left",minWidth:200}}>
          <div className="hero-icons" style={{display:"flex",gap:8,marginBottom:10}}>
            {["📊","💰","🚀"].map((e,i)=><div key={i} style={{width:44,height:44,borderRadius:12,background:C.teal+"12",border:"1px solid "+C.teal+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,animation:`float 3s ease infinite ${i*.4+.2}s`}}>{e}</div>)}
          </div>
          <div style={{fontSize:28,fontWeight:800,letterSpacing:"-.02em",...gT(C.blue,C.teal)}}>Brands</div>
          <div style={{fontSize:13,color:C.sub,marginTop:4}}>Running ads that convert</div>
        </div>
      </div>

      {/* Headline */}
      <h1 className="fu d1 hero-headline" style={{fontSize:52,fontWeight:900,lineHeight:1.08,letterSpacing:"-.04em",marginBottom:20,maxWidth:800,margin:"0 auto 20px"}}>
        Turn TikTok creators into Meta ads. <span style={gT(C.teal,C.green)}>Automatically.</span>
      </h1>

      <p className="fu d2 hero-sub" style={{fontSize:18,color:C.sub,lineHeight:1.65,maxWidth:640,margin:"0 auto 36px"}}>
        Paste your TikTok Shop URL. Creatorship finds creators already posting your products, downloads the content, and launches it as Meta ads — in minutes, not weeks.
      </p>

      <div className="fu d3 hero-btns" style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
        <Link to="/brand" style={{padding:"15px 36px",background:C.teal,color:C.bg,fontSize:15,fontWeight:700,border:"none",borderRadius:12,cursor:"pointer",fontFamily:"inherit",letterSpacing:"-.01em",textDecoration:"none"}}>Get Started Free →</Link>
        <a href="#pipeline" style={{padding:"15px 36px",background:"transparent",border:"1px solid "+C.border,borderRadius:12,color:C.text,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit",letterSpacing:"-.01em",textDecoration:"none"}}>See how it works ↓</a>
      </div>

      <ROICalculator nav={nav}/>
    </div>
  </section>;
}

/*══════════════════════════════════════════════════════
  SOCIAL PROOF — Trust bar between hero and pipeline
══════════════════════════════════════════════════════*/
function SocialProofBar(){
  return <section className="fu" style={{padding:"40px 24px",textAlign:"center",background:C.bg,borderBottom:"1px solid "+C.border}}>
    <div style={{fontSize:13,color:C.dim,fontWeight:600,letterSpacing:".05em",textTransform:"uppercase",marginBottom:12}}>Trusted by DTC brands scaling creator content</div>
    <div style={{display:"flex",justifyContent:"center",flexWrap:"wrap",gap:24}}>
      <span className="mono" style={{fontSize:16,fontWeight:700,color:C.text}}>200+ ads launched</span>
      <span className="mono" style={{fontSize:16,fontWeight:700,color:C.orange}}>3.8× avg ROAS</span>
      <span className="mono" style={{fontSize:16,fontWeight:700,color:C.teal}}>47 creators discovered per store</span>
    </div>
  </section>;
}

/*══════════════════════════════════════════════════════
  SECTION 2 — Full Pipeline (sequential flow, sales story)
══════════════════════════════════════════════════════*/
function AutomationSection(){
  const steps=[
    {before:"Manual research",headline:"Paste your TikTok Shop URL",body:"Creatorship scrapes every creator and video already featuring your products. No outreach. No searching. They're already selling for you — you just didn't know.",stat:"47 creators · 183 videos found",color:C.teal},
    {before:"Guessing who converts",headline:"AI ranks who actually converts",body:"We score every creator by engagement rate, sales signals, and brand fit. The top performers rise to the top — no guessing, no gut calls.",stat:"AI Score: 92 · Est. GMV: $14K",color:C.purple},
    {before:"3–7 days for video",headline:"Pull the content instantly",body:"Top-ranked videos download direct from TikTok's CDN. No DMing creators for files. No waiting days for assets. Content is ready in seconds.",stat:"MP4 · 1080p",color:C.teal},
    {before:"2 hrs per campaign",headline:"One click → live Meta ads",body:"Creatorship builds the campaign, ad set, creative, and targeting inside your Meta Ads Manager. What used to take your team 2 hours takes one click.",stat:"Campaign built · Targeting set",color:C.coral},
    {before:"Check daily",headline:"AI monitors 24/7",body:"We track spend, ROAS, and conversions around the clock. Losers get paused. Winners get scaled. You sleep.",stat:"3.8× ROAS · Auto-scale on",color:C.green},
    {before:"Spreadsheet payouts",headline:"Creators get paid automatically",body:"Commission is calculated and paid weekly. No invoicing. No chasing. Creators stay happy, you keep 86% after a 4% platform fee.",stat:"10% creator · 86% you keep",color:C.gold},
  ];

  return <section id="pipeline" className="sec-pad-lg" style={{background:C.bg2,padding:"80px 40px",position:"relative"}}>
    <div style={{position:"absolute",top:0,left:0,right:0,height:1,background:g("transparent",C.border+"80","transparent")}}/>
    <div style={{position:"absolute",bottom:0,left:0,right:0,height:1,background:g("transparent",C.border+"80","transparent")}}/>
    <div style={{maxWidth:720,width:'100%',margin:"0 auto",padding:'0 16px',boxSizing:'border-box'}}>
      <div style={{textAlign:"center",marginBottom:40}}>
        <div className="fu mono" style={{fontSize:11,fontWeight:700,letterSpacing:".15em",color:C.teal,textTransform:"uppercase",marginBottom:8}}>The Full Pipeline</div>
        <h2 className="fu d1 heading-h2" style={{fontSize:36,fontWeight:900,letterSpacing:"-.03em"}}>Six steps. <span style={gT(C.teal,C.green)}>Fully automated.</span></h2>
        <p className="fu d2" style={{fontSize:16,color:C.sub,marginTop:12}}>Paste a link. Get live ads. That's it.</p>
      </div>

      {/* Sequential pipeline flow — vertical timeline */}
      <div className="pipeline-flow auto-grid" style={{display:"flex",flexDirection:"column",gap:0}}>
        {steps.map((s,i)=>(
          <div key={i} style={{display:"flex",flexDirection:"column"}}>
            <div className="gl fu" style={{padding:20,display:"flex",flexDirection:"column",gap:10,animationDelay:(i*0.05)+"s"}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:14}}>
                <div style={{width:36,height:36,borderRadius:10,background:s.color+"15",border:"1px solid "+s.color+"30",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:s.color,flexShrink:0}}>{i+1}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:10,color:C.dim,textDecoration:"line-through",marginBottom:4}}>{s.before}</div>
                  <div style={{fontSize:17,fontWeight:800,color:C.text,letterSpacing:"-.02em",marginBottom:6}}>{s.headline}</div>
                  <p style={{fontSize:13,color:C.sub,lineHeight:1.6,margin:0,marginBottom:10}}>{s.body}</p>
                  <div className="mono" style={{fontSize:13,fontWeight:700,color:s.color}}>{s.stat}</div>
                </div>
              </div>
            </div>
            {i<steps.length-1&&<div style={{display:"flex",justifyContent:"center",padding:"4px 0"}}><div style={{width:2,height:20,background:C.border,borderRadius:1}}/></div>}
          </div>
        ))}
      </div>

      {/* Bottom summary — more prominent */}
      <div className="fu d5" style={{marginTop:44,textAlign:"center"}}>
        <div className="gl summary-row" style={{display:"inline-flex",gap:40,padding:"24px 48px",alignItems:"center",background:C.card,border:"1px solid "+C.border,borderRadius:16}}>
          {[
            {v:"6 steps",l:"fully automated",c:C.teal},
            {v:"< 2 min",l:"URL → live campaign",c:C.green},
            {v:"$0",l:"monthly fee",c:C.gold},
            {v:"24/7",l:"AI monitoring",c:C.teal},
          ].map((s,i)=>(
            <div key={i} style={{textAlign:"center"}}>
              <div className="mono" style={{fontSize:22,fontWeight:800,color:s.c}}>{s.v}</div>
              <div style={{fontSize:11,color:C.dim,marginTop:4}}>{s.l}</div>
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
  return <section className="sec-pad" style={{padding:"100px 40px",position:"relative"}}>
    <div style={{maxWidth:1000,width:'100%',margin:"0 auto",padding:'0 16px',boxSizing:'border-box'}}>

      {/* ─── CREATOR SECTION ─── */}
      <div className="gl fu" style={{padding:0,overflow:"hidden",position:"relative",marginBottom:40}}>
        <div style={{position:"absolute",top:-40,left:-40,width:180,height:180,borderRadius:"50%",background:C.coral,filter:"blur(80px)",opacity:.05}}/>
        <div className="earn-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}>
          {/* Left — The sell */}
          <div className="earn-col earn-pad" style={{padding:"36px 36px 32px",borderRight:"1px solid "+C.border}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
              <div style={{width:36,height:36,borderRadius:10,background:C.coral+"12",border:"1px solid "+C.coral+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🎬</div>
              <div style={{fontSize:12,fontWeight:700,color:C.coral,letterSpacing:".08em",textTransform:"uppercase"}}>For Creators</div>
            </div>
            <h3 className="heading-h3" style={{fontSize:30,fontWeight:900,letterSpacing:"-.02em",lineHeight:1.15,marginBottom:16}}>
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
          <div className="earn-pad" style={{padding:"36px 32px",display:"flex",flexDirection:"column",justifyContent:"center"}}>
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
            <a href="/auth/tiktok" style={{marginTop:16,width:"100%",padding:"13px 0",background:C.coral,border:"none",borderRadius:10,color:C.bg,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit",textDecoration:"none",display:"block",textAlign:"center"}}>Connect TikTok — Start Earning →</a>
          </div>
        </div>
      </div>

      {/* ─── BRAND SECTION ─── */}
      <div className="gl fu d2" style={{padding:0,overflow:"hidden",position:"relative"}}>
        <div style={{position:"absolute",top:-40,right:-40,width:180,height:180,borderRadius:"50%",background:C.teal,filter:"blur(80px)",opacity:.05}}/>
        <div className="earn-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}>
          {/* Left — The pain */}
          <div className="earn-col earn-pad" style={{padding:"36px 36px 32px",borderRight:"1px solid "+C.border}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
              <div style={{width:36,height:36,borderRadius:10,background:C.teal+"12",border:"1px solid "+C.teal+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>📊</div>
              <div style={{fontSize:12,fontWeight:700,color:C.teal,letterSpacing:".08em",textTransform:"uppercase"}}>For Brands</div>
            </div>
            <h3 className="heading-h3" style={{fontSize:30,fontWeight:900,letterSpacing:"-.02em",lineHeight:1.15,marginBottom:16}}>
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
          <div className="earn-pad" style={{padding:"36px 32px",display:"flex",flexDirection:"column",justifyContent:"center"}}>
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

            <Link to="/brand" style={{width:"100%",padding:"13px 0",background:C.teal,border:"none",borderRadius:10,color:C.bg,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit",textDecoration:"none",display:"block",textAlign:"center"}}>Launch Your First Campaign →</Link>
          </div>
        </div>
      </div>
    </div>
  </section>;
}

/*══════════════════════════════════════════════════════
  PRICING — Simple pricing section
══════════════════════════════════════════════════════*/
function PricingSection({nav}){
  return <section className="sec-pad" style={{padding:"80px 40px",background:C.bg2,borderTop:"1px solid "+C.border}}>
    <div style={{maxWidth:560,margin:"0 auto",textAlign:"center"}}>
      <h2 className="fu heading-h2" style={{fontSize:32,fontWeight:900,letterSpacing:"-.02em",marginBottom:12}}>Simple pricing. No monthly fees.</h2>
      <div className="gl fu" style={{padding:36,borderRadius:16,marginTop:24}}>
        <div className="mono" style={{fontSize:28,fontWeight:800,color:C.orange,marginBottom:8}}>4% of managed ad spend</div>
        <p style={{fontSize:15,color:C.sub,lineHeight:1.6,marginBottom:20}}>That's it. No seat fees. No contracts. No minimums.</p>
        <ul style={{textAlign:"left",listStyle:"none",padding:0,margin:"0 0 24px",fontSize:14,color:C.sub,lineHeight:2}}>
          {["Unlimited creators","Unlimited campaigns","TikTok discovery","Meta ad automation","Performance monitoring","Creator payouts"].map((x,i)=><li key={i} style={{display:"flex",alignItems:"center",gap:8}}><span style={{color:C.teal}}>✓</span>{x}</li>)}
        </ul>
        <Link to="/brand" style={{padding:"14px 32px",background:C.teal,color:C.bg,fontSize:15,fontWeight:700,border:"none",borderRadius:10,cursor:"pointer",fontFamily:"inherit",textDecoration:"none",display:"inline-block"}}>Start for Free →</Link>
      </div>
    </div>
  </section>;
}

/*══════════════════════════════════════════════════════
  SECTION 4 — CTA + Footer
══════════════════════════════════════════════════════*/
function CTASection(){
  return <section className="sec-pad" style={{padding:"40px 40px 24px"}}>
    <footer className="footer-flex" style={{borderTop:"1px solid "+C.border,padding:"32px 16px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:20,maxWidth:1100,width:'100%',margin:"0 auto",boxSizing:'border-box'}}>
      <div style={{fontSize:18,fontWeight:900}}><span style={gT(C.coral,C.gold)}>Creator</span><span style={gT(C.blue,C.teal)}>ship</span></div>
      <div style={{display:"flex",alignItems:"center",gap:24,flexWrap:"wrap"}}>
        <a href="/terms" style={{fontSize:12,color:C.sub,textDecoration:"none"}}>Terms</a>
        <a href="/privacy" style={{fontSize:12,color:C.sub,textDecoration:"none"}}>Privacy</a>
        <a href="mailto:hello@creatorship.app" style={{fontSize:12,color:C.sub,textDecoration:"none"}}>Contact</a>
        <span style={{fontSize:12,color:C.dim}}>© 2026 Creatorship. All rights reserved.</span>
      </div>
    </footer>
  </section>;
}

function Homepage({nav}){
  const isMobile = useIsMobile();
  return <div>
    <nav className="nav-pad" style={{position:"fixed",top:0,left:0,right:0,zIndex:100,padding:isMobile?"12px 16px":"14px 40px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(3,7,17,.85)",backdropFilter:"blur(20px)",borderBottom:"1px solid "+C.border}}>
      <Link to="/" style={{fontSize:isMobile?18:20,fontWeight:900,cursor:"pointer",textDecoration:"none",color:"inherit"}}><span style={gT(C.coral,C.gold)}>Creator</span><span style={gT(C.blue,C.teal)}>ship</span></Link>
      <div className="nav-btns" style={{display:"flex",gap:8}}>
        {!isMobile&&<Link to="/brand" style={{padding:"8px 20px",background:"transparent",border:"1px solid "+C.border,borderRadius:8,color:C.text,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textDecoration:"none"}}>Brands</Link>}
        <a href="/auth/tiktok" style={{padding:isMobile?"8px 14px":"8px 20px",background:C.teal,border:"none",borderRadius:8,color:C.bg,fontSize:isMobile?12:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textDecoration:"none"}}>Creators</a>
      </div>
    </nav>
    <HeroSection nav={nav}/>
    <SocialProofBar/>
    <AutomationSection/>
    <EarnSection nav={nav}/>
    <PricingSection nav={nav}/>
    <CTASection/>
  </div>;
}

/*══════════════════════════════════════════════════════
  BRAND DASHBOARD — Full working product
══════════════════════════════════════════════════════*/
function BrandDashboard({nav}){
  const[tab,setTab]=useState("scan");
  const[metaToken,setMetaToken]=useState(KEYS.metaToken);
  const[brandName,setBrandName]=useState("");
  const[storeName,setStoreName]=useState("");
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

  const getStoreUrl=()=>{const s=(storeName||"").trim().replace(/^@/,"");return s?"https://www.tiktok.com/shop/@"+s:""};
  const storeUrl=getStoreUrl();

  const fetchStore=async()=>{
    if(!storeUrl)return;
    setLoadingStore(true);setStoreProducts(null);setStoreInfo(null);
    try{
      const r=await fetch("/api/store",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scrapeKey:KEYS.scrape,storeUrl})});
      const d=await r.json();
      if(d.error)throw new Error(d.error);
      setStoreInfo(d.shop);setStoreProducts(d.products||[]);
    }catch(e){fire("Error: "+e.message)}
    setLoadingStore(false);
  };

  const selectProduct=(p)=>{
    setPrice(+p.price||39.99);
    setSelectedStoreProduct(p);
  };
  const backToStore=()=>{
    setSelectedStoreProduct(null);
  };

  const runScan=async()=>{
    setScanning(true);setError(null);
    const urlToScan=selectedStoreProduct?.url||storeUrl;
    if(!urlToScan){setError("Enter TikTok Shop store name to scan");return}
    try{const r=await fetch("/api/scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scrapeKey:KEYS.scrape,productUrl:urlToScan,commission,gmvFloor,productPrice:price})});const d=await r.json();if(d.error)throw new Error(d.error);setScan(d);setTab("results")}catch(e){setError(e.message)}
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
          <h1 style={{fontSize:24,fontWeight:800,letterSpacing:"-.02em",marginBottom:4}}>Creator Discovery</h1>
          <p style={{fontSize:13,color:"#8a92a8"}}>Enter your brand and store name. We'll find every TikTok creator already talking about your products.</p>
        </div>
        {scan&&<button onClick={()=>setTab("results")} style={{padding:"8px 16px",background:C.teal+"10",border:"1px solid "+C.teal+"20",borderRadius:8,color:C.teal,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0,marginLeft:16}}>View Results ({scan.qualified?.length||0}) →</button>}
      </div>

      {/* Step 1: Brand & Store */}
      <div className="gl fu d1" style={{padding:0,overflow:"hidden",marginBottom:16}}>
        <div style={{padding:"14px 20px",borderBottom:"1px solid "+C.border,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:22,height:22,borderRadius:6,background:C.teal+"12",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:C.teal}}>1</div>
            <span style={{fontSize:13,fontWeight:700,color:C.text}}>Your TikTok Shop</span>
          </div>
          <div style={{fontSize:10,color:C.dim}}>Enter brand and store handle to browse products or scan</div>
        </div>
        <div style={{padding:"16px 20px"}}>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:180}}>
              <label style={{fontSize:11,fontWeight:600,color:C.sub,display:"block",marginBottom:6}}>Brand Name</label>
              <input value={brandName} onChange={e=>{setBrandName(e.target.value);setStoreProducts(null);setStoreInfo(null);setSelectedStoreProduct(null)}} placeholder="e.g. Intake Breathing" style={{width:"100%",padding:"11px 14px",background:"rgba(255,255,255,.03)",border:"1px solid "+C.border,borderRadius:8,color:C.text,fontSize:13,fontFamily:"inherit",outline:"none"}} onFocus={e=>e.target.style.borderColor=C.teal} onBlur={e=>e.target.style.borderColor=C.border}/>
            </div>
            <div style={{flex:1,minWidth:180}}>
              <label style={{fontSize:11,fontWeight:600,color:C.sub,display:"block",marginBottom:6}}>TikTok Shop Store Name</label>
              <div style={{display:"flex",gap:8}}>
                <input value={storeName} onChange={e=>{setStoreName(e.target.value);setStoreProducts(null);setStoreInfo(null);setSelectedStoreProduct(null)}} placeholder="e.g. intakebreathing" style={{flex:1,padding:"11px 14px",background:"rgba(255,255,255,.03)",border:"1px solid "+C.border,borderRadius:8,color:C.text,fontSize:13,fontFamily:"'JetBrains Mono'",outline:"none"}} onFocus={e=>e.target.style.borderColor=C.teal} onBlur={e=>e.target.style.borderColor=C.border}/>
                {storeUrl&&!storeProducts&&<button onClick={fetchStore} disabled={loadingStore} style={{padding:"0 16px",background:C.teal,border:"none",borderRadius:8,color:C.bg,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0,opacity:loadingStore?.5:1}}>{loadingStore?"Loading...":"Browse Products"}</button>}
                {(brandName||storeName)&&<button onClick={()=>{setBrandName("");setStoreName("");setStoreProducts(null);setStoreInfo(null);setSelectedStoreProduct(null)}} style={{padding:"0 12px",background:"rgba(255,255,255,.03)",border:"1px solid "+C.border,borderRadius:8,color:C.dim,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Clear</button>}
              </div>
            </div>
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

          <button onClick={runScan} disabled={scanning||!storeUrl} style={{width:"100%",padding:14,background:(!storeUrl)?C.dim:C.teal,color:C.bg,fontSize:14,fontWeight:700,border:"none",borderRadius:8,cursor:(!storeUrl)?"not-allowed":"pointer",fontFamily:"inherit",opacity:scanning?.5:1,letterSpacing:"-.01em",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            {scanning?<><span style={{display:"inline-block",width:14,height:14,border:"2px solid rgba(0,0,0,.2)",borderTopColor:C.bg,borderRadius:"50%",animation:"pulse 1s infinite"}}/>Scanning affiliate creators...</>:
            !storeUrl?"Enter TikTok Shop store name above":"Scan Product for Creators →"}
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
  const[ttStatus,setTtStatus]=useState({connected:false,displayName:"",followers:0,videos:0});
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
      setTtStatus({connected:false,displayName:"",followers:0,videos:0});
      nav("/");
    }catch(e){fire("Disconnect failed: "+(e.message||"try again"))}
  };

  useEffect(()=>{
    fetch("/api/tiktok/status").then(r=>r.json()).then(d=>{
      if(d.connected){setTtStatus({connected:true,displayName:d.display_name||"",followers:d.follower_count||0,videos:d.video_count||0});setTab("deals")}
      else setTtStatus({connected:false,displayName:"",followers:0,videos:0});
    }).catch(()=>{});
    if(window.location.search?.includes("connected=true")){setTtStatus(s=>({...s,connected:true}));setTab("deals");fire("TikTok connected!")}
  },[]);

  useEffect(()=>{
    if(!ttStatus.connected||tab!=="deals")return;
    setLoadingDeals(true);
    fetch("/api/creator/deals").then(r=>r.json()).then(d=>{setDeals(d);setLoadingDeals(false)}).catch(()=>setLoadingDeals(false));
  },[ttStatus.connected,tab]);

  useEffect(()=>{
    if(!ttStatus.connected||tab!=="earnings")return;
    setLoadingEarnings(true);
    fetch("/api/creator/earnings").then(r=>r.json()).then(d=>{setEarnings(d);setLoadingEarnings(false)}).catch(()=>setLoadingEarnings(false));
  },[ttStatus.connected,tab]);

  const creatorTabs=[{id:"connect",l:"Connect TikTok",i:"🔗"},{id:"deals",l:"Deals",i:"💰"},{id:"earnings",l:"Earnings",i:"📈"}];
  const Sidebar=()=><div className="sidebar-wrap" style={{width:200,background:C.bg2,borderRight:"1px solid "+C.border,padding:"16px 0",flexShrink:0,display:"flex",flexDirection:"column",minHeight:"100vh"}}>
    <div style={{padding:"0 16px 20px",cursor:"pointer"}} onClick={()=>nav("/")}><span style={{fontSize:17,fontWeight:900,...gT(C.coral,C.gold)}}>Creator</span><span style={{fontSize:17,fontWeight:900,...gT(C.blue,C.teal)}}>ship</span><div style={{fontSize:10,color:C.dim,marginTop:1}}>Creator Portal</div></div>
    {creatorTabs.map(t=><div key={t.id} onClick={()=>setTab(t.id)} style={{padding:"9px 16px",cursor:"pointer",fontSize:13,fontWeight:tab===t.id?600:400,color:tab===t.id?C.teal:C.sub,background:tab===t.id?C.teal+"06":"transparent",borderRight:tab===t.id?"2px solid "+C.teal:"2px solid transparent"}}>{t.i} {t.l}</div>)}
    <div style={{flex:1}}/>
    <div style={{padding:"10px 16px",borderTop:"1px solid "+C.border,fontSize:11,color:C.dim,cursor:"pointer"}} onClick={()=>nav("/brand")}>Brand Dashboard →</div>
    {ttStatus.connected&&<div style={{padding:"8px 16px",fontSize:11,color:C.sub}}>{ttStatus.displayName}</div>}
    {ttStatus.connected&&<div style={{padding:"8px 16px",fontSize:11,color:C.coral,cursor:"pointer"}} onClick={handleDisconnect}>Disconnect TikTok</div>}
  </div>;

  const CreatorBottomNav=()=>(<div className="bottom-nav">
    {creatorTabs.map(t=><div key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,textAlign:"center",padding:"8px 4px",cursor:"pointer",fontSize:11,fontWeight:tab===t.id?600:400,color:tab===t.id?C.teal:C.sub}}>{t.i}<br/>{t.l}</div>)}
  </div>);

  return <div className="bottom-gap" style={{display:"flex"}}>
    <Sidebar/>
    <CreatorBottomNav/>
    <div className="content-pad" style={{flex:1,padding:"28px 36px",maxWidth:700}}>

    {tab==="connect"&&<div>
      {ttStatus.connected?<div>
        <h1 className="fu heading-h3" style={{fontSize:24,fontWeight:800,marginBottom:4}}>TikTok Connected</h1>
        <p className="fu d1" style={{fontSize:13,color:C.sub,marginBottom:20}}>Your account is linked. Brands can discover your content.</p>
        <div className="gl fu d2 mobile-card" style={{padding:24,borderColor:C.green+"22"}}>
          <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:16}}>
            <div style={{width:56,height:56,borderRadius:14,background:C.green+"12",border:"2px solid "+C.green+"30",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>✓</div>
            <div style={{flex:1,minWidth:120}}>
              <div style={{fontSize:18,fontWeight:800,color:C.green}}>{ttStatus.displayName||"Creator"}</div>
              <div style={{fontSize:13,color:C.sub,marginTop:2}}>{fN(ttStatus.followers||0)} followers · {ttStatus.videos||0} videos</div>
            </div>
            <button onClick={handleDisconnect} style={{padding:"8px 16px",background:"transparent",border:"1px solid "+C.border,borderRadius:8,color:C.sub,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Disconnect</button>
          </div>
        </div>
        <div className="gl fu d3 mobile-card" style={{padding:20,marginTop:12}}>
          <div style={{fontSize:12,fontWeight:700,color:C.dim,letterSpacing:".04em",marginBottom:10}}>What happens next</div>
          {["Brands scanning TikTok Shop products will see your videos","If your content qualifies, you'll get a deal offer in the Deals tab","When a brand runs your video as a Meta ad, you earn commission on every sale","Payouts are deposited weekly — no invoicing needed"].map((s,i)=>(
            <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:8}}>
              <span style={{color:C.teal,fontSize:11,fontWeight:800,marginTop:1}}>✓</span>
              <span style={{fontSize:13,color:C.sub}}>{s}</span>
            </div>
          ))}
        </div>
      </div>:<div>
        <h1 className="fu heading-h3" style={{fontSize:24,fontWeight:800,marginBottom:4}}>Get Paid for Content You Already Made</h1>
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
      {!ttStatus.connected?<div className="gl" style={{padding:36,textAlign:"center"}}><div style={{fontSize:28,marginBottom:10}}>🔗</div><div style={{fontSize:15,fontWeight:700,marginBottom:6}}>Connect TikTok to see deals</div><div style={{fontSize:13,color:C.dim}}>Brands can't find your content until you link your account.</div></div>:
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
      {!ttStatus.connected?<div className="gl" style={{padding:36,textAlign:"center"}}><div style={{fontSize:28,marginBottom:10}}>🔗</div><div style={{fontSize:15,fontWeight:700,marginBottom:6}}>Connect TikTok first</div><div style={{fontSize:13,color:C.dim}}>Link your account to start receiving deals and earning commission.</div></div>:
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
  BRAND PORTAL — login/signup + brand dashboard
══════════════════════════════════════════════════════*/
const BRAND_STORAGE = 'creatorship_brand';

const DEMO_PROFILE = {
  id: 'demo', email: 'demo@creatorship.app', storeName: 'glowupskincare', storeDisplay: 'glowupskincare',
  hasMetaToken: true, adAccount: 'act_••••7842', pageId: '••••3291', plan: 'Starter', createdAt: '2026-02-15', isDemo: true
};

const DEMO_CREATORS_RAW = [
  { handle: 'skincarebyjess', followers: 124000, videoCount: 8, aiScore: 94, estGmv: 14200 },
  { handle: 'glowwithnat', followers: 89000, videoCount: 5, aiScore: 87, estGmv: 9800 },
  { handle: 'thebeautyplug', followers: 312000, videoCount: 12, aiScore: 91, estGmv: 22400 },
  { handle: 'routinequeen', followers: 56000, videoCount: 3, aiScore: 78, estGmv: 4200 },
  { handle: 'cleanbeautykim', followers: 201000, videoCount: 7, aiScore: 85, estGmv: 11600 },
  { handle: 'dermdaily', followers: 445000, videoCount: 15, aiScore: 96, estGmv: 31000 },
];

const makeDemoVideos = (handle, count) => Array.from({ length: count }, (_, i) => ({
  id: `vd_${handle}_${i}`, creator: handle, handle: '@' + handle, thumbnail: null, duration: (30 + (i * 7)) + '', views: 12000 + i * 8000, likes: 800 + i * 400,
  caption: `This serum changed my whole routine 😍 #glowupskincare #skincare`, content_url: null
}));

const DEMO_CREATORS = DEMO_CREATORS_RAW.map((c, i) => ({
  ...c, handle: '@' + c.handle, videos: makeDemoVideos(c.handle, 3 + (i % 3)), totalViews: c.estGmv * 2, bestScore: c.aiScore
}));

const DEMO_CAMPAIGNS = [
  { id: 'camp_001', name: 'skincarebyjess_serum_v1', creator: 'skincarebyjess', status: 'ACTIVE', created_time: '2026-03-01', launchedAt: '2026-03-01', spend: 342.50, impressions: 58400, clicks: 2104, roas: 3.8, dailyBudget: 50, objective: 'Conversions', insights: { spend: '342.50', impressions: '58400', clicks: '2104', purchase_roas: [{ value: '3.8' }] } },
  { id: 'camp_002', name: 'thebeautyplug_moisturizer_v2', creator: 'thebeautyplug', status: 'ACTIVE', created_time: '2026-03-03', launchedAt: '2026-03-03', spend: 187.20, impressions: 31200, clicks: 1087, roas: 4.2, dailyBudget: 50, objective: 'Conversions', insights: { spend: '187.20', impressions: '31200', clicks: '1087', purchase_roas: [{ value: '4.2' }] } },
  { id: 'camp_003', name: 'glowwithnat_cleanser_v1', creator: 'glowwithnat', status: 'PAUSED', created_time: '2026-02-25', launchedAt: '2026-02-25', spend: 410.00, impressions: 44800, clicks: 1560, roas: 1.4, dailyBudget: 75, objective: 'Traffic', insights: { spend: '410.00', impressions: '44800', clicks: '1560', purchase_roas: [{ value: '1.4' }] } },
];

function BrandAuthForm({ onSuccess, onDemo, initialMode }) {
  const [mode, setMode] = useState(initialMode || 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [storeName, setStoreName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fire = useCallback(m => { setError(m); setTimeout(() => setError(null), 4000); }, []);

  const submit = async () => {
    setError(null);
    if (mode === 'signup' && !brandName.trim()) {
      fire('Brand name required');
      return;
    }
    if (!email.trim() || !password) { fire('Email and password required'); return; }
    setLoading(true);
    try {
      const ep = mode === 'signup' ? '/api/brand/signup' : '/api/brand/login';
      const body = mode === 'signup' ? { brandName, storeName, email, password } : { email, password };
      const r = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      if (!d.success || !d.brand) throw new Error('Invalid response');
      localStorage.setItem(BRAND_STORAGE, JSON.stringify(d.brand));
      onSuccess(d);
    } catch (e) { fire(e.message || 'Failed'); }
    setLoading(false);
  };

  return <div className="gl" style={{maxWidth:420,margin:"80px auto",padding:32}}>
    <h1 style={{fontSize:24,fontWeight:800,marginBottom:8}}>{mode==='login'?'Brand Login':'Create Account'}</h1>
    <p style={{fontSize:13,color:C.sub,marginBottom:24}}>{mode==='login'?'Sign in to your brand dashboard.':'Sign up to get started.'}</p>
    {mode==='signup'&&<>
      <input type="text" placeholder="Brand name" value={brandName} onChange={e=>setBrandName(e.target.value)}
        style={{width:"100%",padding:"12px 16px",background:"rgba(255,255,255,.04)",border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:14,marginBottom:12,fontFamily:"inherit"}}/>
      <input type="text" placeholder="Store name (TikTok @handle)" value={storeName} onChange={e=>setStoreName(e.target.value)}
        style={{width:"100%",padding:"12px 16px",background:"rgba(255,255,255,.04)",border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:14,marginBottom:12,fontFamily:"inherit"}}/>
    </>}
    <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}
      style={{width:"100%",padding:"12px 16px",background:"rgba(255,255,255,.04)",border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:14,marginBottom:12,fontFamily:"inherit"}}/>
    <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)}
      style={{width:"100%",padding:"12px 16px",background:"rgba(255,255,255,.04)",border:"1px solid "+C.border,borderRadius:10,color:C.text,fontSize:14,marginBottom:16,fontFamily:"inherit"}}/>
    {error&&<div style={{color:C.coral,fontSize:13,marginBottom:12}}>{error}</div>}
    <button onClick={submit} disabled={loading} style={{width:"100%",padding:"14px",background:C.teal,color:C.bg,border:"none",borderRadius:10,fontSize:15,fontWeight:700,cursor:loading?"not-allowed":"pointer",fontFamily:"inherit"}}>{loading?'...':mode==='login'?'Sign In':'Sign Up'}</button>
    <div style={{marginTop:16,fontSize:13,color:C.sub,textAlign:"center"}}>
      {mode==='login'?'No account? ':'Already have an account? '}
      <button onClick={()=>{setMode(m=>m==='login'?'signup':'login');setError(null)}} style={{background:"none",border:"none",color:C.teal,cursor:"pointer",fontWeight:600,fontFamily:"inherit",fontSize:13}}>{mode==='login'?'Sign up':'Log in'}</button>
    </div>
    {onDemo&&<>
      <div style={{display:"flex",alignItems:"center",gap:12,marginTop:24,marginBottom:16}}>
        <div style={{flex:1,height:1,background:C.border}}/>
        <span style={{fontSize:12,color:C.dim}}>or</span>
        <div style={{flex:1,height:1,background:C.border}}/>
      </div>
      <button onClick={onDemo} style={{width:"100%",padding:"14px",background:"transparent",border:"1px solid rgba(255,255,255,.25)",borderRadius:10,color:C.text,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Explore Demo Account →</button>
      <p style={{fontSize:12,color:C.dim,textAlign:"center",marginTop:10}}>No sign-up required. See the full product with sample data.</p>
    </>}
  </div>;
}

const stripAt = s => (s || '').toString().replace(/^@+/, '') || '';

const inputStyle = { padding: '10px 14px', background: 'rgba(255,255,255,.04)', border: '1px solid '+C.border, borderRadius: 8, color: C.text, fontSize: 13, fontFamily: 'inherit', width: '100%' };
const btnStyle = { padding: '10px 20px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };

// Onboarding design tokens (from creatorship-onboarding spec)
const OB = { bgDeep: '#0b0f1a', bgCard: '#111827', bgCardHover: '#1a2236', borderDim: 'rgba(255,255,255,0.06)', borderActive: 'rgba(0,224,180,0.4)', accent: '#00e0b4', accentGlow: 'rgba(0,224,180,0.15)', orange: '#ff9f43', textPrimary: '#f0f2f5', textSecondary: '#8b95a8', textDim: '#5a6478', success: '#34d399' };

function BrandOverviewOnboarding({ profile, storeDisplay, creatorsCount, campaignsCount, setBrandTab }) {
  const steps = [
    { id: 'account', title: 'Create your account', why: 'Your brand account is the hub for connecting Meta, TikTok Shop, and creators. We use it to persist settings and campaign data.', ctaLabel: null, ctaTab: null },
    { id: 'meta', title: 'Connect Meta Ads API', why: 'Meta Ads powers your creator campaigns. Connecting your Ad Account and Page ID lets Creatorship create and manage campaigns on your behalf.', ctaLabel: 'Go to Settings', ctaTab: 'settings' },
    { id: 'tiktok', title: 'Connect TikTok Shop', why: 'Linking your TikTok Shop (store) lets us match your products with creators and track performance. Add your store handle in Settings.', ctaLabel: 'Go to Settings', ctaTab: 'settings' },
    { id: 'creators', title: 'Add creators to your pipeline', why: 'Creators are the heart of your campaigns. Add at least one creator so we can launch your first campaign.', ctaLabel: 'Go to Creators', ctaTab: 'creators' },
    { id: 'campaign', title: 'Launch your first campaign', why: 'Once Meta is connected and you have creators, launch a campaign to run ads with creator content. You can monitor performance in Campaigns.', ctaLabel: 'Go to Campaigns', ctaTab: 'campaigns' },
  ];
  const completions = [
    true,
    !!(profile && profile.hasMetaToken),
    !!storeDisplay,
    creatorsCount >= 1,
    campaignsCount >= 1,
  ];
  const completedCount = completions.filter(Boolean).length;
  const allComplete = completedCount === 5;
  const currentStepIndex = completions.findIndex(c => !c);
  const currentStep = currentStepIndex >= 0 ? currentStepIndex : 5;

  const getStepState = (i) => {
    if (completions[i]) return 'completed';
    if (i === currentStep) return 'current';
    return 'locked';
  };

  return (
    <div className="fu" style={{ animationDelay: '0.05s' }}>
      <h1 className="heading-h3" style={{ fontSize: 24, fontWeight: 800, marginBottom: 24, color: OB.textPrimary }}>Overview</h1>
      {/* Stats row */}
      <div className="overview-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 32 }}>
        <div className="gl mobile-card" style={{ padding: 20, background: OB.bgCard, border: '1px solid ' + OB.borderDim }}>
          <div style={{ fontSize: 11, color: OB.textDim, textTransform: 'uppercase' }}>Store</div>
          <div className="mono" style={{ fontSize: 20, fontWeight: 800, color: OB.accent, marginTop: 4 }}>{storeDisplay ? '@' + storeDisplay : '—'}</div>
        </div>
        <div className="gl mobile-card" style={{ padding: 20, background: OB.bgCard, border: '1px solid ' + OB.borderDim }}>
          <div style={{ fontSize: 11, color: OB.textDim, textTransform: 'uppercase' }}>Connected Creators</div>
          <div className="mono" style={{ fontSize: 20, fontWeight: 800, color: OB.success, marginTop: 4 }}>{creatorsCount}</div>
        </div>
        <div className="gl mobile-card" style={{ padding: 20, background: OB.bgCard, border: '1px solid ' + OB.borderDim }}>
          <div style={{ fontSize: 11, color: OB.textDim, textTransform: 'uppercase' }}>Active Campaigns</div>
          <div className="mono" style={{ fontSize: 20, fontWeight: 800, color: OB.orange, marginTop: 4 }}>{campaignsCount}</div>
        </div>
      </div>

      {allComplete ? (
        <div className="gl mobile-card fu" style={{ padding: 28, background: OB.bgCard, border: '1px solid ' + OB.borderActive, borderRadius: 16, textAlign: 'center', boxShadow: '0 0 0 1px ' + OB.accentGlow }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: OB.success, marginBottom: 8 }}>✓ You're all set!</div>
          <div style={{ fontSize: 14, color: OB.textSecondary, marginBottom: 20 }}>You've completed onboarding. Head to Campaigns to launch and manage your creator ads.</div>
          <button onClick={() => setBrandTab('campaigns')} style={{ padding: '12px 24px', background: OB.accent, color: '#0b0f1a', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Go to Campaigns →</button>
        </div>
      ) : (
        <>
          {/* Progress bar */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: OB.textSecondary }}>{completedCount} of 5 complete</span>
            </div>
            <div className="onboarding-progress-track" style={{ background: OB.borderDim }}>
              <div className="onboarding-progress-fill" style={{ width: (completedCount / 5) * 100 + '%' }} />
            </div>
          </div>
          {/* Step cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {steps.map((step, i) => {
              const state = getStepState(i);
              const isCurrent = state === 'current';
              return (
                <div
                  key={step.id}
                  className={`onboarding-step-card gl mobile-card ${state}`}
                  style={{
                    padding: 20,
                    background: isCurrent ? OB.bgCardHover : OB.bgCard,
                    border: '1px solid ' + (isCurrent ? OB.borderActive : OB.borderDim),
                    borderRadius: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: state === 'completed' ? OB.success : state === 'current' ? OB.accentGlow : OB.borderDim, color: state === 'completed' ? '#0b0f1a' : state === 'current' ? OB.accent : OB.textDim, border: state === 'current' ? '1px solid ' + OB.borderActive : 'none' }}>
                      {state === 'completed' ? '✓' : state === 'locked' ? '🔒' : i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: state === 'locked' ? OB.textDim : OB.textPrimary }}>{step.title}</div>
                      {isCurrent && (
                        <>
                          <p style={{ fontSize: 13, color: OB.textSecondary, marginTop: 10, marginBottom: 14, lineHeight: 1.5 }}>{step.why}</p>
                          {step.ctaLabel && step.ctaTab && (
                            <button onClick={() => setBrandTab(step.ctaTab)} style={{ padding: '10px 18px', background: OB.accent, color: '#0b0f1a', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{step.ctaLabel} →</button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/*══════════════════════════════════════════════════════
  CREATOR DISCOVERY — Browse creators, video grid, launch flow
══════════════════════════════════════════════════════*/
function CreatorDiscoveryView({ brand, profile, setBrandTab, isDemo, exitDemo, demoCreators }) {
  const OB = { bgCard: '#111827', bgCardHover: '#1a2236', borderDim: 'rgba(255,255,255,0.06)', accent: '#00e0b4', orange: '#ff9f43', textPrimary: '#f0f2f5', textSecondary: '#8b95a8', textDim: '#5a6478', success: '#34d399' };

  const [scan, setScan] = useState(null);
  const [loadingScan, setLoadingScan] = useState(!demoCreators);
  const [scanError, setScanError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [productUrl, setProductUrl] = useState('');
  const [selectedCreator, setSelectedCreator] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [playingVideo, setPlayingVideo] = useState(null);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [launchStep, setLaunchStep] = useState(1);
  const [launchForm, setLaunchForm] = useState({ adCopy: '', objective: 'CONVERSIONS', dailyBudget: 50, audience: 'US, 18-65, Broad', duration: '7', productTitle: '' });
  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState(null);

  const hasMeta = !!(profile && profile.hasMetaToken);

  const fetchScan = useCallback(() => {
    if (demoCreators || !brand?.id) return;
    setLoadingScan(true);
    setScanError(null);
    fetch('/api/status?brandId=' + encodeURIComponent(brand.id)).then(r => r.json()).then(d => {
      setScan(d.hasScan ? d : null);
      setLoadingScan(false);
    }).catch(() => { setLoadingScan(false); setScanError('Failed to load'); });
  }, [brand?.id, demoCreators]);

  useEffect(() => { if (demoCreators) { setScan({ qualified: [] }); setLoadingScan(false); } else { fetchScan(); } }, [fetchScan, demoCreators]);

  const runScan = async () => {
    if (!productUrl.trim()) return;
    setScanning(true);
    setScanError(null);
    try {
      const r = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scrapeKey: KEYS.scrape, productUrl: productUrl.trim(), brandId: brand.id }) });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setScan(d);
      setProductUrl('');
    } catch (e) { setScanError(e.message); }
    setScanning(false);
  };

  const allVideos = [...(scan?.qualified || []), ...(scan?.filtered || [])];
  const creatorsFromScan = useMemo(() => {
    const byHandle = new Map();
    allVideos.forEach(v => {
      const key = (v.handle || v.creator || 'unknown').toLowerCase();
      if (!byHandle.has(key)) byHandle.set(key, { handle: v.handle || '@' + (v.creator || 'creator'), creator: v.creator, videos: [], bestScore: 0, totalViews: 0 });
      const c = byHandle.get(key);
      c.videos.push(v);
      c.bestScore = Math.max(c.bestScore, v.ai_score || 0);
      c.totalViews += v.views || 0;
    });
    return [...byHandle.values()].sort((a, b) => b.bestScore - a.bestScore);
  }, [allVideos]);
  const creators = demoCreators || creatorsFromScan;

  const currentCreator = selectedCreator !== null ? creators[selectedCreator] : null;
  const videos = currentCreator ? currentCreator.videos : [];
  useEffect(() => { if (creators.length && selectedCreator === null) setSelectedCreator(0); }, [creators.length, selectedCreator]);
  useEffect(() => { setSelectedVideo(null); setPlayingVideo(null); }, [selectedCreator]);

  const openLaunch = (video) => {
    setSelectedVideo(video);
    const title = scan?.product?.title || 'Product';
    setLaunchForm(f => ({ ...f, adCopy: title + ' — limited time offer.', productTitle: title }));
    setLaunchOpen(true);
    setLaunchStep(1);
    setLaunchResult(null);
  };

  const doLaunch = async () => {
    if (!selectedVideo || !brand?.id) return;
    setLaunching(true);
    setLaunchResult(null);
    try {
      const r = await fetch('/api/launch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoId: selectedVideo.id, dailyBudget: launchForm.dailyBudget, brandId: brand.id }) });
      const d = await r.json();
      setLaunchResult(d.success ? { success: true, ...d } : { success: false, error: d.error });
      if (d.success) { fetchScan(); }
    } catch (e) { setLaunchResult({ success: false, error: e.message }); }
    setLaunching(false);
  };

  const closeLaunch = () => { setLaunchOpen(false); setSelectedVideo(null); setLaunchStep(1); setLaunchResult(null); };

  if (loadingScan) {
    return <div className="fu" style={{padding:40,textAlign:"center"}}><div style={{fontSize:14,color:C.sub}}>Loading creators...</div><div style={{marginTop:16,width:32,height:32,border:"2px solid "+C.border,borderTopColor:C.teal,borderRadius:"50%",animation:"pulse 1s infinite",margin:"0 auto"}}/></div>;
  }

  if (!scan || creators.length === 0) {
    if (scan && creators.length === 0) {
      return <div className="fu">
        <h1 className="heading-h3" style={{fontSize:24,fontWeight:800,marginBottom:24}}>Creator Discovery</h1>
        <div className="gl mobile-card" style={{padding:40,textAlign:"center"}}>
          <div style={{fontSize:32,marginBottom:12}}>🔍</div>
          <div style={{fontSize:15,fontWeight:600,marginBottom:6}}>No creators found for this product</div>
          <div style={{fontSize:13,color:C.dim,marginBottom:20}}>Try a different TikTok Shop product URL.</div>
          <button onClick={()=>setScan(null)} style={{...btnStyle,background:C.teal,color:C.bg}}>Run new scan</button>
        </div>
      </div>;
    }
    return <div className="fu">
      <h1 className="heading-h3" style={{fontSize:24,fontWeight:800,marginBottom:24}}>Creator Discovery</h1>
      <div className="gl mobile-card" style={{padding:32,maxWidth:480}}>
        <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>Discover creators for your products</div>
        <div style={{fontSize:13,color:C.sub,lineHeight:1.5,marginBottom:20}}>Paste your TikTok Shop product URL to scan for creators and videos featuring your product.</div>
        <input placeholder="https://www.tiktok.com/shop/product/..." value={productUrl} onChange={e=>setProductUrl(e.target.value)} style={{...inputStyle,marginBottom:12}} />
        <button onClick={runScan} disabled={scanning} style={{...btnStyle,background:C.teal,color:C.bg,opacity:scanning?0.7:1}}>{scanning?'Scanning...':'Scan for Creators'}</button>
        {scanError&&<div style={{color:C.coral,fontSize:13,marginTop:12}}>{scanError}</div>}
      </div>
    </div>;
  }

  return <div className="fu" style={{display:"flex",flexDirection:"column",height:"100%",minHeight:500}}>
    <h1 className="heading-h3" style={{fontSize:24,fontWeight:800,marginBottom:20}}>Creator Discovery</h1>

    <div style={{display:"flex",flex:1,minHeight:0,gap:0,flexDirection:"column"}} className="creators-discovery-layout">
      <div style={{display:"flex",flex:1,minHeight:0,gap:0}}>
        {/* Left — Creator list (35%) */}
        <div style={{width:"35%",minWidth:180,maxWidth:280,borderRight:"1px solid "+C.border,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{padding:"12px 14px",fontSize:11,fontWeight:700,color:C.dim,textTransform:"uppercase",borderBottom:"1px solid "+C.border}}>Creators</div>
          <div style={{flex:1,overflowY:"auto"}}>
            {creators.map((c,i)=>(
              <div key={i} onClick={()=>setSelectedCreator(i)} style={{padding:"12px 14px",cursor:"pointer",borderLeft:selectedCreator===i?"3px solid "+OB.accent:"3px solid transparent",background:selectedCreator===i?OB.bgCardHover:"transparent",borderBottom:"1px solid "+OB.borderDim}}>
                <div style={{fontSize:14,fontWeight:700,color:OB.textPrimary}}>{c.handle}</div>
                <div style={{fontSize:11,color:OB.textDim,marginTop:2}}>{c.videos.length} videos · {fN(c.totalViews)} views</div>
                {c.bestScore>0&&<span style={{display:"inline-block",marginTop:4,fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:4,background:(c.bestScore>=85?OB.success:c.bestScore>=70?OB.orange:C.coral)+"20",color:c.bestScore>=85?OB.success:c.bestScore>=70?OB.orange:C.coral}}>Score {c.bestScore}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Right — Creator detail + video grid (65%) */}
        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflow:"hidden"}}>
          {!currentCreator?<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:C.dim,fontSize:14}}>Select a creator</div>:
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{padding:"16px 20px",borderBottom:"1px solid "+C.border,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
              <div>
                <div style={{fontSize:20,fontWeight:800,color:OB.textPrimary}}>{currentCreator.handle}</div>
                <div style={{fontSize:12,color:OB.textDim,marginTop:4}}>{currentCreator.videos.length} videos · {fN(currentCreator.totalViews)} views</div>
              </div>
              {currentCreator.handle&&<a href={"https://www.tiktok.com/"+String(currentCreator.handle).replace(/^@/,"")} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:OB.accent,fontWeight:600}}>TikTok profile ↗</a>}
            </div>

            <div style={{flex:1,overflowY:"auto",padding:20}}>
              {videos.length===0?<div style={{color:C.dim,fontSize:14}}>Videos processing...</div>:
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:16}}>
                {videos.map((v,i)=>(
                  <div key={v.id} className="gl" style={{borderRadius:8,overflow:"hidden",background:OB.bgCard,border:"1px solid "+OB.borderDim}}>
                    <div style={{aspectRatio:"16/9",background:v.cover?undefined:`linear-gradient(${135+i*20}deg, ${C.teal}, #2dd4a0)`,position:"relative",cursor:"pointer"}} onClick={()=>setPlayingVideo(playingVideo===v.id?null:v.id)}>
                      {v.cover?<img src={v.cover} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(0,0,0,.6)",fontSize:32}}>▶</div>}
                      <div style={{position:"absolute",bottom:6,right:6,fontSize:10,fontWeight:700,background:"rgba(0,0,0,.7)",padding:"2px 6px",borderRadius:4}}>{typeof v.duration==='number'?Math.floor(v.duration/1000)+'s':(v.duration||'—')}</div>
                      <div style={{position:"absolute",bottom:6,left:6,fontSize:10,background:"rgba(0,0,0,.7)",padding:"2px 6px",borderRadius:4}}>{fN(v.views||0)} views</div>
                    </div>
                    {playingVideo===v.id&&(
                      <div style={{padding:12,borderTop:"1px solid "+OB.borderDim}}>
                        {v.content_url?<video src={v.content_url} controls autoPlay muted playsInline style={{width:"100%",maxHeight:200,borderRadius:6}} />:<div style={{width:"100%",aspectRatio:"16/9",maxHeight:200,borderRadius:6,background:C.bg2,display:"flex",alignItems:"center",justifyContent:"center",color:C.dim}}>Demo video</div>}
                        <button onClick={()=>openLaunch(v)} style={{width:"100%",marginTop:10,padding:"12px",background:OB.accent,color:"#0b0f1a",border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Launch as Ad →</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>}
            </div>
          </div>}
        </div>
      </div>
    </div>

    {/* Launch slide-over */}
    {launchOpen&&<div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",justifyContent:"flex-end"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.6)"}} onClick={closeLaunch}/>
      <div className="fu" style={{width:480,maxWidth:"100%",background:C.bg2,borderLeft:"1px solid "+C.border,overflowY:"auto",boxShadow:"-8px 0 32px rgba(0,0,0,.4)"}}>
        <div style={{padding:24,borderBottom:"1px solid "+C.border,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:16,fontWeight:800}}>Launch Campaign</div>
          <button onClick={closeLaunch} style={{background:"none",border:"none",color:C.sub,fontSize:18,cursor:"pointer"}}>×</button>
        </div>
        <div style={{padding:24}}>
          <div style={{fontSize:12,color:C.dim,marginBottom:16}}>Step {launchStep} of 3</div>
          {launchResult?(
            <div>
              {launchResult.success?<div><div style={{fontSize:18,fontWeight:700,color:OB.success,marginBottom:8}}>✓ Campaign launched</div><div style={{fontSize:13,color:C.sub,marginBottom:16}}>Campaign ID: {launchResult.ids?.campaign}</div><button onClick={()=>{setBrandTab("campaigns");closeLaunch()}} style={{...btnStyle,background:OB.accent,color:"#0b0f1a"}}>View in Campaigns →</button></div>:
              <div><div style={{fontSize:16,fontWeight:700,color:C.coral,marginBottom:8}}>Launch failed</div><div style={{fontSize:13,color:C.sub,marginBottom:16}}>{launchResult.error}</div><button onClick={()=>{setLaunchResult(null);doLaunch()}} style={{...btnStyle,background:C.coral,color:C.bg}}>Retry</button></div>}
            </div>
          ):launchStep===1?(
            <div>
              {selectedVideo&&<div style={{display:"flex",gap:16,marginBottom:16}}><div style={{width:80,height:110,borderRadius:8,overflow:"hidden",background:C.bg}}>{selectedVideo.cover?<img src={selectedVideo.cover} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}>▶</div>}</div><div><div style={{fontWeight:700}}>{selectedVideo.handle||selectedVideo.creator}</div><div style={{fontSize:12,color:C.dim}}>{fN(selectedVideo.views)} views</div></div></div>}
              <label style={{fontSize:11,color:C.dim,display:"block",marginBottom:6}}>Ad copy</label>
              <textarea value={launchForm.adCopy} onChange={e=>setLaunchForm(f=>({...f,adCopy:e.target.value}))} rows={3} style={{...inputStyle,marginBottom:16}} placeholder="Ad headline and description" />
              <button onClick={()=>setLaunchStep(2)} style={{...btnStyle,background:OB.accent,color:"#0b0f1a"}}>Next →</button>
            </div>
          ):launchStep===2?(
            <div>
              <label style={{fontSize:11,color:C.dim,display:"block",marginBottom:6}}>Objective</label>
              <select value={launchForm.objective} onChange={e=>setLaunchForm(f=>({...f,objective:e.target.value}))} style={{...inputStyle,marginBottom:12}}><option value="CONVERSIONS">Conversions</option><option value="TRAFFIC">Traffic</option><option value="ENGAGEMENT">Engagement</option></select>
              <label style={{fontSize:11,color:C.dim,display:"block",marginBottom:6}}>Daily budget ($)</label>
              <input type="number" value={launchForm.dailyBudget} onChange={e=>setLaunchForm(f=>({...f,dailyBudget:+e.target.value||50}))} min={10} style={{...inputStyle,marginBottom:12}} />
              <label style={{fontSize:11,color:C.dim,display:"block",marginBottom:6}}>Audience</label>
              <div style={{fontSize:13,color:C.sub,marginBottom:12}}>{launchForm.audience} <span style={{color:C.dim}}>— defaults</span></div>
              <label style={{fontSize:11,color:C.dim,display:"block",marginBottom:6}}>Duration</label>
              <select value={launchForm.duration} onChange={e=>setLaunchForm(f=>({...f,duration:e.target.value}))} style={{...inputStyle,marginBottom:16}}><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option><option value="ongoing">Ongoing</option></select>
              <button onClick={()=>setLaunchStep(3)} style={{...btnStyle,background:OB.accent,color:"#0b0f1a"}}>Review & Launch →</button>
            </div>
          ):!hasMeta?(
            <div>
              <div style={{padding:20,background:C.coral+"12",border:"1px solid "+C.coral+"30",borderRadius:12,marginBottom:16}}>
                <div style={{fontSize:15,fontWeight:700,color:C.coral,marginBottom:8}}>Connect Meta API first</div>
                <div style={{fontSize:13,color:C.sub,marginBottom:16}}>Add your Meta Ads credentials in Settings to launch campaigns.</div>
                <button onClick={()=>{closeLaunch();setBrandTab("settings")}} style={{...btnStyle,background:C.teal,color:C.bg}}>Go to Settings →</button>
              </div>
            </div>
          ):isDemo?(
            <div>
              <div style={{padding:20,background:C.orange+"15",border:"1px solid "+C.orange+"40",borderRadius:12,marginBottom:16}}>
                <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:8}}>This is a demo</div>
                <div style={{fontSize:13,color:C.sub,marginBottom:16}}>Like what you see? Sign up to launch real campaigns.</div>
                <button onClick={()=>{closeLaunch();exitDemo&&exitDemo({ openSignUp: true })}} style={{...btnStyle,width:"100%",background:C.teal,color:"#0b0f1a",padding:12}}>Sign Up →</button>
              </div>
            </div>
          ):(
            <div>
              <div className="gl" style={{padding:16,marginBottom:16}}>
                <div style={{display:"flex",gap:12,marginBottom:12}}><div style={{width:60,height:80,borderRadius:6,overflow:"hidden"}}>{selectedVideo?.cover?<img src={selectedVideo.cover} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:null}</div><div><div style={{fontWeight:700}}>{selectedVideo?.handle||selectedVideo?.creator}</div><div style={{fontSize:12,color:C.dim}}>{launchForm.productTitle}</div></div></div>
                <div style={{fontSize:12,color:C.dim}}>Budget: ${launchForm.dailyBudget}/day · {(launchForm.duration==="ongoing"?"Ongoing":launchForm.duration+" days")}</div>
                <div style={{fontSize:14,fontWeight:700,color:OB.orange,marginTop:8}}>Est. spend: ${launchForm.dailyBudget*(launchForm.duration==="ongoing"?30:+launchForm.duration)}</div>
              </div>
              <button onClick={doLaunch} disabled={launching} style={{...btnStyle,width:"100%",background:OB.accent,color:"#0b0f1a",padding:14}}>{launching?"Launching...":"Launch Campaign"}</button>
            </div>
          )}
        </div>
      </div>
    </div>}
  </div>;
}

/*══════════════════════════════════════════════════════
  CAMPAIGNS TAB — Performance dashboard
══════════════════════════════════════════════════════*/
function CampaignsTab({ campaigns, loading, error, setBrandTab, refresh, adAccount, isDemo, exitDemo, setCampaigns }) {
  const [filter, setFilter] = useState('all');
  const [menuOpen, setMenuOpen] = useState(null);
  useEffect(() => { if (!menuOpen) return; const h = () => setMenuOpen(null); setTimeout(() => document.addEventListener('click', h), 0); return () => document.removeEventListener('click', h); }, [menuOpen]);

  const togglePause = (c) => {
    if (!isDemo || !setCampaigns) return;
    setCampaigns(prev => prev.map(x => x.id === c.id ? { ...x, status: x.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' } : x));
  };

  const filtered = campaigns.filter(c => {
    const s = (c.status || '').toUpperCase();
    if (filter === 'all') return true;
    if (filter === 'active') return s === 'ACTIVE';
    if (filter === 'paused') return s === 'PAUSED';
    if (filter === 'completed') return s === 'ARCHIVED' || s === 'DELETED' || s === 'COMPLETED';
    return true;
  });

  const fmtDate = (d) => {
    if (!d) return '—';
    try { const x = new Date(d); return x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (_) { return d.slice?.(0, 10) || '—'; }
  };
  const creatorHandle = (c) => c.creator ? '@' + String(c.creator).replace(/^@/, '') : '—';
  const actId = (adAccount || 'act_132555948').replace(/^act_/, '');
  const metaAdsUrl = () => 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=' + actId;

  if (loading) return <div className="fu" style={{padding:40}}><div style={{fontSize:14,color:C.sub}}>Loading campaigns...</div></div>;
  if (error) return <div className="fu" style={{padding:24}}><div style={{color:C.error,fontSize:14,marginBottom:16}}>{error}</div><button onClick={refresh} style={{...btnStyle,background:C.teal,color:C.bg}}>Retry</button></div>;

  if (campaigns.length === 0) {
    return <div className="fu">
      <h1 className="heading-h3" style={{fontSize:24,fontWeight:800,marginBottom:24}}>Campaigns</h1>
      <div className="gl mobile-card" style={{padding:48,textAlign:"center",maxWidth:440,margin:"0 auto"}}>
        <div style={{fontSize:48,marginBottom:16}}>🚀</div>
        <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>No campaigns yet</div>
        <div style={{fontSize:14,color:C.sub,lineHeight:1.5,marginBottom:24}}>Launch your first campaign from the Creators tab — find a creator, pick a video, and go live in one click.</div>
        <button onClick={()=>setBrandTab("creators")} style={{...btnStyle,background:C.teal,color:C.bg,padding:"12px 24px",fontSize:14}}>Browse Creators →</button>
      </div>
    </div>;
  }

  return <div className="fu">
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:16,marginBottom:24}}>
      <h1 className="heading-h3" style={{fontSize:24,fontWeight:800,margin:0}}>Campaigns</h1>
      <button onClick={()=>setBrandTab("creators")} style={{...btnStyle,background:C.teal,color:C.bg,padding:"10px 20px",fontSize:14}}>New Campaign +</button>
    </div>
    <div style={{display:"flex",gap:8,marginBottom:24,flexWrap:"wrap"}}>
      {['all','active','paused','completed'].map(f=>(
        <button key={f} onClick={()=>setFilter(f)} style={{padding:"8px 16px",background:filter===f?C.teal+"20":'transparent',border:"1px solid "+(filter===f?C.teal:C.border),borderRadius:20,color:filter===f?C.teal:C.sub,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textTransform:"capitalize"}}>{f}</button>
      ))}
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {filtered.map((c,i)=>{
        const spend = c.insights?.spend != null ? parseFloat(c.insights.spend) : null;
        const impressions = c.insights?.impressions != null ? parseInt(c.insights.impressions) : null;
        const clicks = c.insights?.clicks != null ? parseInt(c.insights.clicks) : null;
        const roasArr = c.insights?.purchase_roas;
        const roasVal = roasArr?.[0]?.value ? parseFloat(roasArr[0].value) : null;
        const s = (c.status || '').toUpperCase();
        const statusLabel = s === 'ACTIVE' ? 'Active' : s === 'PAUSED' ? 'Paused' : s === 'ARCHIVED' ? 'Completed' : s || '—';
        const statusColor = s === 'ACTIVE' ? C.success : s === 'PAUSED' ? C.orange : C.dim;
        const roasColor = roasVal != null ? (roasVal >= 2 ? C.teal : roasVal >= 1 ? C.orange : C.error) : C.sub;
        const trend = roasVal != null ? (roasVal >= 2 ? '↑' : roasVal >= 1 ? '→' : '↓') : '—';
        const trendColor = trend === '↑' ? C.success : trend === '↓' ? C.error : C.dim;
        return (
          <div key={c.id||i} className="gl mobile-card" style={{padding:20,display:"flex",flexWrap:"wrap",gap:16,alignItems:"center"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>{c.name || c.creator || 'Campaign'}</div>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span style={{fontSize:12,color:C.teal,fontWeight:600}}>{creatorHandle(c)}</span>
                <span style={{fontSize:11,padding:"2px 8px",borderRadius:6,background:statusColor+"20",color:statusColor,display:"inline-flex",alignItems:"center",gap:4}}>
                  {s==='ACTIVE'&&<span style={{width:6,height:6,borderRadius:"50%",background:statusColor}}/>}{statusLabel}
                </span>
                <span style={{fontSize:11,color:C.dim}}>Launched {fmtDate(c.created_time || c.launchedAt)}</span>
              </div>
            </div>
            <div className="campaign-metrics-row" style={{display:"flex",gap:24,flexWrap:"wrap"}}>
              <div><div style={{fontSize:11,color:C.dim,marginBottom:2}}>Spend</div><div className="mono" style={{fontSize:15,fontWeight:700,color:C.text}}>{spend != null ? '$' + parseFloat(spend).toFixed(2) : '—'}</div></div>
              <div><div style={{fontSize:11,color:C.dim,marginBottom:2}}>Impressions</div><div className="mono" style={{fontSize:15,fontWeight:700,color:C.text}}>{impressions != null ? fN(impressions) : '—'}</div></div>
              <div><div style={{fontSize:11,color:C.dim,marginBottom:2}}>Clicks</div><div className="mono" style={{fontSize:15,fontWeight:700,color:C.text}}>{clicks != null ? clicks.toLocaleString() : '—'}</div></div>
              <div><div style={{fontSize:11,color:C.dim,marginBottom:2}}>ROAS</div><div className="mono" style={{fontSize:15,fontWeight:700,color:roasColor}}>{roasVal != null ? roasVal.toFixed(1) + '×' : '—'}</div></div>
              <div><div style={{fontSize:11,color:C.dim,marginBottom:2}}>Trend</div><div style={{fontSize:15,fontWeight:700,color:trendColor}}>{trend}</div></div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <button onClick={()=>isDemo&&togglePause(c)} style={{...btnStyle,background:"transparent",border:"1px solid "+C.border,color:C.text,padding:"8px 14px",fontSize:12}}>{s==='ACTIVE'?'Pause':'Resume'}</button>
              <div style={{position:"relative"}}>
                <button onClick={e=>{e.stopPropagation();setMenuOpen(menuOpen===c.id?null:c.id)}} style={{...btnStyle,background:"transparent",border:"none",padding:"6px 10px",color:C.sub,fontSize:16}}>⋮</button>
                {menuOpen===c.id&&<div onClick={e=>e.stopPropagation()} style={{position:"absolute",right:0,top:32,zIndex:50,minWidth:200,background:C.bg2,border:"1px solid "+C.border,borderRadius:8,boxShadow:"0 8px 24px rgba(0,0,0,.4)",padding:8}}>
                  {isDemo?<div style={{padding:10}}><div style={{fontSize:12,color:C.dim,marginBottom:8}}>Demo — sign up to manage real campaigns.</div><button onClick={()=>{setMenuOpen(null);exitDemo&&exitDemo({ openSignUp: true })}} style={{...btnStyle,width:"100%",background:C.teal,color:C.bg,fontSize:12,padding:"8px 12px"}}>Sign Up for Free →</button></div>:<><a href={metaAdsUrl()} target="_blank" rel="noopener noreferrer" style={{display:"block",padding:"10px 12px",fontSize:13,color:C.text,textDecoration:"none",borderRadius:6}}>View in Meta Ads Manager ↗</a><button style={{display:"block",width:"100%",padding:"10px 12px",fontSize:13,color:C.text,background:"none",border:"none",textAlign:"left",cursor:"pointer",fontFamily:"inherit",borderRadius:6}}>Duplicate</button><button style={{display:"block",width:"100%",padding:"10px 12px",fontSize:13,color:C.error,background:"none",border:"none",textAlign:"left",cursor:"pointer",fontFamily:"inherit",borderRadius:6}}>End Campaign</button></>}
                </div>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
    {filtered.length === 0 && <div style={{color:C.dim,fontSize:14}}>No campaigns match this filter.</div>}
    <div style={{fontSize:11,color:C.dim,marginTop:16}}>Performance data syncs from Meta every hour.</div>
  </div>;
}

/*══════════════════════════════════════════════════════
  SETTINGS TAB — Connection flows + brand profile
══════════════════════════════════════════════════════*/
function SettingsTab({ brand, profile, brandSettings, setBrandSettings, logout, refreshProfile, isDemo, exitDemo }) {
  const [metaMsg, setMetaMsg] = useState(null);
  const [tiktokMsg, setTiktokMsg] = useState(null);
  const demoGate = isDemo && <div style={{marginTop:12,padding:12,background:C.orange+"15",borderRadius:8,border:"1px solid "+C.orange+"30"}}><div style={{fontSize:13,color:C.sub,marginBottom:8}}>Like what you see? Sign up to connect your own accounts.</div><button onClick={()=>exitDemo&&exitDemo({ openSignUp: true })} style={{...btnStyle,background:C.teal,color:C.bg,fontSize:12}}>Sign Up for Free →</button></div>;
  const [profileMsg, setProfileMsg] = useState(null);

  const handleMetaConnect = async () => {
    setMetaMsg(null);
    const res = await fetch('/api/brand/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: brand.email, metaToken: brandSettings.metaToken || undefined, adAccount: brandSettings.adAccount || undefined, pageId: brandSettings.pageId || undefined }) });
    const d = await res.json();
    if (d.success) { setMetaMsg({ ok: true, text: 'Connected successfully' }); setBrandSettings(p => ({ ...p, metaToken: '' })); refreshProfile(); }
    else { setMetaMsg({ ok: false, text: d.error || 'Failed to connect' }); }
  };

  const handleTiktokConnect = async () => {
    setTiktokMsg(null);
    const res = await fetch('/api/brand/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: brand.email, storeName: brandSettings.storeName }) });
    const d = await res.json();
    if (d.success) { setTiktokMsg({ ok: true, text: 'Store connected' }); refreshProfile(); }
    else { setTiktokMsg({ ok: false, text: d.error || 'Failed to connect' }); }
  };

  const handleProfileSave = async () => {
    setProfileMsg(null);
    const res = await fetch('/api/brand/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: brand.email, brandName: brandSettings.brandName, storeName: brandSettings.storeName }) });
    const d = await res.json();
    if (d.success) { setProfileMsg({ ok: true, text: 'Saved' }); refreshProfile(); }
    else { setProfileMsg({ ok: false, text: d.error || 'Failed to save' }); }
  };

  const handleTiktokDisconnect = async () => {
    setTiktokMsg(null);
    const res = await fetch('/api/brand/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: brand.email, storeName: '' }) });
    const d = await res.json();
    if (d.success) { setBrandSettings(p => ({ ...p, storeName: '' })); refreshProfile(); }
    else { setTiktokMsg({ ok: false, text: d.error }); }
  };

  const storeDisplay = stripAt(profile.storeName || brand.storeName || brandSettings.storeName);
  const hasTiktok = !!storeDisplay;
  const hasMeta = !!(profile.hasMetaToken || brandSettings.metaToken);

  return <div className="fu">
    <h1 className="heading-h3" style={{fontSize:24,fontWeight:800,marginBottom:24}}>Settings</h1>

    {/* Section 1: TikTok Shop */}
    <div className="gl mobile-card" style={{background:'#111827',border:'1px solid '+C.border,borderRadius:16,padding:24,marginBottom:20}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
        <div style={{width:40,height:40,borderRadius:10,background:'rgba(0,0,0,.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>🎵</div>
        <h3 style={{color:C.text,margin:0,fontSize:17}}>TikTok Shop Connection</h3>
      </div>
      {!hasTiktok ? (
        <>
          <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>Connect TikTok Shop</div>
          <p style={{fontSize:13,color:C.sub,lineHeight:1.5,marginBottom:16}}>Link your TikTok Seller Center to discover creators already selling your products. We'll pull your store catalog and sync affiliate data.</p>
          <input placeholder="TikTok Shop URL or store handle" value={brandSettings.storeName||''} onChange={e=>!isDemo&&setBrandSettings(p=>({...p,storeName:stripAt(e.target.value)}))} readOnly={isDemo} style={{...inputStyle,marginBottom:12}} />
          {!isDemo&&<button onClick={handleTiktokConnect} style={{...btnStyle,background:C.teal,color:C.bg}}>Connect</button>}
        </>
      ) : (
        <div>
          <div className="mono" style={{fontSize:14,color:C.teal,marginBottom:8}}>@{storeDisplay}</div>
          <span style={{fontSize:12,padding:'4px 10px',borderRadius:6,background:C.success+'20',color:C.success,fontWeight:600}}>Connected</span>
          <div style={{fontSize:11,color:C.dim,marginTop:12}}>Last synced: —</div>
          {isDemo ? demoGate : <button onClick={handleTiktokDisconnect} style={{background:'none',border:'none',color:C.error,fontSize:12,cursor:'pointer',fontFamily:'inherit',marginTop:12}}>Disconnect</button>}
        </div>
      )}
      {tiktokMsg&&<div style={{marginTop:12,fontSize:13,color:tiktokMsg.ok?C.success:C.error}}>{tiktokMsg.text}</div>}
    </div>

    {/* Section 2: Meta Ads */}
    <div className="gl mobile-card" style={{background:'#111827',border:'1px solid '+C.border,borderRadius:16,padding:24,marginBottom:20}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
        <div style={{width:40,height:40,borderRadius:10,background:'rgba(0,0,0,.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>📊</div>
        <h3 style={{color:C.text,margin:0,fontSize:17}}>Meta Ads Connection</h3>
      </div>
      {!hasMeta ? (
        <>
          <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>Connect Meta Ads</div>
          <p style={{fontSize:13,color:C.sub,lineHeight:1.5,marginBottom:16}}>Connect your Meta Ad Account so Creatorship can create and manage campaigns on your behalf. We need your Ad Account ID and Page ID.</p>
          <label style={{fontSize:11,color:C.dim,display:'block',marginBottom:4}}>Ad Account ID</label>
          <input placeholder="act_XXXXXXXXX" value={brandSettings.adAccount||''} onChange={e=>!isDemo&&setBrandSettings(p=>({...p,adAccount:e.target.value}))} readOnly={isDemo} style={{...inputStyle,marginBottom:12}} />
          <label style={{fontSize:11,color:C.dim,display:'block',marginBottom:4}}>Page ID</label>
          <input placeholder="Page ID" value={brandSettings.pageId||''} onChange={e=>!isDemo&&setBrandSettings(p=>({...p,pageId:e.target.value}))} readOnly={isDemo} style={{...inputStyle,marginBottom:12}} />
          <label style={{fontSize:11,color:C.dim,display:'block',marginBottom:4}}>Access Token</label>
          <input type="password" placeholder="Meta Access Token" value={brandSettings.metaToken||''} onChange={e=>!isDemo&&setBrandSettings(p=>({...p,metaToken:e.target.value}))} readOnly={isDemo} style={{...inputStyle,marginBottom:12}} />
          <div style={{fontSize:11,color:C.dim,marginBottom:16}}>Find these in <a href="https://business.facebook.com" target="_blank" rel="noopener noreferrer" style={{color:C.teal}}>Meta Business Suite</a></div>
          {!isDemo&&<button onClick={handleMetaConnect} style={{...btnStyle,background:C.teal,color:C.bg}}>Connect & Verify</button>}
        </>
      ) : (
        <div>
          <div className="mono" style={{fontSize:13,color:C.sub,marginBottom:8}}>{(brandSettings.adAccount||profile.adAccount||brand?.adAccount||'').replace(/(.{4}).*(.{4})/,'$1•••$2')}</div>
          <span style={{fontSize:12,padding:'4px 10px',borderRadius:6,background:C.success+'20',color:C.success,fontWeight:600}}>Connected</span>
          <div style={{fontSize:11,color:C.dim,marginTop:12}}>Last verified: —</div>
          {isDemo ? demoGate : <button style={{background:'none',border:'none',color:C.error,fontSize:12,cursor:'pointer',fontFamily:'inherit',marginTop:12}}>Disconnect</button>}
        </div>
      )}
      {metaMsg&&<div style={{marginTop:12,fontSize:13,color:metaMsg.ok?C.success:C.error}}>{metaMsg.text}</div>}
    </div>

    {/* Section 3: Brand Profile */}
    <div className="gl mobile-card" style={{background:'#111827',border:'1px solid '+C.border,borderRadius:16,padding:24,marginBottom:20}}>
      <h3 style={{color:C.text,margin:0,marginBottom:16,fontSize:17}}>Brand Profile</h3>
      <label style={{fontSize:11,color:C.dim,display:'block',marginBottom:4}}>Store display name</label>
      <input placeholder="Your brand or store name" value={brandSettings.brandName||''} onChange={e=>!isDemo&&setBrandSettings(p=>({...p,brandName:e.target.value}))} readOnly={isDemo} style={{...inputStyle,marginBottom:12}} />
      <label style={{fontSize:11,color:C.dim,display:'block',marginBottom:4}}>Contact email</label>
      <div style={{fontSize:14,color:C.sub,marginBottom:16}}>{brand.email}</div>
      {isDemo ? demoGate : <><button onClick={handleProfileSave} style={{...btnStyle,background:C.teal,color:C.bg}}>Save Changes</button>{profileMsg&&<div style={{marginTop:12,fontSize:13,color:profileMsg.ok?C.success:C.error}}>{profileMsg.text}</div>}</>}
    </div>

    {/* Section 4: Billing placeholder */}
    <div className="gl mobile-card" style={{background:'#111827',border:'1px solid '+C.border,borderRadius:16,padding:24,marginBottom:20}}>
      <h3 style={{color:C.text,margin:0,marginBottom:12,fontSize:17}}>Billing & Plan</h3>
      <p style={{fontSize:14,color:C.sub,lineHeight:1.5,marginBottom:16}}>You're on the <strong style={{color:C.text}}>Starter</strong> plan. Creatorship takes 4% of ad spend managed through the platform.</p>
      <button disabled style={{...btnStyle,background:C.dim,color:C.sub,opacity:0.7,cursor:'not-allowed'}}>Upgrade (coming soon)</button>
    </div>

    {/* Account / Logout */}
    <div className="gl mobile-card" style={{background:'#111827',border:'1px solid '+C.border,borderRadius:16,padding:24}}>
      <h3 style={{color:C.text,margin:0,marginBottom:16,fontSize:17}}>Account</h3>
      <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Email</div>
      <div style={{fontSize:14,color:C.sub,marginBottom:16}}>{brand.email}</div>
      <button onClick={logout} style={{...btnStyle,background:C.error,color:C.bg}}>Logout</button>
    </div>
  </div>;
}

function BrandDashboardView({ brand, setBrand, nav, isDemo, exitDemo }) {
  const [brandTab, setBrandTab] = useState('overview');
  const [profile, setProfile] = useState(brand);
  const [brandSettings, setBrandSettings] = useState(() => isDemo ? { adAccount: brand.adAccount || '', pageId: brand.pageId || '', brandName: 'GlowUp Skincare', storeName: brand.storeDisplay || '' } : { metaToken: '', adAccount: '', pageId: '', brandName: '', storeName: '' });
  const [creators, setCreators] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [campError, setCampError] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingCreators, setLoadingCreators] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  const refreshProfile = useCallback(() => {
    if (isDemo) return;
    setLoadingProfile(true);
    fetch('/api/brand/me?email=' + encodeURIComponent(brand.email)).then(r => r.json()).then(d => {
      if (d.error) return;
      setProfile(d);
      setBrandSettings(p => ({ ...p, adAccount: d.adAccount || '', pageId: d.pageId || '', brandName: d.brandName || '', storeName: stripAt(d.storeName || '') }));
      const updated = { ...brand, ...d };
      localStorage.setItem(BRAND_STORAGE, JSON.stringify(updated));
      setBrand(updated);
    }).finally(() => setLoadingProfile(false));
  }, [brand.email, setBrand, isDemo]);

  useEffect(() => { if (isDemo) { setProfile(brand); setCreators(DEMO_CREATORS); setCampaigns(DEMO_CAMPAIGNS); } else { refreshProfile(); } }, [brand.id, isDemo]);

  useEffect(() => {
    if (isDemo) return;
    setLoadingCreators(true);
    fetch('/api/creators').then(r => r.json()).then(d => { setCreators(Array.isArray(d) ? d : []); setLoadingCreators(false); }).catch(() => setLoadingCreators(false));
  }, [isDemo]);

  const refreshCampaigns = useCallback(() => {
    if (isDemo) return;
    setLoadingCampaigns(true); setCampError(null);
    fetch('/api/brand/campaigns?brandId=' + encodeURIComponent(brand.id)).then(r => r.json()).then(d => {
      setCampaigns(d.campaigns || []);
      setCampError(d.error || null);
      setLoadingCampaigns(false);
    }).catch(() => { setLoadingCampaigns(false); setCampError('Failed to load'); });
  }, [brand.id, isDemo]);
  useEffect(() => { if (!isDemo) refreshCampaigns(); }, [refreshCampaigns, isDemo]);

  const logout = () => { if (isDemo && exitDemo) { exitDemo(); return; } localStorage.removeItem(BRAND_STORAGE); setBrand(null); window.location.href = '/brand'; };
  const storeDisplay = stripAt(profile.storeName || brand.storeName);

  const tabs=[{id:"overview",l:"Overview",i:"🏠"},{id:"creators",l:"Creators",i:"👥"},{id:"campaigns",l:"Campaigns",i:"🚀"},{id:"settings",l:"Settings",i:"⚙️"}];
  const Sidebar = () => (
    <div className="sidebar-wrap" style={{width:200,background:C.bg2,borderRight:"1px solid "+C.border,padding:"16px 0",flexShrink:0,display:"flex",flexDirection:"column",minHeight:"100vh"}}>
      <div style={{padding:"0 16px 20px",cursor:"pointer"}} onClick={()=>nav("/")}>
        <span style={{fontSize:17,fontWeight:900,...gT(C.coral,C.gold)}}>Creator</span><span style={{fontSize:17,fontWeight:900,...gT(C.blue,C.teal)}}>ship</span>
        <div style={{fontSize:10,color:C.dim,marginTop:1}}>Brand Portal</div>
      </div>
      {tabs.map(t=>
        <div key={t.id} onClick={()=>setBrandTab(t.id)} style={{padding:"10px 16px",cursor:"pointer",fontSize:13,fontWeight:brandTab===t.id?600:400,color:brandTab===t.id?C.teal:C.sub,background:brandTab===t.id?C.teal+"06":"transparent",borderRight:brandTab===t.id?"2px solid "+C.teal:"2px solid transparent"}}>{t.i} {t.l}</div>
      )}
      <div style={{flex:1}}/>
      <div style={{padding:"10px 16px",fontSize:11,color:C.dim}}>{storeDisplay ? '@'+storeDisplay : '—'}</div>
      <div style={{padding:"8px 16px",fontSize:11,color:C.sub,cursor:"pointer"}} onClick={logout}>Logout</div>
    </div>
  );

  const BottomNav = () => (
    <div className="bottom-nav">
      {tabs.map(t=><div key={t.id} onClick={()=>setBrandTab(t.id)} style={{flex:1,textAlign:"center",padding:"8px 4px",cursor:"pointer",fontSize:11,fontWeight:brandTab===t.id?600:400,color:brandTab===t.id?C.teal:C.sub}}>{t.i}<br/>{t.l}</div>)}
    </div>
  );

  const saveBrandSettings = async () => {
    const res = await fetch('/api/brand/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: brand.email, metaToken: brandSettings.metaToken || undefined, adAccount: brandSettings.adAccount || undefined, pageId: brandSettings.pageId || undefined }) });
    const data = await res.json();
    if (data.success) { setProfile(data.brand); setBrand(prev => prev ? { ...prev, ...data.brand } : null); localStorage.setItem(BRAND_STORAGE, JSON.stringify(data.brand)); setBrandSettings(p => ({ ...p, metaToken: '' })); alert('Settings saved!'); }
    else alert(data.error || 'Failed to save');
  };

  const saveStoreSettings = async () => {
    const res = await fetch('/api/brand/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: brand.email, brandName: brandSettings.brandName, storeName: brandSettings.storeName }) });
    const data = await res.json();
    if (data.success) { setProfile(data.brand); setBrand(prev => prev ? { ...prev, ...data.brand } : null); localStorage.setItem(BRAND_STORAGE, JSON.stringify(data.brand)); refreshProfile(); alert('Store info saved!'); }
    else alert(data.error || 'Failed to save');
  };

  return <div className="bottom-gap" style={{display:"flex",flexDirection:"column",minHeight:"100vh",background:C.bg}}>
    {isDemo&&<DemoBanner onSignUp={()=>exitDemo({ openSignUp: true })} />}
    <div style={{display:"flex",flex:1,minHeight:0}}>
      <Sidebar/>
      <BottomNav/>
      <div className="content-pad" style={{flex:1,padding:"28px 36px",maxWidth:brandTab==="creators"?undefined:800,display:"flex",flexDirection:"column",minHeight:0}}>

        {brandTab==="overview"&&<BrandOverviewOnboarding profile={profile} storeDisplay={storeDisplay} creatorsCount={creators.length} campaignsCount={campaigns.length} setBrandTab={setBrandTab} />}

        {brandTab==="creators"&&<CreatorDiscoveryView brand={brand} profile={profile} setBrandTab={setBrandTab} isDemo={isDemo} exitDemo={exitDemo} demoCreators={isDemo?DEMO_CREATORS:null} />}

        {brandTab==="campaigns"&&<CampaignsTab campaigns={campaigns} loading={loadingCampaigns} error={campError} setBrandTab={setBrandTab} refresh={refreshCampaigns} adAccount={profile.adAccount || brand.adAccount} isDemo={isDemo} exitDemo={exitDemo} setCampaigns={isDemo?setCampaigns:undefined} />}

        {brandTab==="settings"&&<SettingsTab brand={brand} profile={profile} brandSettings={brandSettings} setBrandSettings={setBrandSettings} logout={logout} refreshProfile={refreshProfile} isDemo={isDemo} exitDemo={exitDemo} />}
      </div>
    </div>
  </div>;
}

function DemoBanner({ onSignUp }) {
  return <div style={{width:'100%',background:C.orange+'26',borderLeft:'4px solid '+C.orange,padding:'10px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
    <span style={{fontSize:13,color:C.text}}>You're viewing a demo account with sample data.</span>
    <button onClick={onSignUp} style={{...btnStyle,background:C.teal,color:C.bg,padding:'8px 16px',fontSize:12}}>Sign Up for Free →</button>
  </div>;
}

function BrandPortal() {
  const navigate = useNavigate();
  const nav = (p) => navigate(navPath(p));
  const [brand, setBrand] = useState(() => {
    try { const j = localStorage.getItem(BRAND_STORAGE); return j ? JSON.parse(j) : null; } catch (_) { return null; }
  });
  const [isDemo, setIsDemo] = useState(false);
  const [openSignUpAfterDemo, setOpenSignUpAfterDemo] = useState(false);
  const exitDemo = useCallback((opts) => { if (opts?.openSignUp) setOpenSignUpAfterDemo(true); setBrand(null); setIsDemo(false); }, []);
  useEffect(() => { if (!brand && openSignUpAfterDemo) setOpenSignUpAfterDemo(false); }, [brand, openSignUpAfterDemo]);
  if (brand) return <BrandDashboardView brand={brand} setBrand={setBrand} nav={nav} isDemo={isDemo} exitDemo={exitDemo} />;
  return <div className="nav-pad" style={{minHeight:"100vh",background:C.bg}}>
    <nav style={{padding:"14px 20px",display:"flex",alignItems:"center",background:"rgba(3,7,17,.9)",borderBottom:"1px solid "+C.border}}>
      <Link to="/" style={{fontSize:18,fontWeight:900,textDecoration:"none",color:"inherit"}}><span style={gT(C.coral,C.gold)}>Creator</span><span style={gT(C.blue,C.teal)}>ship</span></Link>
    </nav>
    <BrandAuthForm onSuccess={() => setBrand(JSON.parse(localStorage.getItem(BRAND_STORAGE)))} onDemo={() => { setBrand({ ...DEMO_PROFILE }); setIsDemo(true); }} initialMode={openSignUpAfterDemo ? 'signup' : 'login'} />
  </div>;
}

/*══════════════════════════════════════════════════════
  ADMIN PORTAL — password gate + full brand dashboard
══════════════════════════════════════════════════════*/
const ADMIN_STORAGE = 'creatorship_admin';

function AdminPasswordGate({ onSuccess }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(false);
  const submit = async () => {
    const r = await fetch('/api/admin/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    const d = await r.json();
    if (d.ok) { sessionStorage.setItem(ADMIN_STORAGE, '1'); onSuccess(); }
    else setErr(true);
  };
  return <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div className="gl" style={{width:360,padding:32}}>
      <h1 style={{fontSize:22,fontWeight:800,marginBottom:8}}>Admin Access</h1>
      <p style={{fontSize:13,color:C.sub,marginBottom:20}}>Enter password to continue</p>
      <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setErr(false)}}
        onKeyDown={e=>e.key==='Enter'&&submit()}
        placeholder="Password"
        style={{width:"100%",padding:"12px 16px",background:"rgba(255,255,255,.04)",border:"1px solid "+(err?C.coral:C.border),borderRadius:10,color:C.text,fontSize:14,marginBottom:12,fontFamily:"inherit"}}/>
      {err&&<div style={{color:C.coral,fontSize:13,marginBottom:12}}>Incorrect password</div>}
      <button onClick={submit} style={{width:"100%",padding:"14px",background:C.teal,color:C.bg,border:"none",borderRadius:10,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Enter</button>
    </div>
  </div>;
}

function AdminPortal() {
  const navigate = useNavigate();
  const nav = (p) => navigate(navPath(p));
  const [verified, setVerified] = useState(() => !!sessionStorage.getItem(ADMIN_STORAGE));
  if (!verified) return <AdminPasswordGate onSuccess={() => setVerified(true)} />;
  return <BrandDashboard nav={nav} isAdmin />;
}

/*══════════════════════════════════════════════════════
  APP ROOT
══════════════════════════════════════════════════════*/
export default function App() {
  return <div style={{background:C.bg,color:C.text,minHeight:"100vh"}}>
    <style>{CSS}</style>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/brand/*" element={<BrandPortal />} />
      <Route path="/creator/*" element={<CreatorPortalWrapper />} />
      <Route path="/admin/*" element={<AdminPortal />} />
    </Routes>
  </div>;
}

function LandingPage() {
  const navigate = useNavigate();
  const nav = (p) => navigate(navPath(p));
  return <Homepage nav={nav} />;
}

function CreatorPortalWrapper() {
  const navigate = useNavigate();
  const nav = (p) => navigate(navPath(p));
  const [ttStatus, setTtStatus] = useState(null);

  useEffect(() => {
    fetch('/api/tiktok/status').then(r => r.json()).then(d => {
      setTtStatus(d);
      if (!d.connected) window.location.href = '/auth/tiktok';
    }).catch(() => window.location.href = '/auth/tiktok');
  }, []);

  if (ttStatus === null) return <div className="content-pad" style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{textAlign:"center",color:C.sub}}>
      <div style={{width:32,height:32,border:"2px solid rgba(255,255,255,.1)",borderTopColor:C.teal,borderRadius:"50%",animation:"pulse 1s infinite",margin:"0 auto 16px"}}/>
      <div>Redirecting to connect TikTok...</div>
    </div>
  </div>;

  if (!ttStatus?.connected) return null;

  return <CreatorPortal nav={nav} />;
}
