'use strict';
/* ---------- constants ---------- */
const MODS=[['dashboard','Dashboard'],['clients','Clients'],['documents','Documents'],['tasks','Tasks'],['recon','Bank Reconciliation'],['bookkeeping','Bookkeeping'],['closing','Monthly Closing'],['reports','Reports'],['statements','Financial Statements'],['compliance','Compliance'],['tax','Tax Management'],['payroll','Payroll'],['advisory','Advisory'],['analytics','Analytics'],['workflow','Workflow'],['settings','Settings']];
const ICON={dashboard:'M4 20V10M10 20V4M16 20v-7M22 20H2',clients:'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 19v-1a4 4 0 0 0-3-3.900M15.500 3.200a3.500 3.500 0 0 1 0 6.600',documents:'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',tasks:'M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9',recon:'M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18',bookkeeping:'M12 6c-2-1.500-5-2-8-2v14c3 0 6 .5 8 2 2-1.500 5-2 8-2V4c-3 0-6 .5-8 2zM12 6v14',closing:'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 3v4M16 3v4M4 10h16M9 15l2 2 4-4',reports:'M12 3a9 9 0 1 0 9 9h-9zM15 3.500A9 9 0 0 1 20.500 9H15z',statements:'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM9 8h6M9 12h6M9 16h3',compliance:'M12 3l8 3v6c0 4.500-3.200 7.800-8 9-4.800-1.200-8-4.500-8-9V6zM9 12l2 2 4-4',tax:'M19 5L5 19M7.5 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4M16.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4',payroll:'M3 7h18v11H3zM12 15a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5',advisory:'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.500c.7.7 1 1.500 1 2.500h6c0-1 .3-1.800 1-2.500A6 6 0 0 0 12 3z',analytics:'M3 17l6-6 4 4 8-8M15 7h6v6',workflow:'M6 3h4v4H6zM14 17h4v4h-4zM4 17h4v4H4zM8 7v4h8v6M6 17v-6h2',settings:'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M16 4v4M10 10v4M18 16v4'};
const ico=k=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON[k]}"/></svg>`;
const DEF_COA=[['1000','Bank – main account','asset',1],['1010','Bank – second account','asset',1],['1020','Cash in hand','asset',1],['1100','Accounts receivable','asset'],['1200','Inventory','asset'],['1300','Prepayments','asset'],['1500','Equipment & fixed assets','asset'],['1900','Uncategorised (to be sorted)','asset'],['2000','Accounts payable','liability'],['2100','VAT payable','liability'],['2110','WHT payable','liability'],['2120','PAYE payable','liability'],['2130','Pension payable','liability'],['2200','Loans','liability'],['2300','Owner / director current account','liability'],['3000','Owner’s capital','equity'],['3100','Owner’s drawings','equity'],['3900','Opening balance equity','equity'],['4000','Sales','income'],['4100','Service income','income'],['4900','Other income','income'],['5000','Cost of goods sold','cogs'],['5100','Freight & import costs','cogs'],['5200','Direct labour & materials','cogs'],['6000','Salaries & wages','expense'],['6010','Rent','expense'],['6020','Utilities','expense'],['6030','Internet & phone','expense'],['6040','Advertising & marketing','expense'],['6050','Transport & travel','expense'],['6060','Bank charges','expense'],['6070','Professional fees','expense'],['6080','Repairs & maintenance','expense'],['6090','Office supplies','expense'],['6100','Software subscriptions','expense'],['6110','Delivery & logistics','expense'],['6120','Insurance','expense'],['6130','Taxes & levies','expense'],['6900','Other expenses','expense'],['7000','Exchange gain or loss','expense']].map(a=>({code:a[0],name:a[1],type:a[2],bank:!!a[3]}));
const SUSP='1900';
const DEF_RULES=[['sms alert','6060'],['stamp duty','6060'],['maintenance fee','6060'],['charge','6060'],['commission','6060'],['salary','6000'],['paystack','4000'],['pos settlement','4000'],['rent','6010'],['airtime','6030'],['internet','6030'],['fuel','6050'],['uber','6050'],['bolt','6050'],['facebook','6040'],['meta ','6040'],['instagram','6040'],['dstv','6020'],['electric','6020'],['aedc','6020'],['freight','5100'],['cargo','5100'],['shipping','5100']].map(r=>({k:r[0],a:r[1]}));
const DEF_CLOSE=['Bank statements received for every account','All transactions entered and categorised','Nothing left in Uncategorised','Bank accounts reconciled to statements','Sales agreed to the sales system (POS, Shopify or invoices)','Receivables reviewed: who still owes the business','Unpaid bills and payables reviewed','Inventory and cost of sales updated','Payroll posted','VAT and WHT schedules prepared','Loans, owner drawings and related-party balances checked','P&L and balance sheet reviewed for odd balances','Management report prepared','Report sent to client','Backup saved'].map((t,i)=>({id:'c'+i,t}));
const DEF_DOCS=['Bank statements (all accounts)','Sales report or invoices issued','Purchase invoices and receipts','Expense receipts','Payroll changes (new staff, leavers, pay changes)','Payment processor or POS settlement report','Loan and other statements','Stock count or inventory report'];
const DEF_WF=[
{id:'w1',name:'Monthly bookkeeping cycle',steps:[['Request documents from client',1],['Import bank statements',3],['Categorise transactions',5],['Reconcile bank accounts',7],['Review receivables and payables',8],['Check payroll and statutory deductions',8],['Prepare VAT and WHT schedules',10],['Complete month-end checklist',10],['Send management report',12]]},
{id:'w2',name:'New client onboarding',steps:[['Discovery call and notes',0],['Send engagement letter',1],['Engagement letter signed',3],['Collect CAC documents, TIN and onboarding form',3],['Get access to bank statements and accounting software',5],['Set up chart of accounts',7],['Agree opening balances',10],['Deliver first month',30]]},
{id:'w3',name:'Catch-up bookkeeping',steps:[['Agree the period and scope',0],['Collect all statements for the period',3],['Import and categorise month by month',10],['Reconcile each month',14],['Review unclear items with client',16],['Deliver catch-up reports',21]]},
{id:'w4',name:'Payroll run',steps:[['Confirm staff changes with client',0],['Compute payroll',1],['Client approval',2],['Send payslips and payment schedule',3],['Remit PAYE',10],['Remit pension',10]]},
{id:'w5',name:'Year-end close',steps:[['Confirm all 12 months are closed',0],['Year-end adjustments and accruals',7],['Fixed asset and depreciation review',7],['Stock count agreed',10],['Draft annual financial statements',14],['Review with client',21],['Hand over to tax filing',28]]}
].map(w=>({...w,steps:w.steps.map(s=>({t:s[0],d:s[1]}))}));
const DEF_TAX={vat:7.5,bands:[[800000,0],[2200000,15],[9000000,18],[13000000,21],[25000000,23],[0,25]],rentPct:20,rentCap:500000,penEe:8,penEr:10,nhf:2.5,minWage:70000,nsitf:1,itf:1,cit:30,levy:4,smallTurnover:100000000,duePaye:10,dueVat:21,dueWht:21,dueNsitf:16,
wht:[['Supply of goods',2],['Construction and building works',2],['Other services and contracts',2],['Professional, consultancy, management and technical fees',5],['Commission and brokerage',5],['Rent and hire of equipment',10],['Dividends, interest and royalties',10],['Directors’ fees',15]]};
const INDUSTRIES=['Retail and e-commerce','Construction','Manufacturing','Real estate','Professional services','Hospitality and food','Health','Education','Logistics','Agriculture','Non-profit','Other'];
const SOFTWARE=['Zoho Books','QuickBooks','Sage','Xero','Excel','This app','None yet','Other'];
const COLS=['clients','tasks','docs','ledger','recons','closes','staff','filings','invoices','notes','config'];

/* ---------- helpers ---------- */
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const today=()=>iso(new Date());
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONF=['January','February','March','April','May','June','July','August','September','October','November','December'];
const fd=s=>{if(!s)return'';const p=s.split('-');return p.length<3?s:`${p[2]} ${MON[+p[1]-1]} ${p[0]}`};
const pLabel=p=>p?MONF[+p.slice(5)-1]+' '+p.slice(0,4):'';
const pAdd=(p,n)=>{const d=new Date(+p.slice(0,4),+p.slice(5)-1+n,1);return d.getFullYear()+'-'+pad(d.getMonth()+1)};
const pEnd=p=>iso(new Date(+p.slice(0,4),+p.slice(5),0));
const dAdd=(s,n)=>{const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return iso(d)};
const dDiff=(a,b)=>Math.round((new Date(a+'T12:00:00')-new Date(b+'T12:00:00'))/864e5);
const r2=n=>Math.round((n+Number.EPSILON)*100)/100;
const N=n=>{n=r2(n||0);const s=Math.abs(n).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2});return n<0?'('+s+')':s};
const M=(n,c)=>(c||cur())+N(n);
const pct=n=>isFinite(n)?(Math.round(n*10)/10)+'%':'–';
const num=v=>{if(typeof v==='number')return v;let s=String(v==null?'':v).trim();if(!s)return 0;const neg=/^\(.*\)$/.test(s)||/dr$/i.test(s)||/^-/.test(s);s=s.replace(/[^0-9.]/g,'');const n=parseFloat(s);return isNaN(n)?0:(neg?-n:n)};

/* ---------- store ---------- */
const cache={};COLS.forEach(c=>cache[c]={});
let db=null,dl=null,sample=null,mode='loading';
const wq={};let pending=0;
function setSave(){const el=$('#saveState');if(!el)return;el.textContent=mode==='db'?(pending?'Saving…':'All changes saved'):mode==='memory'?'Not saved':''}
const pend={};
function persist(col,id){
  if(!db){try{localStorage.setItem('trb-data',JSON.stringify(cache))}catch(e){}return}
  const k=col+'/'+id;pend[k]={col,id,o:cache[col][id]||null};pending++;setSave();
  wq[k]=(wq[k]||Promise.resolve()).then(()=>{const p=pend[k];if(!p)return;const cur=p.o,ref=db.collection(col).doc(id);
      return(cur?ref.set(JSON.parse(JSON.stringify(cur))):ref.delete()).then(()=>{if(pend[k]&&pend[k].o===cur)delete pend[k]})})
    .catch(e=>{toast(e&&e.code==='quota_exceeded'?'Storage is full. Export a backup and remove old records.':'Could not save that change. Check your connection and try again.')})
    .then(()=>{pending--;setSave()});
}
function put(col,o){o=JSON.parse(JSON.stringify(o));if(!o.id)o.id=uid();cache[col]={...cache[col],[o.id]:o};persist(col,o.id);draw();return o}
function del(col,id){const m={...cache[col]};delete m[id];cache[col]=m;persist(col,id);draw()}
const all=col=>Object.values(cache[col]);
const cfg=k=>cache.config[k]||{};
const firm=()=>({name:'The Resident Bookkeeper',owner:'Nancy',prefix:'TRB',...cfg('firm')});
const tax=()=>({...DEF_TAX,...cfg('tax')});
const CURS=['₦','$','£','€'];
const gcoa=()=>cfg('coa').list||DEF_COA;
function clientBanks(c){if(!c)return[];const base=c.currency||'₦',g=gcoa().filter(a=>a.bank).map(a=>({code:a.code,name:a.name,cur:base})),ov=c.banks||[];
  const out=g.map(a=>{const o=ov.find(x=>x.code===a.code);return o?{...a,...o}:a});ov.filter(o=>!g.some(a=>a.code===o.code)).forEach(o=>out.push({cur:base,...o}));
  return out.filter(a=>!a.hidden).sort((x,y)=>x.code<y.code?-1:1)}
const coa=()=>{const g=gcoa(),c=cache.clients[ui.client];if(!c)return g;const base=c.currency||'₦';
  return[...clientBanks(c).map(b=>({code:b.code,name:b.name+(b.cur!==base?' ('+b.cur+')':''),type:'asset',bank:true,cur:b.cur})),...g.filter(a=>!a.bank)].sort((x,y)=>x.code<y.code?-1:1)};
const baseCur=()=>{const c=cache.clients[ui.client];return(c&&c.currency)||'₦'};
const acctCur=code=>acc(code).cur||baseCur();
const isForeign=code=>{const a=acc(code);return !!(a.bank&&a.cur&&a.cur!==baseCur())};
const fxLeg=(r,code)=>(r.fx&&r.fx.acct===code)?r.fx:(r.fx2&&r.fx2.acct===code)?r.fx2:null;
const acctAmt=(r,code)=>{const f=fxLeg(r,code);return(r.dr===code?1:r.cr===code?-1:0)*(f?f.amt:r.amt)};
// Work out the book amount and the foreign-currency legs of an entry. `known` is the account the typed amount is in.
function legs(c,date,known,other,amount,rateIn){const p=date.slice(0,7),out={amt:r2(amount)};const need=cur=>'Save a '+pLabel(p)+' rate for '+cur+' under Bank accounts and rates first.';
  if(isForeign(known)){const cur=acctCur(known),rt=+rateIn||rateFor(c,cur,p);if(!(rt>0))return{err:need(cur)};out.fx={acct:known,cur,amt:r2(amount),rate:rt};out.amt=r2(amount*rt)}
  if(isForeign(other)){const cur=acctCur(other),rt=isForeign(known)?rateFor(c,cur,p):(+rateIn||rateFor(c,cur,p));if(!(rt>0))return{err:need(cur)};const leg={acct:other,cur,amt:r2(out.amt/rt),rate:rt,est:true};if(out.fx)out.fx2=leg;else out.fx=leg}
  return out}
function updRow(cid,rid,fn){for(const d of all('ledger'))if(d.clientId===cid&&(d.rows||[]).some(r=>r.id===rid)){put('ledger',{...d,rows:d.rows.map(r=>r.id===rid?fn(JSON.parse(JSON.stringify(r))):r)});return}}
const rateFor=(c,cur,p)=>{const m=(c.rates||{})[cur]||{};if(m[p])return m[p];const k=Object.keys(m).filter(x=>x<p).sort().pop();return k?m[k]:0};
const ownBal=(cid,code,to)=>r2(ledRows(cid,null,to).reduce((t,r)=>t+acctAmt(r,code),0));
const rules=()=>cfg('rules').list||DEF_RULES;
const closeTpl=()=>cfg('close').list||DEF_CLOSE;
const wfs=()=>cfg('workflows').list||DEF_WF;
const team=()=>cfg('team').list||[{name:firm().owner,role:'Owner',email:''}];
const acc=code=>coa().find(a=>a.code===code)||{code,name:'Unknown account '+code,type:'asset'};
const accName=c=>acc(c).name;
const banks=()=>coa().filter(a=>a.bank);
const isBank=c=>!!acc(c).bank;

/* ---------- ui state ---------- */
const ui={mod:'dashboard',client:'',period:today().slice(0,7),tab:{}};
try{const s=JSON.parse(localStorage.getItem('trb-ui')||'{}');if(s.client)ui.client=s.client;if(s.period)ui.period=s.period}catch(e){}
const saveUi=()=>{try{localStorage.setItem('trb-ui',JSON.stringify({client:ui.client,period:ui.period}))}catch(e){}};
const clients=()=>all('clients').sort((a,b)=>a.name.localeCompare(b.name));
const cl=()=>cache.clients[ui.client]||null;
const cur=()=>(cl()&&cl().currency)||'₦';
const cname=id=>(cache.clients[id]||{}).name||'General';
const tab=(d)=>ui.tab[ui.mod]||d;

/* ---------- ledger ---------- */
function ledRows(cid,from,to){let out=[];for(const d of all('ledger'))if(d.clientId===cid&&(!from||d.period>=from)&&(!to||d.period<=to))out=out.concat(d.rows||[]);return out.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0)}
function addRows(cid,rows){const by={};rows.forEach(r=>{const p=r.date.slice(0,7);(by[p]=by[p]||[]).push({id:uid(),...r,amt:r2(r.amt)})});
  for(const p in by){const id=cid+'_'+p;const d=cache.ledger[id]||{id,clientId:cid,period:p,rows:[]};put('ledger',{...d,rows:[...(d.rows||[]),...by[p]]})}}
function delRow(cid,rid){for(const d of all('ledger'))if(d.clientId===cid&&(d.rows||[]).some(r=>r.id===rid)){put('ledger',{...d,rows:d.rows.filter(r=>r.id!==rid)});return}}
function bal(rows){const m={};rows.forEach(r=>{m[r.dr]=(m[r.dr]||0)+r.amt;m[r.cr]=(m[r.cr]||0)-r.amt});return m}
function pl(cid,from,to){const b=bal(ledRows(cid,from,to));const g={income:[],cogs:[],expense:[]};
  for(const c in b){const a=acc(c);if(g[a.type]&&Math.abs(b[c])>0.004)g[a.type].push({code:c,name:a.name,amt:a.type==='income'?-b[c]:b[c]})}
  for(const k in g)g[k].sort((x,y)=>x.code<y.code?-1:1);
  const s=l=>l.reduce((t,x)=>t+x.amt,0);const inc=s(g.income),cg=s(g.cogs),ex=s(g.expense);
  return{...g,inc,cg,gross:inc-cg,ex,net:inc-cg-ex,margin:inc?(inc-cg)/inc*100:NaN}}
function bs(cid,to){const b=bal(ledRows(cid,null,to));const g={asset:[],liability:[],equity:[]};let pnl=0;
  for(const c in b){const a=acc(c);if(Math.abs(b[c])<0.005)continue;if(g[a.type])g[a.type].push({code:c,name:a.name,bank:a.bank,amt:a.type==='asset'?b[c]:-b[c]});else pnl-=b[c]}
  for(const k in g)g[k].sort((x,y)=>x.code<y.code?-1:1);
  const s=l=>l.reduce((t,x)=>t+x.amt,0);
  return{...g,retained:pnl,tA:s(g.asset),tL:s(g.liability),tE:s(g.equity)+pnl,cash:g.asset.filter(a=>a.bank).reduce((t,x)=>t+x.amt,0)}}
const fyStart=(p,c)=>{const ye=+(c&&c.yearEnd)||12;const m=+p.slice(5),y=+p.slice(0,4);const sm=ye%12+1;return (m>=sm?y:y-1)+'-'+pad(sm)};

/* ---------- payroll & tax maths ---------- */
function payeAnnual(taxable,T){let left=Math.max(0,taxable),t=0;for(const [lim,rate] of T.bands){const slice=lim?Math.min(left,lim):left;t+=slice*rate/100;left-=slice;if(left<=0)break}return t}
function payrun(e,T){const basic=+e.basic||0,hous=+e.housing||0,trans=+e.transport||0,oth=+e.other||0;const gross=basic+hous+trans+oth;
  const pen=e.pension?(basic+hous+trans)*T.penEe/100:0;const nhf=e.nhf?basic*T.nhf/100:0;
  const rent=Math.min((+e.rent||0)*T.rentPct/100,T.rentCap);
  const taxable=Math.max(0,gross*12-pen*12-nhf*12-rent-(+e.relief||0));
  const paye=gross<=T.minWage?0:payeAnnual(taxable,T)/12;const ded=+e.deduct||0;
  return{gross,pen:r2(pen),nhf:r2(nhf),paye:r2(paye),ded,net:r2(gross-pen-nhf-paye-ded),erPen:r2(e.pension?(basic+hous+trans)*T.penEr/100:0),taxable}}

/* ---------- compliance ---------- */
function wdAdd(s,n){let d=s;while(n>0){d=dAdd(d,1);const w=new Date(d+'T12:00:00').getDay();if(w!==0&&w!==6)n--}return d}
function obligs(c,from,to){const T=tax(),out=[];const add=(code,name,period,due,body)=>{if(due>=from&&due<=to)out.push({key:c.id+'_'+code+'_'+period,clientId:c.id,code,name,period,due,body})};
  let p=from.slice(0,7);p=pAdd(p,-2);const last=to.slice(0,7);
  for(;p<=last;p=pAdd(p,1)){const nx=pAdd(p,1),lab=pLabel(p);
    if(c.vat)add('VAT','VAT return for '+lab,p,nx+'-'+pad(T.dueVat),'NRS');
    if(c.wht)add('WHT','WHT remittance for '+lab,p,nx+'-'+pad(T.dueWht),'NRS / State IRS');
    if(c.paye){add('PAYE','PAYE remittance for '+lab,p,nx+'-'+pad(T.duePaye),'State IRS');add('NSITF','NSITF contribution for '+lab,p,nx+'-'+pad(T.dueNsitf),'NSITF')}
    if(c.pension)add('PEN','Pension remittance for '+lab,p,wdAdd(pEnd(p),7),'PFA')}
  for(let y=+from.slice(0,4)-1;y<=+to.slice(0,4);y++){
    if(c.paye){add('H1','Employer annual PAYE return for '+(y-1),String(y),y+'-01-31','State IRS');add('ITF','ITF annual contribution for '+(y-1),String(y),y+'-04-01','ITF')}
    if(c.legal==='Limited company'){const ye=+c.yearEnd||12;const end=iso(new Date(y,ye,0));const d=new Date(y,ye+6,0);add('CIT','Company income tax return, year ended '+fd(end),String(y),iso(d),'NRS');add('CAC','CAC annual return '+y,String(y),y+'-06-30','CAC')}
    else if(c.legal)add('PIT','Owner’s annual self-assessment for '+(y-1),String(y),y+'-03-31','State IRS')}
  all('filings').filter(f=>f.custom&&f.clientId===c.id&&f.due>=from&&f.due<=to).forEach(f=>out.push({key:f.id,clientId:c.id,code:'OTHER',name:f.name,period:'',due:f.due,body:f.body||'',custom:true}));
  return out}
const filed=k=>{const f=cache.filings[k];return f&&f.filed?f:null};
function allObligs(from,to,cid){let o=[];clients().filter(c=>c.status!=='Former'&&c.status!=='Prospect'&&(!cid||c.id===cid)).forEach(c=>o=o.concat(obligs(c,from,to)));return o.sort((a,b)=>a.due<b.due?-1:1)}

/* ---------- file reading ---------- */
function pDate(v){if(v instanceof Date&&!isNaN(v)){return iso(new Date(v.getTime()+36e5))}
  if(typeof v==='number'&&v>20000&&v<80000){const d=new Date(Math.round((v-25569)*864e5));return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())}
  const s=String(v||'').trim();let m;
  if((m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)))return m[1]+'-'+pad(m[2])+'-'+pad(m[3]);
  if((m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/))){const y=m[3].length===2?'20'+m[3]:m[3];return +m[2]>12?y+'-'+pad(m[1])+'-'+pad(m[2]):y+'-'+pad(m[2])+'-'+pad(m[1])}
  if((m=s.match(/^(\d{1,2})[\s\-\/]([A-Za-z]{3})[A-Za-z]*[\s\-\/,]+(\d{2,4})/))){const i=MON.findIndex(x=>x.toLowerCase()===m[2].toLowerCase());if(i>=0)return (m[3].length===2?'20'+m[3]:m[3])+'-'+pad(i+1)+'-'+pad(m[1])}
  if((m=s.match(/^([A-Za-z]{3})[A-Za-z]*\s+(\d{1,2}),?\s+(\d{4})/))){const i=MON.findIndex(x=>x.toLowerCase()===m[1].toLowerCase());if(i>=0)return m[3]+'-'+pad(i+1)+'-'+pad(m[2])}
  return''}
async function readGrid(file){const buf=await file.arrayBuffer();const wb=XLSX.read(buf,{type:'array',cellDates:true});return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:''})}
function parseTxns(grid,side){let hi=-1,col={};
  for(let i=0;i<Math.min(grid.length,60);i++){const c={};grid[i].forEach((v,j)=>{const s=String(v).toLowerCase().trim();if(!s)return;
      if(/date/.test(s)&&c.date==null)c.date=j;
      else if(/debit|withdraw|money out|paid out|^dr$/.test(s)&&c.debit==null)c.debit=j;
      else if(/credit|deposit|lodg|money in|paid in|^cr$/.test(s)&&c.credit==null)c.credit=j;
      else if(/balance/.test(s)&&c.balance==null)c.balance=j;
      else if(/amount/.test(s)&&c.amount==null)c.amount=j;
      else if(/narration|description|remark|detail|particular|memo|payee/.test(s)&&c.desc==null)c.desc=j;
      else if(/ref|cheque|transaction#|doc/.test(s)&&c.ref==null)c.ref=j});
    if(c.date!=null&&(c.debit!=null||c.credit!=null||c.amount!=null)){hi=i;col=c;break}}
  if(hi<0)return{rows:[],err:'I could not find the column headings. The file needs a Date column and Debit/Credit or Amount columns.'};
  const rows=[];let lastBal=null;
  for(let i=hi+1;i<grid.length;i++){const g=grid[i];const date=pDate(g[col.date]);if(!date)continue;let amt;
    if(col.debit!=null||col.credit!=null){const d=Math.abs(num(g[col.debit])),c=Math.abs(num(g[col.credit]));amt=side==='bank'?c-d:d-c}else amt=num(g[col.amount]);
    if(col.balance!=null&&String(g[col.balance]).trim()!=='')lastBal=num(g[col.balance]);
    if(Math.abs(amt)<0.005)continue;
    rows.push({date,desc:String(col.desc!=null?g[col.desc]:'').replace(/\s+/g,' ').trim(),ref:String(col.ref!=null?g[col.ref]:'').trim(),amt:r2(amt)})}
  return{rows,lastBal}}
function suggest(desc){const s=' '+desc.toLowerCase()+' ';const r=rules().find(r=>r.k&&s.includes(r.k.toLowerCase()));return r?r.a:SUSP}
function matchUp(bank,book,tol){bank.forEach(b=>b.m=null);book.forEach(k=>k.m=null);
  for(const t of [0,tol])bank.forEach((b,i)=>{if(b.m!=null)return;let best=-1,bd=1e9;book.forEach((k,j)=>{if(k.m!=null||Math.abs(k.amt-b.amt)>0.005)return;const d=Math.abs(dDiff(k.date,b.date));if(d<=t&&d<bd){bd=d;best=j}});if(best>=0){b.m=best;book[best].m=i}})}

/* ---------- output ---------- */
function toast(t){const el=$('#toast');el.textContent=t;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,3200)}
async function saveFile(filename,data){
  if(dl){try{await dl.save({filename,data});toast('Saved '+filename)}catch(e){if(e&&e.code!=='declined')toast('That file could not be saved here.')}return}
  try{const b=data instanceof Blob?data:new Blob([data]);const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=filename;a.click()}catch(e){toast('Saving files is not available in this view.')}}
function xlsxOut(name,sheets){if(outFmt==='pdf'){outFmt='xlsx';return pdfOut(name.replace(/\.xlsx$/,'.pdf'),sheets)}const wb=XLSX.utils.book_new();sheets.forEach(([n,aoa,w])=>{const ws=XLSX.utils.aoa_to_sheet(aoa);ws['!cols']=(w||[40,16,16,16,16]).map(x=>({wch:x}));XLSX.utils.book_append_sheet(wb,ws,n.slice(0,31))});saveFile(name,XLSX.write(wb,{type:'array',bookType:'xlsx'}))}
async function copy(t){try{await navigator.clipboard.writeText(t);toast('Copied')}catch(e){showText('Copy this text',t)}}
function showText(title,text){modal(`<h2>${esc(title)}</h2><textarea id="mTxt" style="min-height:260px">${esc(text)}</textarea><div class="row"><button class="btn pri" data-a="copyTxt">Copy</button><button class="btn" data-a="close">Close</button></div>`)}
function modal(html){const m=$('#modal');m.innerHTML='<div class="box">'+html+'</div>';m.hidden=false}
function closeModal(){$('#modal').hidden=true;$('#modal').innerHTML='';formCb=null;if(dirty)draw()}
let formCb=null;
function openForm(title,fields,vals,onSave,opts){vals=vals||{};opts=opts||{};formCb={fields,onSave};
  const f=fields.map(x=>{const v=vals[x.k]!=null?vals[x.k]:(x.d!=null?x.d:'');const id='f_'+x.k;
    if(x.t==='check')return`<label class="ck"><input type="checkbox" id="${id}" ${v?'checked':''}> ${esc(x.l)}</label>`;
    let inp;
    if(x.t==='select')inp=`<select id="${id}">${x.o.map(o=>{const[a,b]=Array.isArray(o)?o:[o,o];return`<option value="${esc(a)}" ${String(a)===String(v)?'selected':''}>${esc(b)}</option>`}).join('')}</select>`;
    else if(x.t==='textarea')inp=`<textarea id="${id}">${esc(v)}</textarea>`;
    else inp=`<input id="${id}" type="${x.t||'text'}" value="${esc(v)}" ${x.t==='number'?'step="any"':''} ${x.req?'required':''}>`;
    return`<label class="f ${x.full||x.t==='textarea'?'full':''}">${esc(x.l)}${inp}</label>`}).join('');
  modal(`<h2>${esc(title)}</h2>${opts.note?`<div class="note">${opts.note}</div>`:''}<form data-f="modalForm" class="fg">${f}<div class="row full"><button class="btn pri" type="submit">${esc(opts.ok||'Save')}</button><button class="btn" type="button" data-a="close">Cancel</button>${opts.del?`<span style="flex:1"></span><button class="btn red" type="button" data-a="${opts.del[0]}" data-id="${esc(opts.del[1])}">Delete</button>`:''}</div></form>`);
  const first=$('#modal input,#modal select,#modal textarea');if(first)first.focus()}
function confirmBox(text,ok,fn){confirmBox.fn=fn;modal(`<h2>${esc(text)}</h2><div class="row"><button class="btn pri" data-a="confirmYes">${esc(ok)}</button><button class="btn" data-a="close">Cancel</button></div>`)}
const accOpts=(sel,filter)=>coa().filter(filter||(()=>true)).map(a=>`<option value="${a.code}" ${a.code===sel?'selected':''}>${a.code} ${esc(a.name)}</option>`).join('');
const accList=(filter)=>coa().filter(filter||(()=>true)).map(a=>[a.code,a.code+' '+a.name]);
const clientOpts=()=>[['','General (no client)'],...clients().map(c=>[c.id,c.name])];
function tbl(head,rows,empty){if(!rows.length)return`<div class="empty">${empty||'Nothing here yet.'}</div>`;return`<div class="tw"><table class="t"><thead><tr>${head.map(h=>`<th${/^#/.test(h)?' class="n"':''}>${esc(h.replace(/^#/,''))}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`}
const needClient=(what)=>`<div class="empty"><b>Choose a client first</b>${esc(what)} works on one client at a time. Pick a client at the top of the page.${clients().length?'':'<div class="row"><button class="btn pri" data-a="clientNew">Add your first client</button></div>'}</div>`;
const head=(title,sub,btns)=>`<div class="ph"><div><div class="eyebrow">${cl()?esc(cl().name)+' · ':''}${pLabel(ui.period)}</div><h1>${esc(title)}</h1>${sub?`<p>${sub}</p>`:''}</div><span class="sp"></span><div class="row">${btns||''}</div></div>`;
const tabsH=(list,curT)=>`<div class="tabs">${list.map(([k,l])=>`<button data-a="tab" data-k="${k}" class="${k===curT?'on':''}">${esc(l)}</button>`).join('')}</div>`;
/* ---------- PDF statements ---------- */
const MONEY=/^\(?-?[\d,]+\.\d{1,2}\)?$/;
function pdfTxns(pages,side){ // pages: [[{x,r,y,s}]]
  let hd=null,starts=[];const cand=[];
  pages.forEach(items=>{const ys={};items.forEach(it=>{const s=it.s.trim();if(!s)return;let k=Object.keys(ys).find(y=>Math.abs(y-it.y)<=2.5);if(k==null){k=it.y;ys[k]=[]}ys[k].push({...it,s})});
    const lines=Object.keys(ys).map(Number).sort((a,b)=>b-a).map(y=>({y,t:ys[y].sort((a,b)=>a.x-b.x)}));let cur=null;
    lines.forEach(L=>{
      if(!hd){const f=re=>L.t.find(t=>re.test(t.s));const d=f(/debit|withdraw|money out|paid out|^dr$/i),c=f(/credit|deposit|lodg|money in|paid in|^cr$/i);if(d&&c&&d!==c)hd={dr:d.r,cr:c.r}}
      const first=L.t[0],date=first&&/\d/.test(first.s)&&first.s.length<=12?pDate(first.s):'';const money=L.t.filter(t=>MONEY.test(t.s));
      if(date&&money.length){const words=L.t.filter(t=>t!==first&&!MONEY.test(t.s)&&!pDate(t.s.length<=12&&/\d/.test(t.s)?t.s:'')&&!/^(dr|cr)$/i.test(t.s));
        cur={date,money,all:L.t,desc:words.map(t=>t.s),dx:words.length?words[0].x:null,y:L.y};cand.push(cur)}
      else if(cur&&!money.length&&cur.y-L.y<40){const w=L.t.filter(t=>cur.dx!=null&&t.x>=cur.dx-25&&t.x<=cur.dx+140);if(w.length&&w.length===L.t.length){cur.desc.push(...w.map(t=>t.s));cur.y=L.y}else cur=null}
      else cur=null})});
  if(!cand.length)return{rows:[],err:'No transactions could be found in that PDF.'};
  cand.forEach(c=>c.text=c.desc.join(' ').replace(/\s+/g,' ').trim());
  const nb=cand.filter(c=>c.money.length>=2).length;const hasBal=nb>0&&nb*2>=cand.length;const rows=[];let prev=null,unchecked=0;
  cand.forEach((c,ci)=>{const v=c.money.map(m=>Math.abs(num(m.s)));const last=c.money[c.money.length-1];
    const neg=hasBal&&(/^\(|^-/.test(last.s)||c.all.some(t=>/^dr$/i.test(t.s)&&t.x>last.x));
    if(!hasBal){const am=c.money[0];let sign=1;if(hd){const isCr=Math.abs(am.r-hd.cr)<Math.abs(am.r-hd.dr);sign=side==='bank'?(isCr?1:-1):(isCr?-1:1)}if(v[0]>0.004)rows.push({date:c.date,desc:c.text,ref:'',amt:r2(sign*v[0])});return}
    const b=(neg?-1:1)*v[v.length-1];
    if(v.length<2){if(prev==null||/balance|b\/f|brought|opening/i.test(c.text)){prev=b;return}
      const d=r2(b-prev);unchecked++;prev=b;if(Math.abs(d)>0.004)rows.push({date:c.date,desc:c.text,ref:'',amt:d});return}
    const amt=v[v.length-2],am=c.money[c.money.length-2];let sign=0;
    if(prev!=null){if(Math.abs(prev+amt-b)<0.011)sign=1;else if(Math.abs(prev-amt-b)<0.011)sign=-1;else{unchecked++;const d=r2(b-prev);if(Math.abs(Math.abs(d)-amt)<1)sign=d>0?1:-1}}
    if(!sign){const isCr=hd?Math.abs(am.r-hd.cr)<Math.abs(am.r-hd.dr):true;sign=side==='bank'?(isCr?1:-1):(isCr?-1:1)}
    let val=sign*amt;if(prev!=null&&Math.abs(Math.abs(b-prev)-amt)>0.011&&Math.abs(Math.abs(b-prev)-amt)<1)val=b-prev;
    prev=b;if(amt>0.004)rows.push({date:c.date,desc:c.text,ref:'',amt:r2(val)})});
  return{rows,lastBal:prev,unchecked,noBal:!hasBal}}
async function readPdf(file,side){if(typeof pdfjsLib==='undefined')return{rows:[],err:'PDF reading is not available in this view. Use the Excel or CSV statement.'};
  let doc;try{doc=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise}catch(e){return{rows:[],err:e&&e.name==='PasswordException'?'That PDF is locked with a password. Remove the password, or use the Excel statement.':'That PDF could not be opened.'}}
  const pages=[];let n=0;for(let i=1;i<=doc.numPages;i++){const tc=await(await doc.getPage(i)).getTextContent();const it=tc.items.filter(t=>t.str&&t.str.trim()).map(t=>({x:t.transform[4],r:t.transform[4]+t.width,y:t.transform[5],s:t.str}));n+=it.length;pages.push(it)}
  if(n<20)return{rows:[],err:'That PDF is a scanned picture with no text to read. Ask the bank for an Excel statement or a text PDF.'};
  return pdfTxns(pages,side)}
async function readTxns(file,side){return /\.pdf$/i.test(file.name)?readPdf(file,side):parseTxns(await readGrid(file),side)}

/* ---------- PDF output ---------- */
let outFmt='xlsx';
const pdfTxt=s=>String(s==null?'':s).replace(/₦/g,'NGN ').replace(/[–—]/g,'-').replace(/[’‘]/g,"'").replace(/→/g,'to').replace(/[^\x00-\xff]/g,'').replace(/NGN \)/g,'NGN)');
function pdfOut(name,sheets){if(!window.jspdf||!window.jspdf.jsPDF)return toast('PDF downloads are not available in this view. Use the Excel download.');
  const cols=Math.max(...sheets.map(s=>Math.max(...s[1].map(r=>r.length))));const doc=new jspdf.jsPDF({orientation:cols>6?'landscape':'portrait',unit:'pt',format:'a4'}),f=firm();
  const TOT=/^\s*(total|net |gross|profit|left after|adjusted|difference|liabilities and equity|bank and cash at)/i;
  sheets.forEach((sh,si)=>{if(si)doc.addPage();const aoa=sh[1],n=Math.max(...aoa.map(r=>r.length));
    try{doc.addImage($('.brand img').src,'JPEG',40,26,36,36)}catch(e){}
    doc.setFont('times','bold');doc.setFontSize(12);doc.setTextColor(23,20,15);doc.text('THE RESIDENT BOOKKEEPER',86,42);
    doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(110,100,88);doc.text(pdfTxt([f.legal,f.rc,f.phone,f.email].filter(Boolean).join('  |  ')||'Accurate records. Smarter decisions. Stronger business.'),86,55);
    doc.setDrawColor(176,138,46);doc.setLineWidth(1);doc.line(40,72,doc.internal.pageSize.getWidth()-40,72);
    let i=0,y=98;doc.setTextColor(23,20,15);
    while(i<aoa.length&&i<2&&aoa[i].length===1){doc.setFont('helvetica',i?'normal':'bold');doc.setFontSize(i?11:15);doc.text(pdfTxt(aoa[i][0]),40,y);y+=i?14:20;i++}
    const body=[];let seenHead=false;
    for(;i<aoa.length;i++){const r=aoa[i];if(!r.length||r.every(c=>c===''||c==null)){body.push([{content:'',colSpan:n,styles:{cellPadding:3,minCellHeight:6}}]);continue}
      if(r.length===1){const t=String(r[0]),head=t.length<=40&&!/[:.\d]/.test(t);body.push([{content:pdfTxt(t),colSpan:n,styles:head?{fontStyle:'bold',textColor:[122,90,16],fontSize:9}:{}}]);continue}
      const isHead=!seenHead&&r.slice(1).every(c=>typeof c==='string'&&c!=='')&&r.length>=2;if(isHead)seenHead=true;const tot=TOT.test(String(r[0]));
      body.push([...Array(n)].map((_,j)=>{const c=r[j];const st={};if(j)st.halign='right';if(isHead){st.fontStyle='bold';st.fillColor=[239,237,232]}if(tot){st.fontStyle='bold';st.lineWidth={top:0.8,bottom:0,left:0,right:0};st.lineColor=[23,20,15]}
        if(!j&&/^ {2}/.test(String(c)))st.cellPadding={top:4,bottom:4,right:4,left:18};if(isHead||typeof c==='string')st.halign=j&&(isHead||!isNaN(parseFloat(c)))?'right':st.halign;
        return{content:typeof c==='number'?N(c):pdfTxt(c==null?'':String(c).trim()),styles:st}}))}
    doc.autoTable({startY:y+4,body,theme:'plain',margin:{left:40,right:40,bottom:50},styles:{font:'helvetica',fontSize:cols>8?7.5:9,cellPadding:4,textColor:[23,20,15],overflow:'linebreak'},columnStyles:n<=5?{0:{cellWidth:'auto'}}:{}})});
  const pc=doc.getNumberOfPages();for(let p=1;p<=pc;p++){doc.setPage(p);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(110,100,88);doc.text(pdfTxt('Prepared by '+f.name+'  |  '+fd(today())+'  |  Page '+p+' of '+pc),40,doc.internal.pageSize.getHeight()-28)}
  saveFile(name,doc.output('arraybuffer'))}
/* ================= VIEWS ================= */
const V={},ACT={},CH={},FM={};
const openTasks=()=>all('tasks').filter(t=>!t.done&&(!ui.client||t.clientId===ui.client));
const stChip=(due,done)=>done?'<span class="chip ok">Done</span>':due<today()?`<span class="chip bad">Overdue ${-dDiff(due,today())}d</span>`:dDiff(due,today())<=7?`<span class="chip warn">Due ${dDiff(due,today())===0?'today':'in '+dDiff(due,today())+'d'}</span>`:'<span class="chip">Upcoming</span>';

/* ----- 01 Dashboard ----- */
V.dashboard=()=>{const t=today(),ot=openTasks();const over=ot.filter(x=>x.due&&x.due<t),wk=ot.filter(x=>x.due&&x.due>=t&&x.due<=dAdd(t,7));
  const ob=allObligs(dAdd(t,-45),dAdd(t,21),ui.client).filter(o=>!filed(o.key));const obOver=ob.filter(o=>o.due<t);
  const inv=all('invoices').filter(i=>i.status!=='Paid'&&(!ui.client||i.clientId===ui.client));const docsW=all('docs').filter(d=>d.status==='Requested'&&(!ui.client||d.clientId===ui.client));
  const act=clients().filter(c=>c.status==='Active'||c.status==='Onboarding');
  const badge={tasks:over.length,compliance:obOver.length,documents:docsW.length};
  const hr=new Date().getHours();
  if(!clients().length)return head('Dashboard','')+`<div class="empty"><b>Welcome, ${esc(firm().owner)}</b>Add your first client to start. Every module works from the client list.<div class="row"><button class="btn pri" data-a="clientNew">Add a client</button><button class="btn" data-a="loadExamples">Load example data to explore</button></div></div>`+tilesH(badge);
  const att=[...over.map(x=>({d:x.due,h:`<div><div class="gr"><b>${esc(x.title)}</b><div class="sm mut">${esc(cname(x.clientId))} · task due ${fd(x.due)}</div></div>${stChip(x.due)}<button class="btn sm" data-a="taskDone" data-id="${x.id}">Mark done</button></div>`})),
    ...ob.map(o=>({d:o.due,h:`<div><div class="gr"><b>${esc(o.name)}</b><div class="sm mut">${esc(cname(o.clientId))} · ${esc(o.body)} · due ${fd(o.due)}</div></div>${stChip(o.due)}<button class="btn sm" data-a="fileIt" data-k="${o.key}">Mark filed</button></div>`})),
    ...wk.map(x=>({d:x.due,h:`<div><div class="gr"><b>${esc(x.title)}</b><div class="sm mut">${esc(cname(x.clientId))} · task due ${fd(x.due)}</div></div>${stChip(x.due)}<button class="btn sm" data-a="taskDone" data-id="${x.id}">Mark done</button></div>`}))].sort((a,b)=>a.d<b.d?-1:1).slice(0,12);
  const tpl=closeTpl();
  const prog=act.filter(c=>!ui.client||c.id===ui.client).map(c=>{const cz=cache.closes[c.id+'_'+ui.period]||{};const n=tpl.filter(i=>(cz.done||{})[i.id]).length;const rec=all('recons').some(r=>r.clientId===c.id&&r.period===ui.period);
    return`<div><div class="gr"><b>${esc(c.name)}</b><div class="sm mut">${n} of ${tpl.length} checklist steps${cz.signed?' · closed '+fd(cz.signedOn):''}</div></div><div class="prog" style="width:110px"><i style="width:${n/tpl.length*100}%"></i></div><span class="chip ${rec?'ok':''}">${rec?'Bank reconciled':'Not reconciled'}</span><button class="btn sm" data-a="openClient" data-id="${c.id}" data-m="closing">Open</button></div>`}).join('');
  return`<div class="ph"><div><div class="eyebrow">${fd(t)}</div><h1>Good ${hr<12?'morning':hr<17?'afternoon':'evening'}, ${esc(firm().owner)}</h1><p>${ui.client?'Showing '+esc(cname(ui.client))+' only.':'Everything across your clients in one place.'}</p></div></div>
  <div class="grid g4"><div class="kpi"><span>Active clients</span><b>${act.length}</b></div><div class="kpi ${over.length?'bad':''}"><span>Tasks overdue</span><b>${over.length}</b></div><div class="kpi"><span>Tasks due in 7 days</span><b>${wk.length}</b></div><div class="kpi ${obOver.length?'bad':''}"><span>Filings due in 21 days</span><b>${ob.length}</b><em>${obOver.length} overdue</em></div><div class="kpi"><span>Documents awaited</span><b>${docsW.length}</b></div><div class="kpi"><span>Invoices unpaid</span><b>₦${N(inv.reduce((s,i)=>s+(+i.amount||0),0))}</b><em>${inv.length} invoice${inv.length===1?'':'s'}</em></div></div>
  ${tilesH(badge)}
  <div class="grid g2"><div class="card"><h2>Needs attention</h2><div class="list">${att.map(a=>a.h).join('')||'<div class="mut">Nothing overdue and nothing due this week.</div>'}</div></div>
  <div class="card"><h2>Month-end progress <small>${pLabel(ui.period)}</small></h2><div class="list">${prog||'<div class="mut">No active clients yet.</div>'}</div></div></div>`};
const tilesH=b=>`<div><div class="eyebrow" style="margin-bottom:8px">All modules</div><div class="tiles">${MODS.map(([k,l],i)=>`<button class="tile" data-a="go" data-m="${k}">${b[k]?`<u>${b[k]}</u>`:''}${ico(k)}<i>${pad(i+1)}</i><span>${l}</span></button>`).join('')}</div></div>`;

/* ----- 02 Clients ----- */
const clientFields=()=>[{k:'name',l:'Client or business name',req:1,full:1},{k:'legal',l:'Type of business',t:'select',o:['Limited company','Business name (sole owner)','Individual','Non-profit']},{k:'industry',l:'Industry',t:'select',o:INDUSTRIES},{k:'contact',l:'Contact person'},{k:'phone',l:'Phone'},{k:'email',l:'Email',t:'email'},{k:'software',l:'Accounting software',t:'select',o:SOFTWARE},{k:'status',l:'Status',t:'select',o:['Active','Onboarding','Prospect','Paused','Former']},{k:'fee',l:'Monthly fee',t:'number'},{k:'currency',l:'Currency the books are kept in',t:'select',o:['₦','$','£','€']},{k:'yearEnd',l:'Financial year ends',t:'select',o:MONF.map((m,i)=>[i+1,m]),d:12},{k:'tin',l:'Tax ID (TIN)'},{k:'rc',l:'CAC number'},{k:'vat',l:'Files VAT returns',t:'check'},{k:'wht',l:'Deducts withholding tax',t:'check'},{k:'paye',l:'Has staff on PAYE',t:'check'},{k:'pension',l:'Remits pension',t:'check'},{k:'notes',l:'Notes',t:'textarea'}];
V.clients=()=>{const tb=tab('list');let body;
  if(tb==='list'){const rows=clients().map(c=>`<tr><td><b>${esc(c.name)}</b>${c.example?' <span class="chip gold">Example</span>':''}<div class="sm mut">${esc(c.legal||'')}${c.contact?' · '+esc(c.contact):''}</div></td><td>${esc(c.industry||'')}</td><td>${esc(c.software||'')}</td><td>${['vat','wht','paye','pension'].filter(k=>c[k]).map(k=>`<span class="chip">${k.toUpperCase()}</span>`).join(' ')}</td><td class="n">${c.fee?esc(c.currency||'₦')+N(c.fee):''}</td><td><span class="chip ${c.status==='Active'?'ok':c.status==='Onboarding'?'warn':''}">${esc(c.status||'')}</span></td><td class="n"><button class="btn sm" data-a="openClient" data-id="${c.id}" data-m="dashboard">Work on</button> <button class="btn sm" data-a="clientEdit" data-id="${c.id}">Edit</button></td></tr>`);
    body=tbl(['Client','Industry','Software','Obligations','#Monthly fee','Status',''],rows,'<b>No clients yet</b>Add each business you keep books for. Their tax obligations drive the compliance calendar.')}
  else{const inv=all('invoices').sort((a,b)=>a.no<b.no?1:-1);
    body=`<div class="row"><button class="btn pri" data-a="invMonth">Create ${pLabel(ui.period)} invoices</button><button class="btn" data-a="invNew">New invoice</button></div>`+tbl(['Invoice','Client','Date','For','#Amount','Status',''],inv.map(i=>`<tr><td>${esc(i.no)}</td><td>${esc(cname(i.clientId))}</td><td>${fd(i.date)}</td><td>${esc(i.desc)}</td><td class="n">${esc((cache.clients[i.clientId]||{}).currency||'₦')}${N(i.amount)}</td><td><span class="chip ${i.status==='Paid'?'ok':'warn'}">${esc(i.status)}${i.paidOn?' '+fd(i.paidOn):''}</span></td><td class="n"><button class="btn sm" data-a="invPaid" data-id="${i.id}">${i.status==='Paid'?'Mark unpaid':'Mark paid'}</button> <button class="btn sm" data-a="invFile" data-id="${i.id}">Download</button> <button class="btn sm" data-a="invEdit" data-id="${i.id}">Edit</button></td></tr>`),'<b>No invoices yet</b>Create this month’s invoices for every active client with a monthly fee in one click.')}
  return head('Clients','Client records and your own billing.','<button class="btn pri" data-a="clientNew">Add client</button>')+tabsH([['list','Client list'],['billing','My invoices']],tb)+body};
ACT.clientNew=()=>openForm('Add client',clientFields(),{status:'Active',currency:'₦',legal:'Limited company'},v=>{const c=put('clients',{...v,created:today()});ui.client=c.id;saveUi()});
ACT.clientEdit=d=>{const c=cache.clients[d.id];openForm('Edit client',clientFields(),c,v=>put('clients',{...c,...v}),{del:['clientDel',c.id]})};
ACT.clientDel=d=>confirmBox('Delete this client and all of its records?','Delete client',()=>{COLS.filter(c=>c!=='clients'&&c!=='config').forEach(col=>all(col).filter(x=>x.clientId===d.id).forEach(x=>del(col,x.id)));del('clients',d.id);if(ui.client===d.id)ui.client='';toast('Client deleted')});
ACT.openClient=d=>{ui.client=d.id;saveUi();go(d.m||'dashboard')};
const nextInv=()=>{const y=today().slice(0,4),pre=firm().prefix+'-'+y+'-';const n=all('invoices').filter(i=>(i.no||'').startsWith(pre)).reduce((m,i)=>Math.max(m,+i.no.slice(pre.length)||0),0);return pre+String(n+1).padStart(3,'0')};
const invFields=()=>[{k:'clientId',l:'Client',t:'select',o:clients().map(c=>[c.id,c.name])},{k:'no',l:'Invoice number'},{k:'date',l:'Invoice date',t:'date'},{k:'amount',l:'Amount',t:'number'},{k:'desc',l:'Description',full:1},{k:'status',l:'Status',t:'select',o:['Unpaid','Paid']}];
ACT.invNew=()=>{if(!clients().length)return toast('Add a client first');openForm('New invoice',invFields(),{clientId:ui.client||clients()[0].id,no:nextInv(),date:today(),status:'Unpaid',desc:'Bookkeeping services for '+pLabel(ui.period)},v=>put('invoices',{...v,period:ui.period}))};
ACT.invEdit=d=>{const i=cache.invoices[d.id];openForm('Edit invoice',invFields(),i,v=>put('invoices',{...i,...v}),{del:['invDel',i.id]})};
ACT.invDel=d=>{del('invoices',d.id);closeModal()};
ACT.invPaid=d=>{const i=cache.invoices[d.id];put('invoices',{...i,status:i.status==='Paid'?'Unpaid':'Paid',paidOn:i.status==='Paid'?'':today()})};
ACT.invMonth=()=>{let n=0;clients().filter(c=>c.status==='Active'&&+c.fee>0&&!all('invoices').some(i=>i.clientId===c.id&&i.period===ui.period&&i.retainer)).forEach(c=>{put('invoices',{clientId:c.id,no:nextInv(),date:today(),period:ui.period,retainer:true,amount:+c.fee,status:'Unpaid',desc:'Monthly bookkeeping retainer for '+pLabel(ui.period)});n++});toast(n?n+' invoice'+(n>1?'s':'')+' created':'Every active client with a fee already has an invoice for this month')};
ACT.invFile=d=>{const i=cache.invoices[d.id],c=cache.clients[i.clientId]||{},f=firm(),k=c.currency||'₦';
  pdfOut('Invoice '+i.no+'.pdf',[['Invoice',[['Invoice '+i.no],['Date: '+fd(i.date)],[],['Billed to: '+(c.name||'')+(c.contact?', attention '+c.contact:'')],...(f.address?[['From: '+f.address]]:[]),[],['Description','Amount ('+k+')'],[i.desc,+i.amount||0],['Total due',+i.amount||0],[],...(f.bank?[['Payment details'],...String(f.bank).split('\n').map(l=>[l])]:[]),[],['Thank you for your business.']]]])};

/* ----- 03 Documents ----- */
V.documents=()=>{const list=all('docs').filter(d=>(!ui.client||d.clientId===ui.client)&&d.period===ui.period).sort((a,b)=>(cname(a.clientId)+a.name).localeCompare(cname(b.clientId)+b.name));
  const rows=list.map(d=>`<tr><td><b>${esc(d.name)}</b>${d.note?`<div class="sm mut">${esc(d.note)}</div>`:''}</td><td>${esc(cname(d.clientId))}</td><td><select data-c="docStatus" data-id="${d.id}">${['Requested','Received','Reviewed','Not needed'].map(s=>`<option ${s===d.status?'selected':''}>${s}</option>`).join('')}</select></td><td>${fd(d.received)}</td><td>${esc(d.where||'')}</td><td class="n"><button class="btn sm" data-a="docEdit" data-id="${d.id}">Edit</button></td></tr>`);
  const wait=list.filter(d=>d.status==='Requested').length;
  return head('Documents','What each client owes you for the month, what has arrived and where you filed it.',`<button class="btn pri" data-a="docGen">Create ${pLabel(ui.period)} request list</button><button class="btn" data-a="docNew">Add item</button><button class="btn" data-a="docMsg" ${wait?'':'disabled'}>Write reminder message</button>`)+
  `<div class="row"><span class="chip warn">${wait} awaited</span><span class="chip ok">${list.filter(d=>d.status==='Received'||d.status==='Reviewed').length} received</span></div>`+
  tbl(['Document','Client','Status','Received','Filed in',''],rows,`<b>No document requests for ${pLabel(ui.period)}</b>Create the standard request list for ${ui.client?esc(cname(ui.client)):'every active client'} in one click.`)};
const docFields=()=>[{k:'name',l:'Document',req:1,full:1},{k:'clientId',l:'Client',t:'select',o:clients().map(c=>[c.id,c.name])},{k:'status',l:'Status',t:'select',o:['Requested','Received','Reviewed','Not needed']},{k:'received',l:'Date received',t:'date'},{k:'where',l:'Filed in (folder or link)'},{k:'note',l:'Note',t:'textarea'}];
ACT.docNew=()=>{if(!clients().length)return toast('Add a client first');openForm('Add document',docFields(),{clientId:ui.client||clients()[0].id,status:'Requested'},v=>put('docs',{...v,period:ui.period}))};
ACT.docEdit=d=>{const x=cache.docs[d.id];openForm('Edit document',docFields(),x,v=>put('docs',{...x,...v}),{del:['docDel',x.id]})};
ACT.docDel=d=>{del('docs',d.id);closeModal()};
CH.docStatus=(d,el)=>{const x=cache.docs[d.id];put('docs',{...x,status:el.value,received:el.value==='Received'&&!x.received?today():x.received})};
ACT.docGen=()=>{const tpl=cfg('docs').list||DEF_DOCS;let n=0;clients().filter(c=>(ui.client?c.id===ui.client:c.status==='Active'||c.status==='Onboarding')).forEach(c=>tpl.forEach(name=>{if(!all('docs').some(d=>d.clientId===c.id&&d.period===ui.period&&d.name===name)){put('docs',{clientId:c.id,period:ui.period,name,status:'Requested'});n++}}));toast(n?n+' requests created':'The list for this month already exists')};
ACT.docMsg=()=>{const by={};all('docs').filter(d=>d.period===ui.period&&d.status==='Requested'&&(!ui.client||d.clientId===ui.client)).forEach(d=>(by[d.clientId]=by[d.clientId]||[]).push(d.name));
  const txt=Object.keys(by).map(id=>{const c=cache.clients[id]||{};return`Good day ${c.contact||''},\n\nTo complete the ${pLabel(ui.period)} books for ${c.name}, I still need the following:\n${by[id].map(n=>'• '+n).join('\n')}\n\nPlease send them when you can so your report is ready on time.\n\nThank you,\n${firm().owner}\n${firm().name}`}).join('\n\n--------------------\n\n');showText('Reminder message',txt)};

/* ----- 04 Tasks ----- */
V.tasks=()=>{const f=tab('open'),t=today();let list=all('tasks').filter(x=>!ui.client||x.clientId===ui.client);
  list=list.filter(x=>f==='all'?true:f==='done'?x.done:f==='overdue'?!x.done&&x.due&&x.due<t:f==='week'?!x.done&&x.due&&x.due<=dAdd(t,7):!x.done).sort((a,b)=>(a.due||'9')<(b.due||'9')?-1:1);
  const rows=list.map(x=>`<tr><td><input type="checkbox" aria-label="Done" data-c="taskTick" data-id="${x.id}" ${x.done?'checked':''}></td><td><b>${esc(x.title)}</b>${x.note?`<div class="sm mut">${esc(x.note)}</div>`:''}</td><td>${esc(cname(x.clientId))}</td><td>${fd(x.due)}</td><td>${x.due?stChip(x.due,x.done):''}</td><td>${esc(x.priority||'')}</td><td>${esc(x.repeat&&x.repeat!=='None'?x.repeat:'')}</td><td>${esc(x.who||'')}</td><td class="n"><button class="btn sm" data-a="taskEdit" data-id="${x.id}">Edit</button></td></tr>`);
  return head('Tasks','Your to-do list across clients. Repeating tasks create their next date when you tick them off.','<button class="btn pri" data-a="taskNew">Add task</button>')+tabsH([['open','Open'],['overdue','Overdue'],['week','Due this week'],['done','Done'],['all','All']],f)+tbl(['','Task','Client','Due','','Priority','Repeats','Who',''],rows,'<b>No tasks in this view</b>Add a task, or start a workflow to create a full set of steps.')};
const taskFields=()=>[{k:'title',l:'Task',req:1,full:1},{k:'clientId',l:'Client',t:'select',o:clientOpts()},{k:'due',l:'Due date',t:'date'},{k:'priority',l:'Priority',t:'select',o:['Normal','High','Low']},{k:'repeat',l:'Repeats',t:'select',o:['None','Weekly','Monthly','Quarterly','Yearly']},{k:'who',l:'Assigned to',t:'select',o:team().map(p=>p.name)},{k:'note',l:'Note',t:'textarea'}];
ACT.taskNew=()=>openForm('Add task',taskFields(),{clientId:ui.client,due:today(),priority:'Normal',repeat:'None',who:firm().owner},v=>put('tasks',v));
ACT.taskEdit=d=>{const x=cache.tasks[d.id];openForm('Edit task',taskFields(),x,v=>put('tasks',{...x,...v}),{del:['taskDel',x.id]})};
ACT.taskDel=d=>{del('tasks',d.id);closeModal()};
function finishTask(id,done){const x=cache.tasks[id];put('tasks',{...x,done,doneOn:done?today():''});
  if(done&&x.repeat&&x.repeat!=='None'&&x.due){const d=new Date(x.due+'T12:00:00');if(x.repeat==='Weekly')d.setDate(d.getDate()+7);else d.setMonth(d.getMonth()+({Monthly:1,Quarterly:3,Yearly:12}[x.repeat]));const{id:_,doneOn,...rest}=x;put('tasks',{...rest,done:false,due:iso(d)});toast('Done. Next one is due '+fd(iso(d)))}}
ACT.taskDone=d=>finishTask(d.id,true);
CH.taskTick=(d,el)=>finishTask(d.id,el.checked);
/* ----- 05 Bank reconciliation ----- */
let rc={bank:null,book:null,tol:3,acct:'1000',bankBal:0,bookBal:0,src:''};
const rcSum=()=>{const ub=rc.bank.filter(x=>x.m==null),uk=rc.book.filter(x=>x.m==null);const s=(l,f)=>l.filter(f).reduce((t,x)=>t+x.amt,0);
  const kIn=s(uk,x=>x.amt>0),kOut=s(uk,x=>x.amt<0),bIn=s(ub,x=>x.amt>0),bOut=s(ub,x=>x.amt<0);
  const adjBank=rc.bankBal+kIn+kOut,adjBook=rc.bookBal+bIn+bOut;return{ub,uk,kIn,kOut,bIn,bOut,adjBank,adjBook,diff:r2(adjBank-adjBook),matched:rc.bank.length-ub.length}};
V.recon=()=>{const c=cl();if(!c)return head('Bank Reconciliation')+needClient('Bank reconciliation');
  const saved=all('recons').filter(r=>r.clientId===c.id).sort((a,b)=>a.period<b.period?1:-1);
  let out=head('Bank Reconciliation','Load the bank statement, choose where the books come from, and the matching is done for you.')+
  `<div class="grid g2"><div class="card"><h2>1. Bank statement</h2><p class="mut sm">Excel, CSV or PDF as downloaded from the bank.</p><input type="file" id="rcBankFile" accept=".csv,.xls,.xlsx,.pdf" data-c="rcFile" data-side="bank"><div class="sm" style="margin-top:8px">${rc.bank?`<span class="chip ok">${rc.bank.length} lines loaded</span>`:'<span class="chip">No file yet</span>'}</div></div>
  <div class="card"><h2>2. The books</h2><div class="row"><label class="f" style="flex:1">Bank account in the books<select id="rcAcct" data-c="rcAcct">${accOpts(rc.acct,a=>a.bank)}</select></label></div><div class="row" style="margin-top:10px"><button class="btn" data-a="rcLedger">Use Bookkeeping entries for the same dates</button></div><p class="mut sm">Or load an account export from Zoho, Sage or Excel (Excel, CSV or PDF):</p><input type="file" id="rcBookFile" accept=".csv,.xls,.xlsx,.pdf" data-c="rcFile" data-side="book"><div class="sm row" style="margin-top:8px">${rc.book?`<span class="chip ok">${rc.book.length} lines from ${esc(rc.src)}</span><button class="btn sm" data-a="rcFlip">Swap money in and out</button>`:'<span class="chip">Nothing loaded yet</span>'}</div></div></div>`;
  if(rc.bank&&rc.book){const s=rcSum(),tb=tab('bank');
    const line=x=>`<tr><td>${fd(x.date)}</td><td>${esc(x.desc)}</td><td class="n">${x.amt>0?N(x.amt):''}</td><td class="n">${x.amt<0?N(-x.amt):''}</td></tr>`;
    const lists={bank:s.ub.map(line),book:s.uk.map(line),matched:rc.bank.filter(x=>x.m!=null).map(x=>`<tr><td>${fd(x.date)}</td><td>${esc(x.desc)}</td><td>${fd(rc.book[x.m].date)}</td><td>${esc(rc.book[x.m].desc)}</td><td class="n">${N(x.amt)}</td></tr>`)};
    out+=`<div class="row"><label class="f">Match dates within (days)<input type="number" id="rcTol" min="0" max="31" value="${rc.tol}" data-c="rcTol" style="width:120px"></label><span style="flex:1"></span><button class="btn" data-a="rcPost" ${s.ub.length?'':'disabled'}>Send ${s.ub.length} bank-only lines to Bookkeeping</button><button class="btn" data-a="rcExport">Download Excel</button><button class="btn" data-a="rcPdf">Download PDF</button><button class="btn pri" data-a="rcSave">Save reconciliation</button></div>
    <div class="grid g4"><div class="kpi good"><span>Matched</span><b>${s.matched}</b></div><div class="kpi ${s.ub.length?'bad':''}"><span>On bank, not in books</span><b>${s.ub.length}</b></div><div class="kpi ${s.uk.length?'bad':''}"><span>In books, not on bank</span><b>${s.uk.length}</b></div><div class="kpi ${Math.abs(s.diff)<0.01?'good':'bad'}"><span>Difference</span><b>${N(s.diff)}</b><em>${Math.abs(s.diff)<0.01?'Reconciled':'Still to explain'}</em></div></div>
    <div class="grid g2"><div class="card"><h2>Reconciliation statement</h2><div class="tw"><table class="t"><tbody>
    <tr><td>Balance per bank statement</td><td class="n"><input type="number" step="any" id="rcBankBal" value="${rc.bankBal}" data-c="rcBal" data-k="bankBal" style="width:150px;text-align:right"></td></tr>
    <tr><td class="ind">Add: receipts in books not yet on bank</td><td class="n">${N(s.kIn)}</td></tr><tr><td class="ind">Less: payments in books not yet on bank</td><td class="n">${N(s.kOut)}</td></tr><tr class="sub"><td>Adjusted bank balance</td><td class="n">${N(s.adjBank)}</td></tr>
    <tr><td>Balance per books</td><td class="n"><input type="number" step="any" id="rcBookBal" value="${rc.bookBal}" data-c="rcBal" data-k="bookBal" style="width:150px;text-align:right"></td></tr>
    <tr><td class="ind">Add: receipts on bank not in books</td><td class="n">${N(s.bIn)}</td></tr><tr><td class="ind">Less: payments on bank not in books</td><td class="n">${N(s.bOut)}</td></tr><tr class="sub"><td>Adjusted book balance</td><td class="n">${N(s.adjBook)}</td></tr>
    <tr class="tot"><td>Difference</td><td class="n">${N(s.diff)}</td></tr></tbody></table></div></div>
    <div class="card"><h2>Lines</h2>${tabsH([['bank','On bank only ('+s.ub.length+')'],['book','In books only ('+s.uk.length+')'],['matched','Matched ('+s.matched+')']],tb)}<div style="margin-top:10px;max-height:420px;overflow:auto">${tbl(tb==='matched'?['Bank date','Bank description','Book date','Book description','#Amount']:['Date','Description','#Money in','#Money out'],lists[tb],'Nothing in this list.')}</div></div></div>`}
  out+=`<div class="card"><h2>Saved reconciliations</h2>${tbl(['Month','Account','#Bank balance','#Book balance','#Difference','Matched','Open items','Saved'],saved.map(r=>`<tr><td>${pLabel(r.period)}</td><td>${esc(accName(r.acct))}</td><td class="n">${N(r.bankBal)}</td><td class="n">${N(r.bookBal)}</td><td class="n ${Math.abs(r.diff)<0.01?'good':'bad'}">${N(r.diff)}</td><td>${r.matched}</td><td>${r.open}</td><td>${fd(r.on)}</td></tr>`),'No reconciliation saved for this client yet.')}</div>`;
  return out};
const rematch=()=>{if(rc.bank&&rc.book)matchUp(rc.bank,rc.book,rc.tol)};
CH.rcFile=async(d,el)=>{const f=el.files[0];if(!f)return;try{const r=await readTxns(f,d.side);if(r.err)return toast(r.err);if(!r.rows.length)return toast('No transactions found in that file.');pdfNote(f,r);
  if(d.side==='bank'){rc.bank=r.rows;if(r.lastBal!=null)rc.bankBal=r.lastBal}else{rc.book=r.rows;rc.src=f.name;if(r.lastBal!=null)rc.bookBal=r.lastBal}rematch();draw(true)}catch(e){toast('That file could not be read. Try the Excel or CSV version of it.')}};
const pdfNote=(f,r)=>{if(!/\.pdf$/i.test(f.name))return;toast(r.noBal?r.rows.length+' lines read. This statement has no running balance to check against, so review the amounts.':r.unchecked?r.unchecked+' of '+r.rows.length+' lines did not agree with the running balance. Check them before you post.':r.rows.length+' lines read. Every line agrees with the statement\u2019s running balance.')};
CH.rcAcct=(d,el)=>{rc.acct=el.value};
CH.rcTol=(d,el)=>{rc.tol=Math.max(0,+el.value||0);rematch();draw(true)};
CH.rcBal=(d,el)=>{rc[d.k]=+el.value||0;draw(true)};
ACT.rcLedger=()=>{const c=cl();let from=ui.period+'-01',to=pEnd(ui.period);if(rc.bank&&rc.bank.length){const ds=rc.bank.map(x=>x.date).sort();from=ds[0];to=ds[ds.length-1]}
  rc.book=ledRows(c.id,from.slice(0,7),to.slice(0,7)).filter(r=>(r.dr===rc.acct||r.cr===rc.acct)&&r.date>=from&&r.date<=to).map(r=>({date:r.date,desc:r.desc,amt:acctAmt(r,rc.acct)})).filter(r=>Math.abs(r.amt)>0.004);rc.src='Bookkeeping';
  rc.bookBal=r2(ledRows(c.id,null,to.slice(0,7)).filter(r=>r.date<=to).reduce((t,r)=>t+acctAmt(r,rc.acct),0));rematch();draw(true);if(!rc.book.length)toast('No Bookkeeping entries for that account in the statement\u2019s dates.')};
ACT.rcFlip=()=>{rc.book.forEach(x=>x.amt=-x.amt);rematch();draw(true)};
ACT.rcSave=()=>{const s=rcSum(),c=cl();put('recons',{id:c.id+'_'+ui.period+'_'+rc.acct,clientId:c.id,period:ui.period,acct:rc.acct,bankBal:rc.bankBal,bookBal:rc.bookBal,diff:s.diff,matched:s.matched,open:s.ub.length+s.uk.length,on:today()});toast('Reconciliation saved')};
ACT.rcExport=()=>{const s=rcSum(),c=cl();const L=l=>[['Date','Description','Money in','Money out'],...l.map(x=>[x.date,x.desc,x.amt>0?x.amt:'',x.amt<0?-x.amt:''])];
  xlsxOut(`${c.name} bank reconciliation ${ui.period}.xlsx`,[['Statement',[[c.name],['Bank reconciliation, '+pLabel(ui.period)+', '+accName(rc.acct)],[],['Balance per bank statement',rc.bankBal],['Add: receipts in books not yet on bank',s.kIn],['Less: payments in books not yet on bank',s.kOut],['Adjusted bank balance',s.adjBank],[],['Balance per books',rc.bookBal],['Add: receipts on bank not in books',s.bIn],['Less: payments on bank not in books',s.bOut],['Adjusted book balance',s.adjBook],[],['Difference',s.diff]],[48,18]],['On bank only',L(s.ub),[12,60,16,16]],['In books only',L(s.uk),[12,60,16,16]],['Matched',[['Bank date','Bank description','Book date','Book description','Amount'],...rc.bank.filter(x=>x.m!=null).map(x=>[x.date,x.desc,rc.book[x.m].date,rc.book[x.m].desc,x.amt])],[12,45,12,45,16]]])};
ACT.rcPost=()=>{const s=rcSum();stage(s.ub.map(x=>({date:x.date,desc:x.desc,ref:'',amt:x.amt})),rc.acct);go('bookkeeping')};

/* ----- 06 Bookkeeping ----- */
let imp=null,bkType='out';
function stage(rows,bank){const c=cl();const ex=new Set(ledRows(c.id).map(r=>r.date+'|'+Math.abs(r.fx&&r.fx.acct===bank?r.fx.amt:r.amt)+'|'+r.desc));const cnt={};rows.forEach(r=>{const m=r.date.slice(0,7);cnt[m]=(cnt[m]||0)+1});const p=Object.keys(cnt).sort((x,y)=>cnt[y]-cnt[x])[0]||ui.period;
  const trs=ledRows(c.id).filter(r=>isBank(r.dr)&&isBank(r.cr)&&(r.dr===bank||r.cr===bank)).map(r=>({id:r.id,d:r.date,a:acctAmt(r,bank),cross:!!(r.fx||r.fx2),used:false}));
  imp={bank,rate:isForeign(bank)?rateFor(c,acctCur(bank),p):0,rows:rows.map(r=>{let dup=ex.has(r.date+'|'+Math.abs(r.amt)+'|'+r.desc),tr=false,fix=null;
    if(!dup){const near=t=>!t.used&&Math.abs(dDiff(t.d,r.date))<=3;let m=trs.find(t=>near(t)&&Math.abs(t.a-r.amt)<0.005);
      if(!m){m=trs.find(t=>near(t)&&t.cross&&t.a*r.amt>0&&Math.abs(t.a-r.amt)<=Math.abs(r.amt)*0.05);if(m)fix=m.id}
      if(m){m.used=true;dup=tr=true}}
    return{...r,acc:suggest(r.desc),dup,tr,fix,inc:!dup}})};ui.tab.bookkeeping='import'}
V.bookkeeping=()=>{const c=cl();if(!c)return head('Bookkeeping')+needClient('Bookkeeping');const tb=tab('entries');
  let out=head('Bookkeeping','Record money in and money out, or load a bank statement and let the rules sort it. Every entry feeds the reports and statements.')+tabsH([['entries','Entries'],['import','Import bank statement'],['banks','Bank accounts and rates']],tb);
  if(tb==='entries'){const rows=ledRows(c.id,ui.period,ui.period);let tin=0,tout=0;
    const tr=rows.map(r=>{const bi=isBank(r.dr),bo=isBank(r.cr);let a,kind,i='',o='';
      if(bi&&bo){a=accName(r.cr)+' → '+accName(r.dr);kind='Transfer'}else if(bi){a=accName(r.cr);kind='In';i=N(r.amt);tin+=r.amt}else if(bo){a=accName(r.dr);kind='Out';o=N(r.amt);tout+=r.amt}else{a='Dr '+accName(r.dr)+' / Cr '+accName(r.cr);kind='Journal'}
      const un=r.dr===SUSP||r.cr===SUSP;
      return`<tr><td>${fd(r.date)}</td><td>${esc(r.desc)}${r.ref?`<div class="sm mut">${esc(r.ref)}</div>`:''}${[r.fx,r.fx2].filter(f=>f&&f.amt).map(f=>`<div class="sm mut">${esc(f.cur)}${N(f.amt)} at ${N(f.rate)}${f.est?' (estimated until its statement is loaded)':''}</div>`).join('')}</td><td>${un?'<span class="chip bad">Uncategorised</span>':esc(a)}</td><td><span class="chip">${kind}</span></td><td class="n">${i||(kind==='Transfer'||kind==='Journal'?'<span class="mut">'+N(r.amt)+'</span>':'')}</td><td class="n">${o}</td><td class="n"><button class="btn sm" data-a="rowEdit" data-id="${r.id}">Edit</button></td></tr>`});
    if(tr.length)tr.push(`<tr class="tot"><td colspan="4">Total through bank and cash</td><td class="n">${N(tin)}</td><td class="n">${N(tout)}</td><td></td></tr>`);
    const jr=bkType==='journal';
    out+=`<form class="card" data-f="addEntry"><h2>New entry</h2><div class="row" style="align-items:flex-end">
      <label class="f">Type<select name="type" id="bkType" data-c="bkType"><option value="out" ${bkType==='out'?'selected':''}>Money out</option><option value="in" ${bkType==='in'?'selected':''}>Money in</option><option value="journal" ${jr?'selected':''}>Journal</option></select></label>
      <label class="f">Date<input type="date" name="date" id="bkDate" value="${today().slice(0,7)===ui.period?today():ui.period+'-01'}" required></label>
      <label class="f" style="flex:2;min-width:160px">Description<input name="desc" id="bkDesc" required></label>
      <label class="f">${jr?'Debit':bkType==='in'?'Received for':'Paid for'}<select name="a1" id="bkA1">${accOpts(jr?'':bkType==='in'?'4000':'6000')}</select></label>
      <label class="f">${jr?'Credit':bkType==='in'?'Paid into':'Paid from'}<select name="a2" id="bkA2">${accOpts('1000',jr?null:a=>a.bank)}</select></label>
      <label class="f">Amount<input type="number" step="any" min="0.01" name="amt" id="bkAmt" required style="width:130px"></label>${banks().some(x=>isForeign(x.code))?`<label class="f">Rate (foreign accounts)<input type="number" step="any" min="0" name="rate" id="bkRate" placeholder="month rate" style="width:120px"></label>`:''}
      <label class="f">Reference<input name="ref" id="bkRef" style="width:110px"></label>
      <button class="btn pri" type="submit">Add entry</button></div>${banks().some(x=>isForeign(x.code))?`<p class="sm mut" style="margin:8px 0 0">For a foreign-currency bank account, enter the amount in that account\u2019s currency. It is converted to ${esc(baseCur())} at the rate you enter, or at the month\u2019s saved rate if you leave it blank.</p>`:''}</form>`+
      tbl(['Date','Description','Account','Type','#Money in','#Money out',''],tr,`<b>No entries for ${pLabel(ui.period)}</b>Add an entry above, or import the bank statement for this month.`)}
  else if(tb==='banks')out+=banksView(c);
  else if(!imp)out+=`<div class="card"><h2>Load a bank statement</h2><p class="mut">Excel, CSV or PDF. Each line is given an account using your rules; you review before anything is posted.</p><div class="row" style="align-items:flex-end"><label class="f">Bank account this statement belongs to<select id="impBank">${accOpts('1000',a=>a.bank)}</select></label><input type="file" id="impFile" accept=".csv,.xls,.xlsx,.pdf" data-c="impFile"></div></div><div class="note">Rules match a word in the description to an account. You have <b>${rules().length}</b> rules. Edit them under Settings, Sorting rules.</div>`;
  else{const show=imp.rows.slice(0,400),un=imp.rows.filter(r=>r.inc&&r.acc===SUSP).length;
    out+=`<div class="row"><span class="chip">${imp.rows.length} lines</span><span class="chip warn">${un} still uncategorised</span><span class="chip">${imp.rows.filter(r=>r.dup).length} already in the books</span>${isForeign(imp.bank)?`<label class="f">Rate: ${esc(baseCur())} per 1 ${esc(acctCur(imp.bank))}<input type="number" step="any" min="0" id="impRate" data-c="impRate" value="${imp.rate||''}" style="width:120px"></label>`:''}<span style="flex:1"></span><button class="btn" data-a="ruleNew">Add a sorting rule</button><button class="btn" data-a="impCancel">Discard</button><button class="btn pri" data-a="impPost">Post ${imp.rows.filter(r=>r.inc).length} entries to ${esc(accName(imp.bank))}</button></div>`+
    tbl(['Post','Date','Description','#Money in','#Money out','Account'],show.map((r,i)=>`<tr><td><input type="checkbox" aria-label="Include" data-c="impInc" data-i="${i}" ${r.inc?'checked':''}></td><td>${fd(r.date)}</td><td>${esc(r.desc)}${r.tr?` <span class="chip gold">Transfer already recorded from the other account${r.fix?'; its amount will be updated to this one':''}</span>`:r.dup?' <span class="chip">Already in books</span>':''}</td><td class="n">${r.amt>0?N(r.amt):''}</td><td class="n">${r.amt<0?N(-r.amt):''}</td><td><select aria-label="Account" data-c="impAcc" data-i="${i}">${accOpts(r.acc)}</select></td></tr>`))+(imp.rows.length>400?`<div class="note">Showing the first 400 lines. All ${imp.rows.length} will be posted with their suggested accounts.</div>`:'')}
  return out};
CH.bkType=(d,el)=>{bkType=el.value;draw(true)};
FM.addEntry=(v)=>{const amt=+v.amt;if(!(amt>0)||!v.date)return toast('Enter a date and an amount above zero.');if(v.a1===v.a2)return toast('Choose two different accounts.');
  const f1=isForeign(v.a1),f2=isForeign(v.a2),known=f1&&!f2?v.a1:v.a2,other=known===v.a1?v.a2:v.a1,L=legs(cl(),v.date,known,other,amt,v.rate);if(L.err)return toast(L.err);
  const r=v.type==='in'?{dr:v.a2,cr:v.a1}:{dr:v.a1,cr:v.a2};addRows(cl().id,[{date:v.date,desc:v.desc,ref:v.ref,...r,...L}]);if(v.date.slice(0,7)!==ui.period){ui.period=v.date.slice(0,7);saveUi()}toast(L.fx?'Entry added: '+baseCur()+N(L.amt)+' in the books':'Entry added');draw(true)};
const findRow=id=>ledRows(cl().id).find(r=>r.id===id);
ACT.rowEdit=d=>{const r=findRow(d.id),A=r.fx&&r.fx.amt?r.fx:null,B=r.fx2&&r.fx2.amt?r.fx2:null;
  openForm('Edit entry',[{k:'date',l:'Date',t:'date',req:1},{k:'amt',l:'Amount in the books ('+baseCur()+')',t:'number',req:1},...(A?[{k:'fxa',l:'Amount in '+A.cur+' ('+accName(A.acct)+')',t:'number'}]:[]),...(B?[{k:'fxb',l:'Amount in '+B.cur+' ('+accName(B.acct)+')',t:'number'}]:[]),{k:'desc',l:'Description',full:1},{k:'dr',l:'Debit (where the money went)',t:'select',o:accList()},{k:'cr',l:'Credit (where it came from)',t:'select',o:accList()},{k:'ref',l:'Reference'}],{...r,fxa:A?A.amt:0,fxb:B?B.amt:0},v=>{if(v.dr===v.cr){toast('Choose two different accounts.');return false}const{fxa,fxb,...rest}=v,x={};
    for(const[k,f,val]of[['fx',r.fx,fxa],['fx2',r.fx2,fxb]]){if(!f)continue;if(f.reval){x[k]=f;continue}if(!(val>0)){toast('Enter the foreign amount.');return false}if(f.acct!==v.dr&&f.acct!==v.cr){toast('Keep the foreign-currency bank account on one side of this entry.');return false}x[k]={acct:f.acct,cur:f.cur,amt:val,rate:Math.round(v.amt/val*10000)/10000}}
    delRow(cl().id,r.id);addRows(cl().id,[{...rest,...x}])},{del:['rowDel',r.id],note:'Money in: debit the bank account. Money out: credit the bank account.'})};
ACT.rowDel=d=>{delRow(cl().id,d.id);closeModal()};
CH.impFile=async(d,el)=>{const f=el.files[0];if(!f)return;const bank=$('#impBank').value;try{const r=await readTxns(f,'bank');if(r.err)return toast(r.err);if(!r.rows.length)return toast('No transactions found in that file.');pdfNote(f,r);stage(r.rows,bank);draw(true)}catch(e){toast('That file could not be read. Try the Excel or CSV version of it.')}};
CH.impInc=(d,el)=>{imp.rows[+d.i].inc=el.checked};
CH.impAcc=(d,el)=>{imp.rows[+d.i].acc=el.value};
CH.impRate=(d,el)=>{imp.rate=+el.value||0};
ACT.impCancel=()=>{imp=null;draw(true)};
ACT.impPost=()=>{const c=cl(),fgn=isForeign(imp.bank);if(fgn&&!(+imp.rate>0))return toast('Enter the exchange rate for this statement first.');
  const rows=[];for(const r of imp.rows.filter(r=>r.inc)){if(r.acc===imp.bank)continue;const L=legs(c,r.date,imp.bank,r.acc,Math.abs(r.amt),imp.rate);if(L.err)return toast(L.err);rows.push({date:r.date,desc:r.desc,ref:r.ref||'',dr:r.amt>0?imp.bank:r.acc,cr:r.amt>0?r.acc:imp.bank,...L})}
  const fixes=imp.rows.filter(r=>r.tr&&r.fix&&!r.inc);if(!rows.length&&!fixes.length)return toast('Nothing ticked to post.');
  fixes.forEach(r=>updRow(c.id,r.fix,x=>{const v=Math.abs(r.amt),f=fxLeg(x,imp.bank);if(f){f.amt=v;f.rate=Math.round(x.amt/v*10000)/10000;delete f.est}else{x.amt=v;[x.fx,x.fx2].forEach(g=>{if(g&&g.amt){g.rate=Math.round(v/g.amt*10000)/10000}})}return x}));
  if(rows.length)addRows(c.id,rows);const cnt={};imp.rows.forEach(r=>{const m=r.date.slice(0,7);cnt[m]=(cnt[m]||0)+1});const p=Object.keys(cnt).sort((x,y)=>cnt[y]-cnt[x])[0];imp=null;ui.tab.bookkeeping='entries';ui.period=p;saveUi();toast(rows.length+' entries posted'+(fixes.length?', '+fixes.length+' transfer'+(fixes.length>1?'s':'')+' updated to the actual amount':''));draw(true)};
ACT.ruleNew=()=>openForm('Add a sorting rule',[{k:'k',l:'When the description contains',req:1},{k:'a',l:'Put it in',t:'select',o:accList()}],{},v=>{put('config',{id:'rules',list:[{k:v.k.toLowerCase(),a:v.a},...rules()]});if(imp)imp.rows.forEach(r=>{if(r.acc===SUSP)r.acc=suggest(r.desc)})});

/* ----- 07 Monthly closing ----- */
V.closing=()=>{const c=cl();if(!c)return head('Monthly Closing')+needClient('Monthly closing');const id=c.id+'_'+ui.period,cz=cache.closes[id]||{done:{}},tpl=closeTpl();const done=cz.done||{};const n=tpl.filter(i=>done[i.id]).length;
  const b=bal(ledRows(c.id,null,ui.period)),un=r2(b[SUSP]||0),rec=all('recons').filter(r=>r.clientId===c.id&&r.period===ui.period),cnt=ledRows(c.id,ui.period,ui.period).length;
  return head('Monthly Closing','The same checklist every month, so nothing is missed before the report goes out.',cz.signed?`<span class="chip ok">Closed ${fd(cz.signedOn)}</span><button class="btn" data-a="closeSign">Reopen month</button>`:`<button class="btn pri" data-a="closeSign" ${n===tpl.length?'':'disabled'}>Close ${pLabel(ui.period)}</button>`)+
  `<div class="grid g4"><div class="kpi"><span>Checklist</span><b>${n} / ${tpl.length}</b><div class="prog" style="margin-top:6px"><i style="width:${n/tpl.length*100}%"></i></div></div><div class="kpi"><span>Entries this month</span><b>${cnt}</b></div><div class="kpi ${Math.abs(un)>0.004?'bad':'good'}"><span>Uncategorised balance</span><b>${N(un)}</b></div><div class="kpi ${rec.length&&rec.every(r=>Math.abs(r.diff)<0.01)?'good':'bad'}"><span>Bank reconciliations</span><b>${rec.length}</b><em>${rec.length?(rec.every(r=>Math.abs(r.diff)<0.01)?'All agree':'Difference remains'):'None saved'}</em></div></div>
  <div class="card"><div class="list">${tpl.map(i=>`<div><label class="ck gr"><input type="checkbox" data-c="closeTick" data-k="${i.id}" ${done[i.id]?'checked':''} ${cz.signed?'disabled':''}> ${esc(i.t)}</label></div>`).join('')}</div></div>
  <div class="card"><h2>Notes for this month</h2><textarea id="closeNote" data-c="closeNote" placeholder="Queries for the client, adjustments made, items carried forward">${esc(cz.note||'')}</textarea></div>`};
const closeDoc=()=>{const c=cl(),id=c.id+'_'+ui.period;return cache.closes[id]||{id,clientId:c.id,period:ui.period,done:{}}};
CH.closeTick=(d,el)=>{const x=closeDoc();put('closes',{...x,done:{...x.done,[d.k]:el.checked}})};
CH.closeNote=(d,el)=>{put('closes',{...closeDoc(),note:el.value})};
ACT.closeSign=()=>{const x=closeDoc();put('closes',{...x,signed:!x.signed,signedOn:x.signed?'':today()});toast(x.signed?'Month reopened':'Month closed')};

/* ----- 08 Reports ----- */
function repData(c,p){const prev=pAdd(p,-1),fy=fyStart(p,c);return{m:pl(c.id,p,p),pm:pl(c.id,prev,prev),ytd:pl(c.id,fy,p),b:bs(c.id,p),pb:bs(c.id,prev),fy}}
function commentary(c,p){const d=repData(c,p),m=d.m,pm=d.pm,k=c.currency||'₦',out=[];const chg=(a,b)=>b?Math.round((a-b)/Math.abs(b)*100):null;
  if(!m.inc&&!m.ex&&!m.cg)return['No entries have been recorded for '+pLabel(p)+' yet.'];
  const sc=chg(m.inc,pm.inc);out.push(`The business earned ${k}${N(m.inc)} in ${pLabel(p)}`+(sc==null?'.':sc===0?', the same as last month.':`, ${Math.abs(sc)}% ${sc>0?'more':'less'} than last month.`));
  if(m.cg)out.push(`After the cost of what was sold (${k}${N(m.cg)}), ${k}${N(m.gross)} was left. That is ${Math.round(m.margin)}% of sales${k==='₦'?', or about '+Math.round(m.margin)+' kobo kept from every naira':''}${isFinite(pm.margin)?` (last month: ${Math.round(pm.margin)}%)`:''}.`);
  if(m.ex){const top=[...m.expense].sort((a,b)=>b.amt-a.amt).slice(0,3);out.push(`Running costs came to ${k}${N(m.ex)}. The biggest were ${top.map(t=>t.name.toLowerCase()+' ('+k+N(t.amt)+')').join(', ')}.`)}
  out.push(m.net>=0?`The month ended with a profit of ${k}${N(m.net)}.`:`The month ended with a loss of ${k}${N(-m.net)}.`);
  out.push(`Money in the bank and cash at month end: ${k}${N(d.b.cash)}${d.pb.cash?`, ${d.b.cash>=d.pb.cash?'up':'down'} from ${k}${N(d.pb.cash)}`:''}.`);
  const un=d.b.asset.find(a=>a.code===SUSP);if(un)out.push(`${k}${N(un.amt)} of transactions still need to be explained before these figures are final.`);
  return out}
V.reports=()=>{const c=cl();if(!c)return head('Reports')+needClient('The monthly report');const p=ui.period,d=repData(c,p),k=c.currency||'₦',nid=c.id+'_'+p+'_rep',note=(cache.notes[nid]||{}).text||'';
  const line=(l,a,b,y,cls)=>`<tr class="${cls||''}"><td>${l}</td><td class="n">${N(a)}</td><td class="n">${N(b)}</td><td class="n">${N(y)}</td></tr>`;
  const exp=d.m.expense.length||d.ytd.expense.length?d.ytd.expense.map(e=>{const a=(d.m.expense.find(x=>x.code===e.code)||{}).amt||0,b=(d.pm.expense.find(x=>x.code===e.code)||{}).amt||0;return`<tr><td class="ind">${esc(e.name)}</td><td class="n">${N(a)}</td><td class="n">${N(b)}</td><td class="n">${N(e.amt)}</td></tr>`}).join(''):'';
  return head('Reports','A monthly report written for the business owner: plain words first, figures second.',`<button class="btn" data-a="repCopy">Copy as text</button><button class="btn" data-a="repPdf">Download PDF</button><button class="btn pri" data-a="repXls">Download Excel</button>`)+
  `<div class="grid g4"><div class="kpi"><span>Sales</span><b>${k}${N(d.m.inc)}</b></div><div class="kpi"><span>Kept after cost of sales</span><b>${pct(d.m.margin)}</b></div><div class="kpi ${d.m.net<0?'bad':'good'}"><span>${d.m.net<0?'Loss':'Profit'}</span><b>${k}${N(Math.abs(d.m.net))}</b></div><div class="kpi"><span>Bank and cash</span><b>${k}${N(d.b.cash)}</b></div></div>
  <div class="grid g2"><div class="card"><h2>What happened in ${pLabel(p)}</h2>${commentary(c,p).map(s=>`<p style="margin:0 0 8px">${esc(s)}</p>`).join('')}</div>
  <div class="card"><h2>Your notes to the client</h2><textarea id="repNote" data-c="repNote" placeholder="Anything the owner should know or decide this month">${esc(note)}</textarea>${sample?'<div class="row" style="margin-top:8px"><button class="btn" data-a="repDraft">Draft with Claude</button><span class="sm mut" id="repDraftState"></span></div>':''}</div></div>
  <div class="tw"><table class="t"><thead><tr><th></th><th class="n">${pLabel(p)}</th><th class="n">${pLabel(pAdd(p,-1))}</th><th class="n">Year to date</th></tr></thead><tbody>
  ${line('Sales and other income',d.m.inc,d.pm.inc,d.ytd.inc,'sub')}${line('Cost of what was sold',d.m.cg,d.pm.cg,d.ytd.cg)}${line('Left after cost of sales',d.m.gross,d.pm.gross,d.ytd.gross,'sub')}<tr class="hd"><td colspan="4">Running costs</td></tr>${exp}${line('Total running costs',d.m.ex,d.pm.ex,d.ytd.ex,'sub')}${line('Profit or (loss)',d.m.net,d.pm.net,d.ytd.net,'tot')}${line('Bank and cash at month end',d.b.cash,d.pb.cash,d.b.cash)}</tbody></table></div>`+bankCard(c,p)};
const bankRows=(c,p)=>{const bm=bal(ledRows(c.id,null,p));return clientBanks(c).map(b=>({b,own:ownBal(c.id,b.code,p),book:r2(bm[b.code]||0)})).filter(x=>Math.abs(x.own)>0.004||Math.abs(x.book)>0.004)};
const bankCard=(c,p)=>{const r=bankRows(c,p),base=c.currency||'₦';return r.length?`<div class="card"><h2>Bank and cash by account <small>at ${fd(pEnd(p))}</small></h2>`+tbl(['Account','#Balance','#In the books ('+base+')'],r.map(x=>`<tr><td>${esc(x.b.name)}</td><td class="n">${esc(x.b.cur)}${N(x.own)}</td><td class="n">${N(x.book)}</td></tr>`))+'</div>':''};
CH.repNote=(d,el)=>{const c=cl();put('notes',{id:c.id+'_'+ui.period+'_rep',clientId:c.id,period:ui.period,kind:'report',text:el.value})};
const repText=()=>{const c=cl(),p=ui.period,d=repData(c,p),k=c.currency||'₦',note=(cache.notes[c.id+'_'+p+'_rep']||{}).text;
  return`${c.name}\nMonthly report: ${pLabel(p)}\n\n${commentary(c,p).join('\n')}\n\nSales: ${k}${N(d.m.inc)}\nCost of what was sold: ${k}${N(d.m.cg)}\nRunning costs: ${k}${N(d.m.ex)}\nProfit or (loss): ${k}${N(d.m.net)}\nBank and cash: ${k}${N(d.b.cash)}${note?'\n\nNotes\n'+note:''}\n\nPrepared by ${firm().name}`};
ACT.repCopy=()=>copy(repText());
ACT.repXls=()=>{const c=cl(),p=ui.period,d=repData(c,p),note=(cache.notes[c.id+'_'+p+'_rep']||{}).text||'';
  const rows=[[c.name],['Monthly management report, '+pLabel(p)],[],['',pLabel(p),pLabel(pAdd(p,-1)),'Year to date'],['Sales and other income',d.m.inc,d.pm.inc,d.ytd.inc],['Cost of what was sold',d.m.cg,d.pm.cg,d.ytd.cg],['Left after cost of sales',d.m.gross,d.pm.gross,d.ytd.gross],[],['Running costs'],...d.ytd.expense.map(e=>['  '+e.name,(d.m.expense.find(x=>x.code===e.code)||{}).amt||0,(d.pm.expense.find(x=>x.code===e.code)||{}).amt||0,e.amt]),['Total running costs',d.m.ex,d.pm.ex,d.ytd.ex],[],['Profit or (loss)',d.m.net,d.pm.net,d.ytd.net],['Bank and cash at month end',d.b.cash,d.pb.cash,d.b.cash]];
  const br=bankRows(c,p);if(br.some(x=>x.b.cur!==(c.currency||'₦')))rows.push([],['Bank and cash by account'],['Account','Own currency','In the books'],...br.map(x=>[x.b.name+' ('+x.b.cur+')',x.own,x.book]));
  xlsxOut(`${c.name} report ${p}.xlsx`,[['Report',rows,[38,18,18,18]],['Summary',[['What happened'],...commentary(c,p).map(s=>[s]),[],['Notes'],[note]],[110]]])};
ACT.repDraft=async()=>{const st=$('#repDraftState'),ta=$('#repNote');st.textContent='Thinking…';try{const r=await sample('You are helping a bookkeeper write a short note to a small-business owner in Nigeria who is not an accountant. Using only the figures below, write 3 to 5 short sentences in plain, warm language: what went well, what to watch, and one practical suggestion. No jargon, no headings, no bullet points, do not invent numbers.\n\n'+repText(),{onText:({text})=>{ta.value=text;st.textContent='Writing…'}});ta.value=r.text;CH.repNote({},ta);st.textContent='Draft added. Edit it as you like.'}catch(e){st.textContent=e&&e.code==='rate_limited'?'Too many requests just now. Try again in a minute.':'Claude is not available in this view.'}};

/* ----- 09 Financial statements ----- */
let fsYtd=false;
V.statements=()=>{const c=cl();if(!c)return head('Financial Statements')+needClient('Financial statements');const p=ui.period,from=fsYtd?fyStart(p,c):p,tb=tab('pl');let body;
  const sec=(t,l,tot,lab)=>`<tr class="hd"><td colspan="2">${t}</td></tr>${l.map(x=>`<tr><td class="ind">${x.code} ${esc(x.name)}</td><td class="n">${N(x.amt)}</td></tr>`).join('')}<tr class="sub"><td>${lab}</td><td class="n">${N(tot)}</td></tr>`;
  if(tb==='pl'){const x=pl(c.id,from,p);body=`<table class="t"><tbody>${sec('Income',x.income,x.inc,'Total income')}${sec('Cost of sales',x.cogs,x.cg,'Total cost of sales')}<tr class="sub"><td>Gross profit (${pct(x.margin)})</td><td class="n">${N(x.gross)}</td></tr>${sec('Operating expenses',x.expense,x.ex,'Total operating expenses')}<tr class="tot"><td>Net profit or (loss)</td><td class="n">${N(x.net)}</td></tr></tbody></table>`}
  else if(tb==='bs'){const x=bs(c.id,p);body=`<table class="t"><tbody>${sec('Assets',x.asset,x.tA,'Total assets')}${sec('Liabilities',x.liability,x.tL,'Total liabilities')}<tr class="hd"><td colspan="2">Equity</td></tr>${x.equity.map(e=>`<tr><td class="ind">${e.code} ${esc(e.name)}</td><td class="n">${N(e.amt)}</td></tr>`).join('')}<tr><td class="ind">Retained profit to date</td><td class="n">${N(x.retained)}</td></tr><tr class="sub"><td>Total equity</td><td class="n">${N(x.tE)}</td></tr><tr class="tot"><td>Liabilities and equity</td><td class="n">${N(x.tL+x.tE)}</td></tr></tbody></table>`}
  else if(tb==='tb'){const b=bal(ledRows(c.id,null,p));let d=0,k=0;const rows=Object.keys(b).sort().filter(a=>Math.abs(b[a])>0.004).map(a=>{if(b[a]>0)d+=b[a];else k-=b[a];return`<tr><td>${a} ${esc(accName(a))}</td><td class="n">${b[a]>0?N(b[a]):''}</td><td class="n">${b[a]<0?N(-b[a]):''}</td></tr>`}).join('');
    body=`<table class="t"><thead><tr><th>Account</th><th class="n">Debit</th><th class="n">Credit</th></tr></thead><tbody>${rows}<tr class="tot"><td>Total</td><td class="n">${N(d)}</td><td class="n">${N(k)}</td></tr></tbody></table>`}
  else{const x=cashFlow(c,from,p);body=`<table class="t"><tbody><tr class="sub"><td>Bank and cash at start</td><td class="n">${N(x.open)}</td></tr><tr class="hd"><td colspan="2">Money in</td></tr>${x.ins.map(i=>`<tr><td class="ind">${esc(i[0])}</td><td class="n">${N(i[1])}</td></tr>`).join('')}<tr class="sub"><td>Total money in</td><td class="n">${N(x.tin)}</td></tr><tr class="hd"><td colspan="2">Money out</td></tr>${x.outs.map(i=>`<tr><td class="ind">${esc(i[0])}</td><td class="n">${N(i[1])}</td></tr>`).join('')}<tr class="sub"><td>Total money out</td><td class="n">${N(x.tout)}</td></tr><tr class="tot"><td>Bank and cash at end</td><td class="n">${N(x.open+x.tin-x.tout)}</td></tr></tbody></table>`}
  return head('Financial Statements','Built from the Bookkeeping entries. '+(fsYtd?'Year to date from '+pLabel(from)+'.':'For the month.'),`<label class="ck"><input type="checkbox" id="fsYtd" data-c="fsYtd" ${fsYtd?'checked':''}> Year to date</label><button class="btn" data-a="fsPdf">Download PDF</button><button class="btn pri" data-a="fsXls">Download Excel</button>`)+tabsH([['pl','Profit and loss'],['bs','Balance sheet'],['tb','Trial balance'],['cash','Cash movement']],tb)+`<div class="tw">${body}</div>`+(tb==='bs'||tb==='tb'?`<div class="note">As at ${fd(pEnd(p))}.</div>`:'')};
function cashFlow(c,from,to){const open=bs(c.id,pAdd(from,-1)).cash,i={},o={};ledRows(c.id,from,to).forEach(r=>{const a=isBank(r.dr),b=isBank(r.cr);if(a&&!b)i[r.cr]=(i[r.cr]||0)+r.amt;else if(b&&!a)o[r.dr]=(o[r.dr]||0)+r.amt});
  const L=m=>Object.keys(m).sort().map(k=>[accName(k),m[k]]);const ins=L(i),outs=L(o);return{open,ins,outs,tin:ins.reduce((t,x)=>t+x[1],0),tout:outs.reduce((t,x)=>t+x[1],0)}}
CH.fsYtd=(d,el)=>{fsYtd=el.checked;draw(true)};
ACT.fsXls=()=>{const c=cl(),p=ui.period,from=fsYtd?fyStart(p,c):p,x=pl(c.id,from,p),b=bs(c.id,p),t=bal(ledRows(c.id,null,p)),cf=cashFlow(c,from,p);const L=l=>l.map(e=>['  '+e.code+' '+e.name,e.amt]);const per=fsYtd?pLabel(from)+' to '+pLabel(p):pLabel(p);
  xlsxOut(`${c.name} financial statements ${p}.xlsx`,[
   ['Profit and loss',[[c.name],['Profit and loss, '+per],[],['Income'],...L(x.income),['Total income',x.inc],[],['Cost of sales'],...L(x.cogs),['Total cost of sales',x.cg],['Gross profit',x.gross],[],['Operating expenses'],...L(x.expense),['Total operating expenses',x.ex],[],['Net profit or (loss)',x.net]],[44,18]],
   ['Balance sheet',[[c.name],['Balance sheet as at '+fd(pEnd(p))],[],['Assets'],...L(b.asset),['Total assets',b.tA],[],['Liabilities'],...L(b.liability),['Total liabilities',b.tL],[],['Equity'],...L(b.equity),['  Retained profit to date',b.retained],['Total equity',b.tE],[],['Liabilities and equity',b.tL+b.tE]],[44,18]],
   ['Trial balance',[[c.name],['Trial balance as at '+fd(pEnd(p))],[],['Account','Debit','Credit'],...Object.keys(t).sort().filter(a=>Math.abs(t[a])>0.004).map(a=>[a+' '+accName(a),t[a]>0?t[a]:'',t[a]<0?-t[a]:''])],[44,18,18]],
   ['Cash movement',[[c.name],['Cash movement, '+per],[],['Bank and cash at start',cf.open],[],['Money in'],...cf.ins.map(i=>['  '+i[0],i[1]]),['Total money in',cf.tin],[],['Money out'],...cf.outs.map(i=>['  '+i[0],i[1]]),['Total money out',cf.tout],[],['Bank and cash at end',cf.open+cf.tin-cf.tout]],[44,18]]])};

ACT.rcPdf=()=>{outFmt='pdf';ACT.rcExport()};ACT.repPdf=()=>{outFmt='pdf';ACT.repXls()};ACT.fsPdf=()=>{outFmt='pdf';ACT.fsXls()};

/* ----- bank accounts and currencies ----- */
function banksView(c){const base=c.currency||'₦',p=ui.period,bm=bal(ledRows(c.id,null,p));let any=false;
  const rows=clientBanks(c).map(b=>{const fgn=b.cur!==base,own=ownBal(c.id,b.code,p),book=r2(bm[b.code]||0),rt=fgn?rateFor(c,b.cur,p):0,exact=fgn&&((c.rates||{})[b.cur]||{})[p],val=r2(own*rt),diff=r2(val-book);if(fgn)any=true;
    return`<tr><td><b>${esc(b.name)}</b><div class="sm mut">Account ${b.code}</div></td><td>${esc(b.cur)}</td><td class="n">${esc(b.cur)}${N(own)}</td><td class="n">${esc(base)}${N(book)}</td><td class="n">${fgn?`<input type="number" step="any" min="0" aria-label="Rate for ${esc(b.name)}" id="rate_${b.code}" data-c="rateSet" data-cur="${esc(b.cur)}" value="${exact||''}" placeholder="${rt||'rate'}" style="width:110px;text-align:right">`:''}</td><td class="n">${fgn&&rt?esc(base)+N(val):''}</td><td class="n ${diff<0?'bad':diff>0?'good':''}">${fgn&&rt?N(diff):''}</td><td class="n" style="white-space:nowrap">${fgn&&rt&&Math.abs(diff)>0.004?`<button class="btn sm" data-a="reval" data-id="${b.code}">Post revaluation</button> `:''}<button class="btn sm" data-a="bankEdit" data-id="${b.code}">Edit</button></td></tr>`});
  return`<div class="row"><button class="btn pri" data-a="bankNew">Add bank account</button></div>`+tbl(['Bank account','Cur.','#Own balance','#In the books','#'+MON[+p.slice(5)-1]+' rate','#At that rate','#Difference',''],rows)+
  `<div class="note">${any?`<b>How currencies work here.</b> The books are kept in ${esc(base)}. A foreign-currency account keeps its own balance as well, so it can be reconciled to its statement. A transfer between two of the client\u2019s accounts is recorded once: when you load the second account\u2019s statement, the app recognises the transfer and updates it to the amount that actually arrived. Save one rate per month (${esc(base)} for 1 unit of the foreign currency); entries and imports use it unless you type a different rate. At month end, Post revaluation moves the difference to Exchange gain or loss.`:`Each client has their own list of bank accounts. Add one for every account you receive statements for, and choose its currency. The books are kept in ${esc(base)}.`}</div>`}
const bankF=(lock)=>[{k:'name',l:'Account name, for example Providus Naira',req:1,full:1},...(lock?[]:[{k:'cur',l:'Currency',t:'select',o:CURS}])];
const bankUsed=(cid,code)=>ledRows(cid).some(r=>r.dr===code||r.cr===code);
const saveBank=(c,b)=>{const l=(c.banks||[]).filter(x=>x.code!==b.code);put('clients',{...c,banks:[...l,b]})};
ACT.bankNew=()=>{const c=cl(),used=new Set([...gcoa().map(a=>a.code),...(c.banks||[]).map(b=>b.code)]);let n=1001;while(used.has(String(n)))n++;
  openForm('Add bank account',bankF(false),{cur:c.currency||'₦'},v=>saveBank(cl(),{code:String(n),name:v.name,cur:v.cur}))};
ACT.bankEdit=d=>{const c=cl(),b=clientBanks(c).find(x=>x.code===d.id),used=bankUsed(c.id,b.code);
  openForm('Edit bank account',bankF(used),b,v=>saveBank(cl(),{code:b.code,name:v.name,cur:used?b.cur:v.cur}),{note:used?'This account has entries, so its currency is fixed and it cannot be removed.':'',...(used?{}:{del:['bankDel',b.code]})})};
ACT.bankDel=d=>{saveBank(cl(),{code:d.id,hidden:true});closeModal()};
CH.rateSet=(d,el)=>{const c=cl(),v=+el.value||0,cur=d.cur,m={...((c.rates||{})[cur]||{})};if(v>0)m[ui.period]=v;else delete m[ui.period];put('clients',{...c,rates:{...(c.rates||{}),[cur]:m}})};
ACT.reval=d=>{const c=cl(),p=ui.period,code=d.id,cur=acctCur(code),rt=rateFor(c,cur,p),own=ownBal(c.id,code,p),book=r2(bal(ledRows(c.id,null,p))[code]||0),diff=r2(own*rt-book);if(Math.abs(diff)<0.005)return;
  addRows(c.id,[{date:pEnd(p),desc:'Exchange revaluation of '+accName(code)+' at '+N(rt),ref:'Revaluation',amt:Math.abs(diff),dr:diff>0?code:'7000',cr:diff>0?'7000':code,fx:{acct:code,cur,amt:0,rate:rt,reval:true}}]);toast('Revaluation posted: '+(diff>0?'gain':'loss')+' of '+baseCur()+N(Math.abs(diff)))};
/* ----- 10 Compliance ----- */
V.compliance=()=>{const t=today(),tb=tab('due');let o=allObligs(dAdd(t,-90),dAdd(t,tb==='all'?365:120),ui.client);
  if(tb==='due')o=o.filter(x=>!filed(x.key));else if(tb==='filed')o=o.filter(x=>filed(x.key));
  const rows=o.map(x=>{const f=filed(x.key);return`<tr><td><b>${esc(x.name)}</b>${f&&f.ref?`<div class="sm mut">Ref ${esc(f.ref)}${f.amount?' · '+N(f.amount):''}</div>`:''}</td><td>${esc(cname(x.clientId))}</td><td>${esc(x.body)}</td><td>${fd(x.due)}</td><td>${f?`<span class="chip ok">Filed ${fd(f.filed)}</span>`:stChip(x.due)}</td><td class="n">${f?`<button class="btn sm" data-a="unfile" data-k="${x.key}">Undo</button>`:`<button class="btn sm" data-a="fileIt" data-k="${x.key}">Mark filed</button>`}${x.custom?` <button class="btn sm red" data-a="obDel" data-k="${x.key}">Remove</button>`:''}</td></tr>`});
  return head('Compliance','Statutory deadlines worked out from each client’s profile. Tick the obligations on the client record to change what appears here.','<button class="btn pri" data-a="obNew">Add a deadline</button>')+tabsH([['due','To do'],['filed','Filed'],['all','Next 12 months']],tb)+tbl(['Obligation','Client','Authority','Due','Status',''],rows,'<b>Nothing in this view</b>Deadlines appear once a client has VAT, WHT, PAYE or pension ticked on their record.')+
  `<div class="note"><b>Check before you rely on these dates.</b> Due days come from Settings, Tax rates. State revenue services and the CAC can set different dates for a particular client; add those as your own deadlines.</div>`};
ACT.fileIt=d=>{const ex=cache.filings[d.k]||{id:d.k,clientId:d.k.split('_')[0]};openForm('Mark as filed',[{k:'filed',l:'Date filed or paid',t:'date',req:1},{k:'amount',l:'Amount paid',t:'number'},{k:'ref',l:'Receipt or reference number',full:1}],{filed:today()},v=>put('filings',{...ex,...v}))};
ACT.unfile=d=>{const f=cache.filings[d.k];if(f.custom)put('filings',{...f,filed:''});else del('filings',d.k)};
ACT.obNew=()=>{if(!clients().length)return toast('Add a client first');openForm('Add a deadline',[{k:'name',l:'What is due',req:1,full:1},{k:'clientId',l:'Client',t:'select',o:clients().map(c=>[c.id,c.name])},{k:'due',l:'Due date',t:'date',req:1},{k:'body',l:'Authority or recipient'}],{clientId:ui.client||clients()[0].id,due:today()},v=>put('filings',{...v,custom:true}))};
ACT.obDel=d=>del('filings',d.k);

/* ----- 11 Tax management ----- */
const tx={vs:0,vp:0,vinc:'no',wa:0,wt:0,pb:0,ph:0,pt:0,po:0,pr:0,pp:'yes',pn:'no',ct:0,cp:0};
const txIn=(k,l,w)=>`<label class="f">${l}<input type="number" step="any" min="0" id="tx_${k}" data-c="tx" data-k="${k}" value="${tx[k]||''}" style="width:${w||170}px"></label>`;
const txSel=(k,l,o)=>`<label class="f">${l}<select id="tx_${k}" data-c="tx" data-k="${k}">${o.map(([a,b])=>`<option value="${a}" ${String(tx[k])===String(a)?'selected':''}>${esc(b)}</option>`).join('')}</select></label>`;
const kv=(rows)=>`<div class="tw" style="margin-top:12px"><table class="t"><tbody>${rows.map(r=>`<tr class="${r[2]||''}"><td>${r[0]}</td><td class="n">${r[1]}</td></tr>`).join('')}</tbody></table></div>`;
V.tax=()=>{const T=tax(),tb=tab('vat'),c=cl();let body;
  if(tb==='vat'){const div=tx.vinc==='yes'?1+T.vat/100:1;const so=tx.vs/div*T.vat/100,pi=tx.vp/div*T.vat/100;
    body=`<div class="row" style="align-items:flex-end">${txIn('vs','Vatable sales')}${txIn('vp','Vatable purchases')}${txSel('vinc','Amounts entered',[['no','Before VAT'],['yes','Including VAT']])}${c?'<button class="btn" data-a="txBooks">Use this month’s sales from the books</button>':''}</div>`+kv([['Output VAT on sales at '+T.vat+'%',N(so)],['Input VAT on purchases',N(pi)],[so-pi>=0?'VAT payable':'VAT credit carried forward',N(Math.abs(so-pi)),'tot']])+`<div class="note">Return and payment due by day ${T.dueVat} of the following month.</div>`}
  else if(tb==='wht'){const w=T.wht[+tx.wt]||T.wht[0],amt=tx.wa*w[1]/100;
    body=`<div class="row" style="align-items:flex-end">${txIn('wa','Invoice amount before VAT')}${txSel('wt','Type of payment',T.wht.map((x,i)=>[i,x[0]+' ('+x[1]+'%)']))}</div>`+kv([['Withholding tax at '+w[1]+'%',N(amt)],['Pay to supplier (before VAT)',N(tx.wa-amt)],['VAT to add at '+T.vat+'%',N(tx.wa*T.vat/100)],['Total to pay supplier',N(tx.wa-amt+tx.wa*T.vat/100),'tot']])+`<div class="note">Remit by day ${T.dueWht} of the following month and give the supplier a credit note or receipt. Rates differ for non-residents and for suppliers without a TIN.</div>`}
  else if(tb==='paye'){const r=payrun({basic:tx.pb,housing:tx.ph,transport:tx.pt,other:tx.po,rent:tx.pr,pension:tx.pp==='yes',nhf:tx.pn==='yes'},T);
    body=`<div class="row" style="align-items:flex-end">${txIn('pb','Monthly basic',140)}${txIn('ph','Housing',140)}${txIn('pt','Transport',140)}${txIn('po','Other allowances',140)}${txIn('pr','Rent paid per year',150)}${txSel('pp','Pension',[['yes','Yes'],['no','No']])}${txSel('pn','NHF',[['no','No'],['yes','Yes']])}</div>`+kv([['Monthly gross pay',N(r.gross)],['Pension ('+T.penEe+'% of basic, housing, transport)',N(r.pen)],['NHF ('+T.nhf+'% of basic)',N(r.nhf)],['Taxable income for the year',N(r.taxable)],['PAYE for the month',N(r.paye)],['Take-home pay',N(r.net),'tot'],['Employer pension ('+T.penEr+'%)',N(r.erPen)]])+`<div class="note">Uses the tax bands in Settings: ${T.bands.map(b=>(b[0]?N(b[0]).replace('.00',''):'the rest')+' at '+b[1]+'%').join(', ')}. Rent relief is ${T.rentPct}% of rent, up to ${N(T.rentCap).replace('.00','')}.</div>`}
  else{const small=tx.ct>0&&tx.ct<=T.smallTurnover;const cit=small?0:Math.max(0,tx.cp)*T.cit/100,lv=small?0:Math.max(0,tx.cp)*T.levy/100;
    body=`<div class="row" style="align-items:flex-end">${txIn('ct','Turnover for the year')}${txIn('cp','Assessable profit')}</div>`+kv([['Company size',small?'Small company':'Not a small company'],['Company income tax at '+(small?0:T.cit)+'%',N(cit)],['Development levy at '+(small?0:T.levy)+'%',N(lv)],['Estimated total',N(cit+lv),'tot']])+`<div class="note">A company with turnover up to ${N(T.smallTurnover).replace('.00','')} is treated as small here. The law also has a fixed-assets limit and excludes professional service firms, so confirm before filing. This is an estimate, not a tax computation.</div>`}
  return head('Tax Management','Quick calculators for the taxes you handle every month. Rates come from Settings and can be changed there.')+tabsH([['vat','VAT'],['wht','Withholding tax'],['paye','PAYE'],['cit','Company tax']],tb)+`<div class="card">${body}</div>`};
CH.tx=(d,el)=>{tx[d.k]=el.tagName==='SELECT'?el.value:(+el.value||0)};
ACT.txBooks=()=>{tx.vs=r2(pl(cl().id,ui.period,ui.period).inc);tx.vinc='no';draw(true)};

/* ----- 12 Payroll ----- */
const staffOf=cid=>all('staff').filter(s=>s.clientId===cid&&s.active!==false).sort((a,b)=>a.name.localeCompare(b.name));
function payTotals(cid){const T=tax(),rows=staffOf(cid).map(e=>({e,r:payrun(e,T)}));const tot={gross:0,pen:0,nhf:0,paye:0,ded:0,net:0,erPen:0};rows.forEach(x=>{for(const k in tot)tot[k]+=x.r[k]});return{rows,tot}}
V.payroll=()=>{const c=cl();if(!c)return head('Payroll')+needClient('Payroll');const{rows,tot}=payTotals(c.id),T=tax();
  const tr=rows.map(({e,r})=>`<tr><td><b>${esc(e.name)}</b><div class="sm mut">${esc(e.role||'')}</div></td><td class="n">${N(r.gross)}</td><td class="n">${N(r.pen)}</td><td class="n">${N(r.nhf)}</td><td class="n">${N(r.paye)}</td><td class="n">${N(r.ded)}</td><td class="n"><b>${N(r.net)}</b></td><td class="n">${N(r.erPen)}</td><td class="n"><button class="btn sm" data-a="slip" data-id="${e.id}">Payslip</button> <button class="btn sm" data-a="staffEdit" data-id="${e.id}">Edit</button></td></tr>`);
  if(tr.length)tr.push(`<tr class="tot"><td>Total</td><td class="n">${N(tot.gross)}</td><td class="n">${N(tot.pen)}</td><td class="n">${N(tot.nhf)}</td><td class="n">${N(tot.paye)}</td><td class="n">${N(tot.ded)}</td><td class="n">${N(tot.net)}</td><td class="n">${N(tot.erPen)}</td><td></td></tr>`);
  return head('Payroll','Set each employee up once. Every month the pay, PAYE and pension are worked out for you.',`<button class="btn" data-a="payXls" ${rows.length?'':'disabled'}>Download Excel</button><button class="btn" data-a="payPdf" ${rows.length?'':'disabled'}>Download PDF</button><button class="btn" data-a="payPost" ${rows.length?'':'disabled'}>Post to Bookkeeping</button><button class="btn pri" data-a="staffNew">Add employee</button>`)+
  `<div class="grid g4"><div class="kpi"><span>Staff</span><b>${rows.length}</b></div><div class="kpi"><span>Net pay to transfer</span><b>${N(tot.net)}</b></div><div class="kpi"><span>PAYE to remit</span><b>${N(tot.paye)}</b></div><div class="kpi"><span>Pension to remit</span><b>${N(tot.pen+tot.erPen)}</b><em>staff ${N(tot.pen)} + employer ${N(tot.erPen)}</em></div><div class="kpi"><span>NSITF at ${T.nsitf}%</span><b>${N(tot.gross*T.nsitf/100)}</b></div></div>`+
  tbl(['Employee','#Gross','#Pension','#NHF','#PAYE','#Other deductions','#Net pay','#Employer pension',''],tr,'<b>No employees for this client</b>Add each person with their monthly pay to run payroll.')};
const staffFields=[{k:'name',l:'Full name',req:1},{k:'role',l:'Job title'},{k:'basic',l:'Monthly basic',t:'number'},{k:'housing',l:'Monthly housing',t:'number'},{k:'transport',l:'Monthly transport',t:'number'},{k:'other',l:'Other monthly allowances',t:'number'},{k:'rent',l:'Rent paid per year (for rent relief)',t:'number'},{k:'relief',l:'Other yearly reliefs (NHIS, life cover)',t:'number'},{k:'deduct',l:'Other monthly deductions (loans, advances)',t:'number'},{k:'bank',l:'Bank and account number'},{k:'pension',l:'Contributes to pension',t:'check'},{k:'nhf',l:'Contributes to NHF',t:'check'}];
ACT.staffNew=()=>openForm('Add employee',staffFields,{pension:true},v=>put('staff',{...v,clientId:cl().id}));
ACT.staffEdit=d=>{const e=cache.staff[d.id];openForm('Edit employee',staffFields,e,v=>put('staff',{...e,...v}),{del:['staffDel',e.id]})};
ACT.staffDel=d=>{del('staff',d.id);closeModal()};
ACT.slip=d=>{const e=cache.staff[d.id],r=payrun(e,tax()),c=cl(),k=c.currency||'₦';const t=`${c.name}\nPayslip for ${pLabel(ui.period)}\n\nEmployee: ${e.name}${e.role?'\nRole: '+e.role:''}\n\nBasic: ${k}${N(+e.basic||0)}\nHousing: ${k}${N(+e.housing||0)}\nTransport: ${k}${N(+e.transport||0)}\nOther allowances: ${k}${N(+e.other||0)}\nGross pay: ${k}${N(r.gross)}\n\nPension: ${k}${N(r.pen)}\nNHF: ${k}${N(r.nhf)}\nPAYE tax: ${k}${N(r.paye)}\nOther deductions: ${k}${N(r.ded)}\n\nNet pay: ${k}${N(r.net)}`;modal(`<h2>Payslip</h2><textarea id="mTxt" style="min-height:260px">${esc(t)}</textarea><div class="row"><button class="btn pri" data-a="copyTxt">Copy</button><button class="btn" data-a="slipPdf" data-id="${e.id}">Download PDF</button><button class="btn" data-a="close">Close</button></div>`)};
ACT.slipPdf=d=>{const e=cache.staff[d.id],r=payrun(e,tax()),c=cl(),k=c.currency||'₦';pdfOut(`Payslip ${e.name} ${ui.period}.pdf`,[['Payslip',[[c.name],['Payslip for '+pLabel(ui.period)],[],['Employee: '+e.name+(e.role?', '+e.role:'')],[],['Pay','Amount ('+k+')'],['Basic',+e.basic||0],['Housing',+e.housing||0],['Transport',+e.transport||0],['Other allowances',+e.other||0],['Gross pay',r.gross],[],['Deductions','Amount ('+k+')'],['Pension',r.pen],['NHF',r.nhf],['PAYE tax',r.paye],['Other deductions',r.ded],[],['Net pay',r.net]]]])};
ACT.payXls=()=>{const c=cl(),{rows,tot}=payTotals(c.id);xlsxOut(`${c.name} payroll ${ui.period}.xlsx`,[['Payroll',[[c.name],['Payroll schedule, '+pLabel(ui.period)],[],['Employee','Role','Basic','Housing','Transport','Other','Gross','Pension','NHF','PAYE','Other deductions','Net pay','Employer pension','Bank details'],...rows.map(({e,r})=>[e.name,e.role||'',+e.basic||0,+e.housing||0,+e.transport||0,+e.other||0,r.gross,r.pen,r.nhf,r.paye,r.ded,r.net,r.erPen,e.bank||'']),['Total','','','','','',tot.gross,tot.pen,tot.nhf,tot.paye,tot.ded,tot.net,tot.erPen]],[28,18,14,14,14,14,14,14,12,14,16,14,16,30]]])};
ACT.payPost=()=>confirmBox(`Post ${pLabel(ui.period)} payroll to Bookkeeping?`,'Post payroll',()=>{const c=cl(),{tot}=payTotals(c.id),d=pEnd(ui.period),L=pLabel(ui.period);const rows=[['Net salaries '+L,tot.net,'6000','1000'],['PAYE on salaries '+L,tot.paye,'6000','2120'],['Staff pension '+L,tot.pen,'6000','2130'],['Employer pension '+L,tot.erPen,'6000','2130'],['NHF and other staff deductions '+L,tot.nhf+tot.ded,'6000','2000']].filter(r=>r[1]>0.004).map(r=>({date:d,desc:r[0],ref:'Payroll',amt:r[1],dr:r[2],cr:r[3]}));addRows(c.id,rows);toast('Payroll posted to '+fd(d))});

/* ----- 13 Advisory ----- */
function insights(c,p){const out=[],d=repData(c,p),k=c.currency||'₦',m=d.m,pm=d.pm;const add=(lvl,t,s)=>out.push({lvl,t,s});
  if(!m.inc&&!m.ex)return out;
  if(m.net<0)add('bad','The business lost money this month',`Costs were ${k}${N(-m.net)} more than income. Look at the largest costs first.`);
  if(m.cg&&isFinite(m.margin)&&m.margin<25)add('warn','Thin margin on sales',`Only ${Math.round(m.margin)}% of sales is left after the cost of goods. Review pricing, supplier costs and freight.`);
  if(isFinite(pm.margin)&&isFinite(m.margin)&&m.margin<pm.margin-5)add('warn','Margin fell against last month',`From ${Math.round(pm.margin)}% to ${Math.round(m.margin)}%. Check discounts given and whether stock costs went up.`);
  if(pm.ex&&pm.inc&&m.ex/pm.ex>1.15&&m.inc/pm.inc<1.05)add('warn','Costs grew faster than sales',`Running costs rose ${Math.round((m.ex/pm.ex-1)*100)}% while sales ${m.inc>=pm.inc?'rose only '+Math.round((m.inc/pm.inc-1)*100)+'%':'fell'}.`);
  const out3=[0,1,2].map(i=>{const q=pAdd(p,-i);return cashFlow(c,q,q).tout}).filter(x=>x>0);if(out3.length){const avg=out3.reduce((a,b)=>a+b,0)/out3.length,run=d.b.cash/avg;if(run<2)add(run<1?'bad':'warn','Low cash cover',`Cash on hand covers about ${Math.max(0,run).toFixed(1)} months of normal spending. Chase receivables and delay non-urgent spending.`);else add('ok','Healthy cash cover',`Cash on hand covers about ${run.toFixed(1)} months of normal spending.`)}
  const top=[...m.expense].sort((a,b)=>b.amt-a.amt)[0];if(top&&m.ex&&top.amt/m.ex>0.5)add('warn','One cost dominates',`${top.name} is ${Math.round(top.amt/m.ex*100)}% of running costs.`);
  const ar=d.b.asset.find(a=>a.code==='1100');if(ar&&m.inc&&ar.amt>m.inc)add('warn','Customers owe more than a month of sales',`${k}${N(ar.amt)} is waiting to be collected.`);
  const dr=d.b.equity.find(a=>a.code==='3100');if(dr&&d.ytd.net>0&&-dr.amt>d.ytd.net)add('warn','Owner drawings exceed profit',`Drawings to date are ${k}${N(-dr.amt)} against profit of ${k}${N(d.ytd.net)}.`);
  if(d.b.asset.some(a=>a.code===SUSP))add('warn','Uncategorised items remain','Sort these before advising the client; they can change the profit figure.');
  if(m.net>0&&!out.some(o=>o.lvl!=='ok'))add('ok','A steady month',`Profit of ${k}${N(m.net)} with no warning signs in the figures.`);
  return out}
V.advisory=()=>{const c=cl();if(!c)return head('Advisory')+needClient('Advisory');const ins=insights(c,ui.period),notes=all('notes').filter(n=>n.clientId===c.id&&n.kind==='advice').sort((a,b)=>a.date<b.date?1:-1);
  return head('Advisory','What the numbers are saying, and a record of the advice you give.','<button class="btn pri" data-a="advNew">Add advice note</button>')+
  `<div class="card"><h2>What to raise with the client <small>${pLabel(ui.period)}</small></h2><div class="list">${ins.map(i=>`<div><span class="chip ${i.lvl}">${i.lvl==='ok'?'Good':i.lvl==='bad'?'Urgent':'Watch'}</span><div class="gr"><b>${esc(i.t)}</b><div class="sm mut">${esc(i.s)}</div></div><button class="btn sm" data-a="advFrom" data-t="${esc(i.t)}" data-s="${esc(i.s)}">Save as note</button></div>`).join('')||'<div class="mut">Record this month’s entries in Bookkeeping and the talking points will appear here.</div>'}</div>${sample&&ins.length?'<div class="row" style="margin-top:10px"><button class="btn" data-a="advAsk">Ask Claude for talking points</button><span class="sm mut" id="advState"></span></div><pre class="out" id="advOut" hidden></pre>':''}</div>`+
  tbl(['Date','Advice','Status',''],notes.map(n=>`<tr><td>${fd(n.date)}</td><td><b>${esc(n.title)}</b><div class="sm mut">${esc(n.text||'')}</div></td><td><select aria-label="Status" data-c="advStatus" data-id="${n.id}">${['Open','Discussed','Agreed','Done'].map(s=>`<option ${s===n.status?'selected':''}>${s}</option>`).join('')}</select></td><td class="n"><button class="btn sm" data-a="advEdit" data-id="${n.id}">Edit</button></td></tr>`),'<b>No advice notes yet</b>Keep a record of what you recommended and what the client decided.')};
const advFields=[{k:'title',l:'Advice',req:1,full:1},{k:'date',l:'Date',t:'date'},{k:'status',l:'Status',t:'select',o:['Open','Discussed','Agreed','Done']},{k:'text',l:'Details',t:'textarea'}];
ACT.advNew=()=>openForm('Add advice note',advFields,{date:today(),status:'Open'},v=>put('notes',{...v,clientId:cl().id,kind:'advice',period:ui.period}));
ACT.advFrom=d=>{put('notes',{title:d.t,text:d.s,date:today(),status:'Open',clientId:cl().id,kind:'advice',period:ui.period});toast('Saved as an advice note')};
ACT.advEdit=d=>{const n=cache.notes[d.id];openForm('Edit advice note',advFields,n,v=>put('notes',{...n,...v}),{del:['advDel',n.id]})};
ACT.advDel=d=>{del('notes',d.id);closeModal()};
CH.advStatus=(d,el)=>put('notes',{...cache.notes[d.id],status:el.value});
ACT.advAsk=async()=>{const st=$('#advState'),o=$('#advOut');st.textContent='Thinking…';o.hidden=false;o.textContent='';try{const r=await sample('You are assisting a bookkeeper in Nigeria who advises small-business owners. From the monthly figures below, give 4 short, practical talking points for the client meeting. Plain language, one or two sentences each, numbered 1 to 4, no jargon, do not invent numbers.\n\n'+repText(),{onText:({text})=>{o.textContent=text}});o.textContent=r.text;st.textContent=''}catch(e){o.hidden=true;st.textContent=e&&e.code==='rate_limited'?'Too many requests just now. Try again in a minute.':'Claude is not available in this view.'}};

/* ----- 14 Analytics ----- */
const short=n=>{const a=Math.abs(n);return (n<0?'-':'')+(a>=1e9?(a/1e9).toFixed(1)+'bn':a>=1e6?(a/1e6).toFixed(1)+'m':a>=1e3?Math.round(a/1e3)+'k':Math.round(a))};
function barChart(labels,series,line){const W=760,H=250,L=52,R=8,T=12,B=26;let mx=1,mn=0;series.forEach(s=>s.v.forEach(x=>{mx=Math.max(mx,x)}));if(line)line.v.forEach(x=>{mx=Math.max(mx,x);mn=Math.min(mn,x)});
  const raw=(mx-mn)/4,mag=Math.pow(10,Math.floor(Math.log10(raw))),step=[1,2,2.5,5,10].map(m=>m*mag).find(s=>s>=raw);const top=Math.ceil(mx/step)*step,bot=Math.floor(mn/step)*step;
  const y=v=>T+(top-v)/(top-bot)*(H-T-B),gw=(W-L-R)/labels.length,bw=Math.min(22,gw*0.7/series.length);let s='';
  for(let v=bot;v<=top+step/2;v+=step)s+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="${Math.abs(v)<step/10?1.5:1}"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${short(v)}</text>`;
  labels.forEach((l,i)=>{const cx=L+gw*i+gw/2;series.forEach((se,j)=>{const v=se.v[i],x=cx-bw*series.length/2+j*bw;s+=`<rect x="${x+1}" y="${y(Math.max(v,0))}" width="${bw-2}" height="${Math.max(0,Math.abs(y(v)-y(0)))}" rx="2" fill="${se.c}"><title>${l} ${se.n}: ${N(v)}</title></rect>`});s+=`<text x="${cx}" y="${H-8}" text-anchor="middle">${l}</text>`});
  if(line){s+=`<polyline fill="none" stroke="${line.c}" stroke-width="2" points="${line.v.map((v,i)=>(L+gw*i+gw/2)+','+y(v)).join(' ')}"/>`;line.v.forEach((v,i)=>{s+=`<circle cx="${L+gw*i+gw/2}" cy="${y(v)}" r="3" fill="${line.c}"><title>${labels[i]} ${line.n}: ${N(v)}</title></circle>`})}
  return`<svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="Chart">${s}</svg><div class="row sm" style="margin-top:6px">${[...series,...(line?[line]:[])].map(x=>`<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${x.c};margin-right:5px"></span>${x.n}</span>`).join('')}</div>`}
const hbars=(items,k)=>{const mx=Math.max(1,...items.map(i=>i[1]));return items.length?`<div class="list">${items.map(i=>`<div><div class="gr">${esc(i[0])}<div class="prog" style="margin-top:4px"><i style="width:${Math.max(1,i[1]/mx*100)}%"></i></div></div><b style="font-variant-numeric:tabular-nums">${k||''}${typeof i[1]==='number'&&k!==null?N(i[1]):i[1]}</b></div>`).join('')}</div>`:'<div class="mut">No data yet.</div>'};
V.analytics=()=>{const c=cl(),p=ui.period,months=[...Array(12)].map((_,i)=>pAdd(p,i-11)),labs=months.map(m=>MON[+m.slice(5)-1]);
  if(!c){const cs=clients(),act=cs.filter(x=>x.status==='Active');const byInd={};act.forEach(x=>byInd[x.industry||'Other']=(byInd[x.industry||'Other']||0)+1);
    const done=months.map(m=>all('tasks').filter(t=>t.done&&(t.doneOn||'').slice(0,7)===m).length),billed=months.map(m=>all('invoices').filter(i=>i.period===m).reduce((s,i)=>s+(+i.amount||0),0)),paid=months.map(m=>all('invoices').filter(i=>i.period===m&&i.status==='Paid').reduce((s,i)=>s+(+i.amount||0),0));
    return head('Analytics','Your practice at a glance. Choose a client at the top to see their trends instead.')+`<div class="grid g4"><div class="kpi"><span>Active clients</span><b>${act.length}</b></div><div class="kpi"><span>Monthly fees</span><b>₦${N(act.reduce((s,x)=>s+(+x.fee||0),0))}</b></div><div class="kpi"><span>Open tasks</span><b>${all('tasks').filter(t=>!t.done).length}</b></div><div class="kpi"><span>Months closed</span><b>${all('closes').filter(x=>x.signed).length}</b></div></div>
    <div class="card"><h2>Fees billed and collected</h2>${barChart(labs,[{n:'Billed',c:'var(--ink)',v:billed},{n:'Collected',c:'var(--gold)',v:paid}])}</div>
    <div class="grid g2"><div class="card"><h2>Fee by client</h2>${hbars(act.filter(x=>+x.fee).sort((a,b)=>b.fee-a.fee).map(x=>[x.name,+x.fee]),'₦')}</div><div class="card"><h2>Clients by industry</h2>${hbars(Object.entries(byInd).sort((a,b)=>b[1]-a[1]),null)}</div></div>
    <div class="card"><h2>Tasks completed each month</h2>${barChart(labs,[{n:'Tasks done',c:'var(--gold)',v:done}])}</div>`}
  const ser=months.map(m=>pl(c.id,m,m)),y=pl(c.id,fyStart(p,c),p),k=c.currency||'₦',cash=months.map(m=>bs(c.id,m).cash);
  return head('Analytics','Twelve months of trends from the books.')+`<div class="grid g4"><div class="kpi"><span>Sales, year to date</span><b>${k}${N(y.inc)}</b></div><div class="kpi"><span>Margin, year to date</span><b>${pct(y.margin)}</b></div><div class="kpi ${y.net<0?'bad':'good'}"><span>Profit, year to date</span><b>${k}${N(y.net)}</b></div><div class="kpi"><span>Costs as share of sales</span><b>${pct(y.inc?y.ex/y.inc*100:NaN)}</b></div></div>
  <div class="card"><h2>Income, costs and profit</h2>${barChart(labs,[{n:'Income',c:'var(--ink)',v:ser.map(s=>s.inc)},{n:'All costs',c:'var(--gold)',v:ser.map(s=>s.cg+s.ex)}],{n:'Profit',c:'var(--ok)',v:ser.map(s=>s.net)})}</div>
  <div class="grid g2"><div class="card"><h2>Where the money went <small>year to date</small></h2>${hbars([...y.cogs,...y.expense].sort((a,b)=>b.amt-a.amt).slice(0,8).map(e=>[e.name,e.amt]),k)}</div><div class="card"><h2>Bank and cash at month end</h2>${barChart(labs,[],{n:'Bank and cash',c:'var(--gold)',v:cash})}</div></div>`};

/* ----- 15 Workflow ----- */
V.workflow=()=>head('Workflow','Standard ways of working. Start one for a client and every step becomes a dated task.','<button class="btn pri" data-a="wfNew">New workflow</button>')+`<div class="grid g2">${wfs().map(w=>`<div class="card"><h2>${esc(w.name)} <small>${w.steps.length} steps</small></h2><div class="list">${w.steps.map(s=>`<div><div class="gr">${esc(s.t)}</div><span class="chip">Day ${s.d}</span></div>`).join('')}</div><div class="row" style="margin-top:12px"><button class="btn pri" data-a="wfStart" data-id="${w.id}">Start for a client</button><button class="btn" data-a="wfEdit" data-id="${w.id}">Edit steps</button></div></div>`).join('')}</div>`;
ACT.wfStart=d=>{const w=wfs().find(x=>x.id===d.id);if(!clients().length)return toast('Add a client first');openForm('Start: '+w.name,[{k:'clientId',l:'Client',t:'select',o:clients().map(c=>[c.id,c.name])},{k:'start',l:'Start date',t:'date',req:1}],{clientId:ui.client||clients()[0].id,start:today()},v=>{w.steps.forEach(s=>put('tasks',{title:s.t,clientId:v.clientId,due:dAdd(v.start,s.d),priority:'Normal',repeat:'None',who:firm().owner,note:w.name}));toast(w.steps.length+' tasks created')},{ok:'Create tasks'})};
const wfText=w=>w.steps.map(s=>s.t+' | '+s.d).join('\n');
const wfParse=t=>t.split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{const i=l.lastIndexOf('|');return i<0?{t:l,d:0}:{t:l.slice(0,i).trim(),d:+l.slice(i+1)||0}});
const wfF=[{k:'name',l:'Workflow name',req:1,full:1},{k:'steps',l:'Steps, one per line, as: step | days after start',t:'textarea'}];
ACT.wfNew=()=>openForm('New workflow',wfF,{steps:'First step | 0\nSecond step | 3'},v=>put('config',{id:'workflows',list:[...wfs(),{id:uid(),name:v.name,steps:wfParse(v.steps)}]}));
ACT.wfEdit=d=>{const w=wfs().find(x=>x.id===d.id);openForm('Edit workflow',wfF,{name:w.name,steps:wfText(w)},v=>put('config',{id:'workflows',list:wfs().map(x=>x.id===w.id?{...x,name:v.name,steps:wfParse(v.steps)}:x)}),{del:['wfDel',w.id]})};
ACT.wfDel=d=>{put('config',{id:'workflows',list:wfs().filter(x=>x.id!==d.id)});closeModal()};

ACT.payPdf=()=>{outFmt='pdf';ACT.payXls()};
/* ----- 16 Settings ----- */
V.settings=()=>{const tb=tab('firm'),f=firm(),T=tax();let body;const inp=(n,l,v,t,w)=>`<label class="f ${w||''}">${l}<input name="${n}" id="st_${n}" type="${t||'text'}" ${t==='number'?'step="any"':''} value="${esc(v==null?'':v)}"></label>`;
  if(tb==='firm')body=`<form class="card fg" data-f="firmSave">${inp('name','Practice name',f.name)}${inp('owner','Your name',f.owner)}${inp('legal','Registered company name',f.legal)}${inp('rc','CAC number',f.rc)}${inp('address','Address',f.address,'','full')}${inp('phone','Phone',f.phone)}${inp('email','Email',f.email)}${inp('prefix','Invoice number prefix',f.prefix)}<label class="f full">Payment details shown on invoices<textarea name="bank" id="st_bank">${esc(f.bank||'')}</textarea></label><div class="full"><button class="btn pri" type="submit">Save practice details</button></div></form>`;
  else if(tb==='tax')body=`<form class="card fg" data-f="taxSave"><div class="note full"><b>These are the rates the calculators and payroll use.</b> They are set to the Nigeria Tax Act figures that apply from 1 January 2026 as I understand them. Check them against current Nigeria Revenue Service guidance and change any that differ.</div>${inp('vat','VAT rate %',T.vat,'number')}${inp('penEe','Staff pension %',T.penEe,'number')}${inp('penEr','Employer pension %',T.penEr,'number')}${inp('nhf','NHF % of basic',T.nhf,'number')}${inp('rentPct','Rent relief % of rent',T.rentPct,'number')}${inp('rentCap','Rent relief limit per year',T.rentCap,'number')}${inp('minWage','No PAYE if monthly gross is at or below',T.minWage,'number')}${inp('nsitf','NSITF % of payroll',T.nsitf,'number')}${inp('cit','Company income tax %',T.cit,'number')}${inp('levy','Development levy %',T.levy,'number')}${inp('smallTurnover','Small company turnover limit',T.smallTurnover,'number')}${inp('duePaye','PAYE due day of next month',T.duePaye,'number')}${inp('dueVat','VAT due day of next month',T.dueVat,'number')}${inp('dueWht','WHT due day of next month',T.dueWht,'number')}${inp('dueNsitf','NSITF due day of next month',T.dueNsitf,'number')}
    <label class="f full">PAYE bands, one per line as: slice of yearly income, rate %. Use 0 for the last slice (everything above).<textarea name="bands" id="st_bands">${T.bands.map(b=>b[0]+', '+b[1]).join('\n')}</textarea></label><label class="f full">Withholding tax rates, one per line as: type | rate %<textarea name="wht" id="st_wht" style="min-height:170px">${esc(T.wht.map(w=>w[0]+' | '+w[1]).join('\n'))}</textarea></label><div class="row full"><button class="btn pri" type="submit">Save rates</button><button class="btn" type="button" data-a="taxReset">Put back the standard rates</button></div></form>`;
  else if(tb==='coa'){const used=new Set();all('ledger').forEach(d=>(d.rows||[]).forEach(r=>{used.add(r.dr);used.add(r.cr)}));const TY={asset:'Asset',liability:'Liability',equity:'Equity',income:'Income',cogs:'Cost of sales',expense:'Expense'};
    body=`<div class="row"><button class="btn pri" data-a="coaNew">Add account</button></div><div class="note">This is the standard list every client starts with. Each client\u2019s own bank accounts and their currencies are set under Bookkeeping, Bank accounts and rates.</div>`+tbl(['Code','Account','Type',''],gcoa().map(a=>`<tr><td>${a.code}</td><td>${esc(a.name)}${a.bank?' <span class="chip gold">Bank or cash</span>':''}</td><td>${TY[a.type]}</td><td class="n"><button class="btn sm" data-a="coaEdit" data-id="${a.code}">Rename</button> ${used.has(a.code)||a.code===SUSP?'':`<button class="btn sm red" data-a="coaDel" data-id="${a.code}">Remove</button>`}</td></tr>`))}
  else if(tb==='rules')body=`<div class="row"><button class="btn pri" data-a="ruleNew">Add rule</button></div><div class="note">When you import a bank statement, a line whose description contains the word on the left is put in the account on the right. The first matching rule wins.</div>`+tbl(['When the description contains','Put it in',''],rules().map((r,i)=>`<tr><td>${esc(r.k)}</td><td>${r.a} ${esc(accName(r.a))}</td><td class="n"><button class="btn sm red" data-a="ruleDel" data-i="${i}">Remove</button></td></tr>`),'No rules yet.');
  else if(tb==='lists')body=`<form class="card fg" data-f="listSave"><label class="f full">Month-end checklist, one step per line<textarea name="close" id="st_close" style="min-height:260px">${esc(closeTpl().map(i=>i.t).join('\n'))}</textarea></label><label class="f full">Documents to request each month, one per line<textarea name="docs" id="st_docs" style="min-height:170px">${esc((cfg('docs').list||DEF_DOCS).join('\n'))}</textarea></label><div class="full"><button class="btn pri" type="submit">Save lists</button></div></form>`;
  else if(tb==='people')body=`<div class="row"><button class="btn pri" data-a="teamNew">Add a person</button></div>`+tbl(['Name','Role','Email',''],team().map((p,i)=>`<tr><td>${esc(p.name)}</td><td>${esc(p.role)}</td><td>${esc(p.email||'')}</td><td class="n">${i?`<button class="btn sm red" data-a="teamDel" data-i="${i}">Remove</button>`:''}</td></tr>`))+`<div class="note"><b>Built for one person today, ready for more.</b> Only your login can open this portal. People added here can be given tasks now. Every record already carries its client, so team logins and a client view can be switched on later without re-entering anything.</div><div class="card"><h2>Your login</h2><div class="row"><button class="btn" data-a="changePw">Change password</button><button class="btn" data-a="signOut">Sign out</button></div></div>`;
  else body=`<div class="grid g2"><div class="card"><h2>Backup</h2><p class="mut">Download everything in the app as one file. Keep a copy in your Resident Bookkeeper folder each month.</p><div class="row"><button class="btn pri" data-a="backup">Download backup</button></div></div><div class="card"><h2>Restore</h2><p class="mut">Load a backup file. Records in the file replace records with the same identity; nothing else is removed.</p><input type="file" id="restoreFile" accept=".json" data-c="restore"></div><div class="card"><h2>Example data</h2><p class="mut">Two made-up clients with three months of entries, to try each module. Marked as examples everywhere.</p><div class="row"><button class="btn" data-a="loadExamples">Load examples</button><button class="btn red" data-a="clearExamples">Remove examples</button></div></div><div class="card"><h2>Records held</h2>${hbars(COLS.map(c=>[c[0].toUpperCase()+c.slice(1),String(all(c).length)]).map(x=>[x[0],+x[1]]),null)}</div></div>`;
  return head('Settings','Your practice details, rates and standard lists.')+tabsH([['firm','Practice'],['tax','Tax rates'],['coa','Accounts'],['rules','Sorting rules'],['lists','Checklists'],['people','People and access'],['data','Backup and data']],tb)+body};
FM.firmSave=v=>{put('config',{id:'firm',...v});toast('Practice details saved')};
FM.taxSave=v=>{const o={id:'tax'};['vat','penEe','penEr','nhf','rentPct','rentCap','minWage','nsitf','cit','levy','smallTurnover','duePaye','dueVat','dueWht','dueNsitf'].forEach(k=>o[k]=+v[k]||0);
  o.bands=v.bands.split('\n').map(l=>l.split(',').map(x=>+x.replace(/[^0-9.]/g,'')||0)).filter(b=>b.length>=2).map(b=>[b[0],b[1]]);o.wht=v.wht.split('\n').map(l=>{const i=l.lastIndexOf('|');return i<0?null:[l.slice(0,i).trim(),+l.slice(i+1)||0]}).filter(Boolean);
  if(!o.bands.length||!o.wht.length)return toast('Keep at least one PAYE band and one WHT rate.');put('config',o);toast('Rates saved')};
ACT.taxReset=()=>{del('config','tax');toast('Standard rates restored')};
FM.listSave=v=>{const L=t=>t.split('\n').map(s=>s.trim()).filter(Boolean);const old=closeTpl();put('config',{id:'close',list:L(v.close).map((t,i)=>({id:(old.find(o=>o.t===t)||{}).id||'k'+uid()+i,t}))});put('config',{id:'docs',list:L(v.docs)});toast('Lists saved')};
const coaF=[{k:'code',l:'Code',req:1},{k:'name',l:'Account name',req:1},{k:'type',l:'Type',t:'select',o:[['asset','Asset'],['liability','Liability'],['equity','Equity'],['income','Income'],['cogs','Cost of sales'],['expense','Expense']]},{k:'bank',l:'This is a bank or cash account',t:'check'}];
ACT.coaNew=()=>openForm('Add account',coaF,{type:'expense'},v=>{if(gcoa().some(a=>a.code===v.code)){toast('That code is already used.');return false}put('config',{id:'coa',list:[...gcoa(),{...v,type:v.bank?'asset':v.type}].sort((a,b)=>a.code<b.code?-1:1)})});
ACT.coaEdit=d=>{const a=gcoa().find(x=>x.code===d.id);openForm('Rename account',[{k:'name',l:'Account name',req:1,full:1}],a,v=>put('config',{id:'coa',list:gcoa().map(x=>x.code===a.code?{...x,name:v.name}:x)}))};
ACT.coaDel=d=>put('config',{id:'coa',list:gcoa().filter(a=>a.code!==d.id)});
ACT.ruleDel=d=>put('config',{id:'rules',list:rules().filter((_,i)=>i!==+d.i)});
ACT.teamNew=()=>openForm('Add a person',[{k:'name',l:'Name',req:1},{k:'role',l:'Role',t:'select',o:['Bookkeeper','Assistant','Reviewer','Tax consultant','Client contact']},{k:'email',l:'Email',t:'email',full:1}],{},v=>put('config',{id:'team',list:[...team(),v]}));
ACT.teamDel=d=>put('config',{id:'team',list:team().filter((_,i)=>i!==+d.i)});
ACT.backup=()=>saveFile('Resident Bookkeeper backup '+today()+'.json',JSON.stringify({app:'trb',saved:today(),data:cache}));
CH.restore=async(d,el)=>{const f=el.files[0];if(!f)return;try{const j=JSON.parse(await f.text());if(j.app!=='trb'||!j.data)throw 0;let n=0;COLS.forEach(c=>Object.values(j.data[c]||{}).forEach(o=>{if(o&&o.id){put(c,o);n++}}));toast(n+' records restored')}catch(e){toast('That is not a Resident Bookkeeper backup file.')}};

/* ----- example data ----- */
ACT.loadExamples=()=>{if(clients().some(c=>c.example))return toast('Examples are already loaded.');const p0=today().slice(0,7),X={example:true};
  const a=put('clients',{...X,name:'Example: Bright Kids Store',legal:'Limited company',industry:'Retail and e-commerce',contact:'Mrs Ada',software:'This app',status:'Active',fee:150000,currency:'₦',yearEnd:12,vat:true,paye:true,pension:true,wht:false,created:today()});
  const b=put('clients',{...X,name:'Example: Arewa Builders',legal:'Business name (sole owner)',industry:'Construction',contact:'Mr Musa',software:'Excel',status:'Onboarding',fee:100000,currency:'₦',yearEnd:12,vat:false,paye:true,pension:false,wht:true,created:today()});
  const rows=[];[2,1,0].forEach((back,i)=>{const p=pAdd(p0,-back),g=1+i*0.12,d=n=>p+'-'+pad(n);
    if(i===0)rows.push({date:d(1),desc:'Owner capital introduced',amt:2500000,dr:'1000',cr:'3000'});
    [[3,'POS settlement week 1',820000],[10,'Transfer from customer: school uniforms',640000],[17,'POS settlement week 3',910000],[24,'Paystack payout',560000]].forEach(s=>rows.push({date:d(s[0]),desc:s[1],amt:Math.round(s[2]*g),dr:'1000',cr:'4000'}));
    [[5,'Stock purchase: Lagos supplier',1250000*g,'5000'],[6,'Freight and clearing',180000,'5100'],[25,'Staff salaries',420000,'6000'],[2,'Shop rent',250000,'6010'],[12,'Instagram and Facebook adverts',95000+i*40000,'6040'],[15,'Electricity and generator fuel',68000,'6020'],[28,'Bank charges and SMS alerts',4350,'6060'],[20,'Owner withdrawal',150000,'3100']].forEach(s=>rows.push({date:d(s[0]),desc:s[1],amt:Math.round(s[2]),dr:s[3],cr:'1000'}));
    if(back===0)rows.push({date:d(9),desc:'NIP transfer to 0123456789 (no narration)',amt:75000,dr:SUSP,cr:'1000'})});
  addRows(a.id,rows.filter(r=>r.date<=today()));all('ledger').filter(l=>l.clientId===a.id).forEach(l=>put('ledger',{...l,...X}));
  [['Amaka Obi','Shop manager',120000,40000,20000,600000],['Tunde Bello','Sales assistant',70000,20000,15000,0],['Grace Yusuf','Cashier',65000,15000,10000,0]].forEach(s=>put('staff',{...X,clientId:a.id,name:s[0],role:s[1],basic:s[2],housing:s[3],transport:s[4],other:0,rent:s[5],pension:true,nhf:false}));
  [['Reconcile '+pLabel(p0)+' bank statement',a.id,3,'Monthly'],['Send management report',a.id,6,'Monthly'],['Chase missing receipts',a.id,-2,'None'],['Agree opening balances',b.id,5,'None'],['Collect CAC documents and TIN',b.id,-1,'None']].forEach(t=>put('tasks',{...X,title:t[0],clientId:t[1],due:dAdd(today(),t[2]),priority:'Normal',repeat:t[3],who:firm().owner}));
  DEF_DOCS.slice(0,4).forEach((n,i)=>put('docs',{...X,clientId:a.id,period:p0,name:n,status:i<2?'Received':'Requested',received:i<2?today():''}));
  ui.client=a.id;saveUi();toast('Example data loaded')};
ACT.clearExamples=()=>confirmBox('Remove all example clients and their records?','Remove examples',()=>{const ids=new Set(clients().filter(c=>c.example).map(c=>c.id));COLS.forEach(col=>{if(col!=='config')all(col).filter(x=>x.example||ids.has(x.clientId)||ids.has(x.id)).forEach(x=>del(col,x.id))});if(ids.has(ui.client))ui.client='';toast('Examples removed')});

/* ================= CORE ================= */
let dirty=false;
function renderNav(){$('#nav').innerHTML=MODS.map(([k,l],i)=>`<button data-a="go" data-m="${k}" class="${k===ui.mod?'on':''}">${ico(k)}<span>${l}</span></button>`).join('')}
function render(){const v=$('#view');
  const sc=$('#selClient');sc.innerHTML='<option value="">All clients</option>'+clients().map(c=>`<option value="${c.id}" ${c.id===ui.client?'selected':''}>${esc(c.name)}</option>`).join('');$('#selPeriod').value=ui.period;
  if(ui.client&&!cache.clients[ui.client]&&mode!=='loading')ui.client='';
  if(mode==='loading')return;
  const a=document.activeElement,keep=a&&a.id&&v.contains(a)?{id:a.id,val:a.value,s:a.selectionStart,text:/^(text|number|date|email|month|search|)$/.test(a.type||'')||a.tagName==='TEXTAREA'}:null;
  let html;try{html=V[ui.mod]()}catch(e){console.error(e);html=`<div class="empty"><b>This page could not be shown</b>Reload the page. If it keeps happening, contact support and say which module you opened.</div>`}
  v.innerHTML=html;dirty=false;
  if(keep){const el=document.getElementById(keep.id);if(el){if(keep.text)el.value=keep.val;el.focus();try{if(keep.text&&keep.s!=null)el.setSelectionRange(keep.s,keep.s)}catch(e){}}}
  setSave()}
function draw(force){if(!force){const a=document.activeElement;if(a&&$('#view').contains(a)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&a.type!=='checkbox'&&a.type!=='file'){dirty=true;return}}render()}
function go(m){if(!V[m])m='dashboard';ui.mod=m;$('#app').classList.remove('open');renderNav();draw(true);window.scrollTo(0,0);try{history.replaceState(null,'','#'+m)}catch(e){}}
ACT.go=d=>go(d.m);
ACT.tab=d=>{ui.tab[ui.mod]=d.k;draw(true)};
ACT.menu=()=>$('#app').classList.toggle('open');
ACT.close=()=>closeModal();
ACT.copyTxt=()=>{const t=$('#mTxt');navigator.clipboard.writeText(t.value).then(()=>toast('Copied'),()=>{t.focus();t.select();toast('Press Ctrl+C to copy')})};
ACT.confirmYes=()=>{const f=confirmBox.fn;closeModal();if(f)f();draw(true)};
CH.setClient=(d,el)=>{ui.client=el.value;saveUi();imp=null;rc.bank=rc.book=null};
CH.setPeriod=(d,el)=>{if(el.value){ui.period=el.value;saveUi()}};
FM.modalForm=()=>{const{fields,onSave}=formCb,v={};for(const x of fields){const el=$('#f_'+x.k);v[x.k]=x.t==='check'?el.checked:x.t==='number'?(+el.value||0):el.value.trim()}
  if(onSave(v)===false)return;closeModal();draw(true)};
document.addEventListener('click',e=>{const el=e.target.closest('[data-a]');if(el){if(el.disabled)return;const f=ACT[el.dataset.a];if(f)f(el.dataset,el);return}
  if(e.target.id==='modal')closeModal();else if(!e.target.closest('#side'))$('#app').classList.remove('open')});
document.addEventListener('change',e=>{const el=e.target.closest('[data-c]');if(!el)return;const f=CH[el.dataset.c];if(!f)return;const r=f(el.dataset,el);if(el.dataset.c==='impInc'||el.dataset.c==='impAcc'||el.dataset.c==='rcAcct')return;if(r&&r.then)return;setTimeout(()=>draw(true),0)});
document.addEventListener('submit',e=>{const f=e.target.closest('form[data-f]');if(!f)return;e.preventDefault();const v={};new FormData(f).forEach((x,k)=>v[k]=typeof x==='string'?x.trim():x);FM[f.dataset.f](v,f)});
document.addEventListener('focusout',()=>setTimeout(()=>{if(dirty)draw()},50));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#modal').hidden)closeModal()});

function banner(t){const b=$('#banner');b.textContent=t;b.hidden=!t}
function startMemory(note){mode='memory';try{const s=JSON.parse(localStorage.getItem('trb-data')||'null');if(s)COLS.forEach(c=>cache[c]=s[c]||{})}catch(e){}
  banner(note||'Preview: this view cannot reach your saved records, so changes here stay in this browser only.');if(!clients().length)ACT.loadExamples();render()}
async function boot(){const h=(location.hash||'').slice(1);if(V[h])ui.mod=h;renderNav();render();
  const C=window.claude;if(!C||!C.use)return startMemory();
  let d=null;try{[d,dl,sample]=await Promise.all([C.use('db'),C.use('downloads'),C.use('sample')])}catch(e){}
  if(!d)return startMemory();
  db=d;const seen=new Set();
  COLS.forEach(c=>db.collection(c).limit(1000).onSnapshot(s=>{const m={};s.docs.forEach(x=>{m[x.id]={...x.data(),id:x.id}});
      for(const k in pend){const p=pend[k];if(p.col!==c)continue;if(p.o)m[p.id]=p.o;else delete m[p.id]}
      cache[c]=m;seen.add(c);if(seen.size===COLS.length&&mode!=='db'){mode='db';draw(true)}else if(mode==='db')draw()},
    e=>{if(mode==='loading')startMemory('Your saved records could not be opened in this view. Reload the page to try again.');else banner('The connection to your saved records dropped. Reload the page before making more changes.')}))}
/* ================= HOSTED VERSION: sign-in and database ================= */
const SB=supabase.createClient('https://njhohxhtqkktktngjflb.supabase.co','sb_publishable_KqlXsF07Jgj-dS8P382reQ_-ShRBI7O');
const TBL='rb_app_records';
const shim={collection:c=>({doc:id=>({
  set:async o=>{const{error}=await SB.from(TBL).upsert({col:c,id,data:o,client_id:c==='clients'?id:(o.clientId||null),updated_at:new Date().toISOString()});if(error)throw error},
  delete:async()=>{const{error}=await SB.from(TBL).delete().eq('col',c).eq('id',id);if(error)throw error}})})};
let loadedAt=0;
async function loadAll(){const fresh={};COLS.forEach(c=>fresh[c]={});
  for(let from=0;;from+=1000){const{data,error}=await SB.from(TBL).select('col,id,data').order('col').order('id').range(from,from+999);if(error)throw error;
    data.forEach(r=>{if(fresh[r.col])fresh[r.col][r.id]={...r.data,id:r.id}});if(data.length<1000)break}
  for(const k in pend){const p=pend[k];if(p.o)fresh[p.col][p.id]=p.o;else delete fresh[p.col][p.id]}
  COLS.forEach(c=>cache[c]=fresh[c]);loadedAt=Date.now()}
const authEl=()=>$('#auth');
function authView(html){authEl().innerHTML=`<div class="abox"><img src="${$('.brand img').src}" alt=""><small>THE</small><b>RESIDENT BOOKKEEPER</b>${html}</div>`;authEl().hidden=false;$('#app').hidden=true;authEl().querySelectorAll('input[type=password]').forEach(i=>{const w=document.createElement('span');w.className='pwwrap';i.parentNode.insertBefore(w,i);w.appendChild(i);const b=document.createElement('button');b.type='button';b.className='pwbtn';b.dataset.a='pwShow';b.textContent='Show';b.setAttribute('aria-label','Show password');w.appendChild(b)});const i=$('#auth input');if(i)i.focus()}
const signInView=msg=>authView(`<p class="mut">Practice portal</p><form data-f="signIn"><label class="f">Email<input name="email" id="au_email" type="email" autocomplete="username" required></label><label class="f">Password<input name="password" id="au_pw" type="password" autocomplete="current-password" required></label><div class="aerr" id="au_err">${esc(msg||'')}</div><button class="btn pri" type="submit" id="au_btn">Sign in</button></form><p class="sm mut"><a href="#" data-a="showForgot">Forgotten your password?</a></p>`);
const newPwView=(msg,first)=>authView(`<p class="mut">${first?'Welcome. Choose your own password to replace the temporary one.':'Choose a new password.'}</p><form data-f="newPw"><label class="f">New password (at least 10 characters)<input name="p1" id="au_p1" type="password" autocomplete="new-password" minlength="10" required></label><label class="f">Type it again<input name="p2" id="au_p2" type="password" autocomplete="new-password" minlength="10" required></label><div class="aerr" id="au_err">${esc(msg||'')}</div><button class="btn pri" type="submit" id="au_btn">Save password</button>${first?'':'<button class="btn" type="button" data-a="pwCancel">Cancel</button>'}</form>`);
async function enter(user){
  if(recovering||(user.user_metadata&&user.user_metadata.temp))return newPwView('',!recovering);
  authView('<p class="mut">Opening your records…</p>');
  const{data:acc,error}=await SB.from('rb_app_access').select('role').maybeSingle();
  if(error)return signInView('Your records could not be opened. Check your connection and try again.');
  if(!acc||(acc.role!=='owner'&&acc.role!=='team')){await SB.auth.signOut();return signInView('This login does not have access to the practice portal.')}
  try{await loadAll()}catch(e){return signInView('Your records could not be opened. Check your connection and try again.')}
  db=shim;mode='db';authEl().hidden=true;$('#app').hidden=false;$('#who').textContent=user.email;window.FB_ROLE=acc.role;if(acc.role==='team')banner('You can see only the clients Nancy has assigned to you. Adding clients and changing firm settings is done by Nancy.');if(window.trbAudit)trbAudit.start(SB,'FirmBook');renderNav();render()}
FM.signIn=async v=>{$('#au_btn').disabled=true;$('#au_err').textContent='';const{data,error}=await SB.auth.signInWithPassword({email:v.email,password:v.password});
  if(error){$('#au_btn').disabled=false;$('#au_err').textContent=/invalid/i.test(error.message)?'That email or password is not right.':'Could not sign in. Check your connection and try again.';return}enter(data.user)};
FM.newPw=async v=>{if(v.p1!==v.p2)return $('#au_err').textContent='The two passwords do not match.';if(v.p1.length<10)return $('#au_err').textContent='Use at least 10 characters.';
  $('#au_btn').disabled=true;const{data,error}=await SB.auth.updateUser({password:v.p1,data:{temp:false}});
  if(error){$('#au_btn').disabled=false;$('#au_err').textContent=/different|same/i.test(error.message)?'Choose a password different from the current one.':/weak|least|characters/i.test(error.message)?error.message:'The password could not be saved. Try again.';return}
  toast('Password saved');recovering=false;enter(data.user)};
ACT.signOut=async()=>{if(window.trbAudit)await trbAudit.log('logout','FirmBook');await SB.auth.signOut();COLS.forEach(c=>cache[c]={});mode='loading';signInView()};
ACT.changePw=()=>newPwView('',false);
ACT.pwShow=(d,el)=>{const i=el.parentNode.querySelector('input');const show=i.type==='password';i.type=show?'text':'password';el.textContent=show?'Hide':'Show';el.setAttribute('aria-label',show?'Hide password':'Show password');i.focus()};
const forgotView=msg=>authView(`<p class="mut">Enter your email and we will send you a link to set a new password.</p><form data-f="forgot"><label class="f">Email<input name="email" id="fg_email" type="email" autocomplete="username" required></label><div class="aerr" id="au_err">${esc(msg||'')}</div><button class="btn pri" type="submit" id="au_btn">Send link</button></form><p class="sm"><a href="#" data-a="showSignIn">Back to sign in</a></p>`);
ACT.showForgot=()=>forgotView();ACT.showSignIn=()=>signInView();
FM.forgot=async v=>{$('#au_btn').disabled=true;await SB.auth.resetPasswordForEmail(v.email,{redirectTo:location.origin+location.pathname});authView(`<p class="mut">If an account exists for ${esc(v.email)}, a link to set a new password is on its way. Open it on this device.</p><p class="sm"><a href="#" data-a="showSignIn">Back to sign in</a></p>`)};
let recovering=false;
ACT.pwCancel=()=>{authEl().hidden=true;$('#app').hidden=false};
document.addEventListener('visibilitychange',async()=>{if(document.visibilityState==='visible'&&mode==='db'&&!pending&&Date.now()-loadedAt>60000&&$('#modal').hidden){try{await loadAll();draw()}catch(e){}}});
(async()=>{const h=(location.hash||'').slice(1);if(V[h])ui.mod=h;SB.auth.onAuthStateChange(ev=>{if(ev==='PASSWORD_RECOVERY'){recovering=true;newPwView('',false)}});const{data}=await SB.auth.getSession();if(recovering)return;if(data&&data.session)enter(data.session.user);else signInView()})();
