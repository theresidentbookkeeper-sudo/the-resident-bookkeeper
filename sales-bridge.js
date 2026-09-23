/* The Resident Bookkeeper sales bridge */
(function(){
 const KEY='trb_sales_state_v1';
 const now=()=>new Date().toISOString();
 const load=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{leads:[],quotes:[],followups:[]}}catch(e){return{leads:[],quotes:[],followups:[]}}};
 const save=s=>{localStorage.setItem(KEY,JSON.stringify(s));window.dispatchEvent(new CustomEvent('trb:sales-updated',{detail:s}));return s};
 function addLead(data){const s=load();let x=s.leads.find(l=>(l.email&&data.email&&l.email.toLowerCase()===data.email.toLowerCase())||(l.phone&&data.phone&&l.phone===data.phone));if(x)Object.assign(x,data,{updatedAt:now()});else{x={id:'L-'+Date.now().toString(36),createdAt:now(),updatedAt:now(),stage:'New',source:'Website',...data};s.leads.unshift(x)}save(s);return x}
 function updateLead(id,patch){const s=load(),x=s.leads.find(l=>l.id===id);if(!x)return null;Object.assign(x,patch,{updatedAt:now()});save(s);return x}
 function addQuote(data){const s=load(),q={id:'Q-'+Date.now().toString(36),createdAt:now(),status:'Draft',...data};s.quotes.unshift(q);save(s);return q}
 function addFollowup(data){const s=load(),f={id:'F-'+Date.now().toString(36),createdAt:now(),status:'Pending',...data};s.followups.unshift(f);save(s);return f}
 function seedFollowups(lead){[['Initial response',0,'Thank you for reaching out to The Resident Bookkeeper. We have received your enquiry and will review your bookkeeping needs.'],['Helpful check-in',2,'Just checking in on your bookkeeping enquiry. We can help you identify the records and period that need attention.'],['Quote follow-up',5,'Following up on your bookkeeping enquiry. If you are ready, we can confirm the scope and prepare your quote.'],['Final gentle follow-up',10,'A quick final check-in from The Resident Bookkeeper. We are happy to help whenever you are ready.']].forEach((x)=>addFollowup({leadId:lead.id,title:x[0],dueAt:new Date(Date.now()+x[1]*86400000).toISOString(),message:x[2],channel:'WhatsApp'}))}
 window.TRB={load,save,addLead,updateLead,addQuote,addFollowup,seedFollowups,KEY};
})();