// All data, credentials, captures and screenshots stay in an isolated temporary app.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const root = path.resolve(import.meta.dirname, '..');
const qa = fs.mkdtempSync(path.join(os.tmpdir(), 'trackscore-phase-a-browser-'));
const sandbox = path.join(qa, 'app');
fs.mkdirSync(sandbox);
process.chdir(sandbox);
for (const name of ['public','netlify','dist','build','src','react']) fs.cpSync(path.join(root,name),path.join(sandbox,name),{recursive:true});
for (const name of ['server.ts','package.json','vite.react.config.ts','tsconfig.json']) fs.copyFileSync(path.join(root,name),path.join(sandbox,name));
fs.cpSync(path.join(root,'scripts'),path.join(sandbox,'scripts'),{recursive:true});
fs.symlinkSync(path.join(root,'node_modules'),path.join(sandbox,'node_modules'));
fs.mkdirSync(path.join(sandbox,'.data'));
const secret = crypto.randomBytes(32).toString('hex');
const password = crypto.randomBytes(16).toString('hex') + 'Aa1!';
const passwordHash = bcrypt.hashSync(password,10);
const users = ['manager','assessor'].map(role=>({_id:`phasea-${role}`,role,name:`Phase A ${role}`,email:`${role}@phasea.test`,assessorId:role==='assessor'?'PAA 001':undefined,passwordHash,mustChangePassword:false}));
const vendors = [{_id:'phasea-vendor',companyName:'Phase A Vendor',contactEmail:'vendor@phasea.test',loginEmail:'vendor@phasea.test',linkedRegistrationIds:[],passwordHash,isActive:true,mustChangePassword:false}];
const now = new Date().toISOString();
const day = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const statuses = ['submitted','pending_review','rejected','remediation_required','scheduled','in_progress','approved','approved','registered','completed','pre_final_sent','payment_confirmed'];
const records = statuses.map((status,i)=>({_id:`phasea-assessment-${i}`,companyName:i===0?'New Fleet':`Phase A Fleet ${i}`,deviceModel:`Gateway ${i}`,status,recordType:'evaluation',currentVersion:1,approvedVersion:['approved','pre_final_sent','payment_confirmed','completed'].includes(status)?1:undefined,...(i===7?{certificate:{preparedDate:day}}:{}),createdAt:now,updatedAt:new Date(Date.now()-i*1000).toISOString(),scheduledDate:day,assessorId:'PAA 001',assessorName:'Phase A assessor',assignedAssessorId:'phasea-assessor',assignedAssessorName:'Phase A assessor',assignedAt:now,slaStartAt:now,slaDeadline:new Date(Date.now()+(i===5?-1:7)*86400000).toISOString(),statusHistory:[],evaluationHistory:[],documents:[],comments:[],breakdown:[]}));
vendors[0].linkedRegistrationIds=records.map(r=>r._id);
const write=(name,value)=>fs.writeFileSync(path.join(sandbox,'.data',name+'.json'),JSON.stringify(value));
for (const [name,value] of Object.entries({users,vendors,evaluations:records,assessment_versions:[],inquiries:[],assessment_risk:[]})) write(name,value);
const env={...process.env,MONGODB_URI:'',JWT_SECRET:secret,AUTO_SEED_DEFAULT_USERS:'false',RESEND_API_KEY:'',SMTP_PASSWORD:'',CONTEXT:'test'};
const children=[],logs=[],results=[],errors=[],http=[],streams=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let current='setup',expectedFailure=false,browser,context,page;
const safeUrl=url=>{try{return new URL(url).pathname;}catch{return 'unknown';}};
async function start(mode){
  const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const fd=fs.openSync(path.join(qa,`${mode}-server.log`),'w');logs.push(fd);
  const args=mode==='development'?[path.join(root,'node_modules/tsx/dist/cli.mjs'),'server.ts']:['build/server.cjs'];
  const child=spawn(process.execPath,args,{cwd:sandbox,stdio:['ignore',fd,fd],env:{...env,NODE_ENV:mode,PORT:String(port)}});children.push(child);const base=`http://127.0.0.1:${port}`;
  for(let i=0;i<100;i++){if(child.exitCode!==null)throw new Error('Isolated server exited during startup');try{if((await fetch(base+'/api/health')).ok)return {base,child};}catch{}await delay(100);}throw new Error('Isolated server startup timed out');
}
async function check(name,fn,expected=false){
  current=name;expectedFailure=expected;const es=errors.length,hs=http.length;
  try{const evidence=await fn();await delay(70);assert.equal(errors.slice(es).filter(e=>!e.expected).length,0,'Unexpected console/page error');assert.equal(http.slice(hs).filter(e=>!e.expected).length,0,'Unexpected HTTP error');results.push({name,status:'VERIFIED WORKING',evidence});console.log('PASS '+name);}
  catch(error){results.push({name,status:'VERIFIED BROKEN',error:error.message});console.log('FAIL '+name+': '+error.message);throw error;}
  finally{if(page)await page.unrouteAll({behavior:'ignoreErrors'});}
}
try{
  const {chromium}=await import(process.env.TRACKSCORE_PLAYWRIGHT_MODULE?pathToFileURL(process.env.TRACKSCORE_PLAYWRIGHT_MODULE).href:'playwright-core');
  const dev=await start('development');
  browser=await chromium.launch({...process.env.TRACKSCORE_BROWSER_EXECUTABLE?{executablePath:process.env.TRACKSCORE_BROWSER_EXECUTABLE}:{}});
  context=await browser.newContext({viewport:{width:1366,height:768}});
  await context.exposeBinding('__streamChange',(_,active)=>streams.push({test:current,active}));
  await context.addInitScript(()=>{
    const Original=window.EventSource;window.__sources=[];window.__activeStreams=0;window.__peakStreams=0;
    window.EventSource=class extends Original{
      constructor(...args){super(...args);this.__closed=false;window.__sources.push(this);window.__activeStreams++;window.__peakStreams=Math.max(window.__peakStreams,window.__activeStreams);window.__streamChange(window.__activeStreams);}
      close(){if(!this.__closed){this.__closed=true;window.__activeStreams--;window.__streamChange(window.__activeStreams);}super.close();}
    };
    window.__polling=new Map();const interval=window.setInterval.bind(window),clear=window.clearInterval.bind(window);
    window.setInterval=(fn,ms,...args)=>{const id=interval(fn,ms,...args);if(ms===30_000)window.__polling.set(id,fn);return id;};
    window.clearInterval=id=>{window.__polling.delete(id);clear(id);};
  });
  page=await context.newPage();page.setDefaultTimeout(12000);
  // Retain only paths/status/initiator frames, never CDP headers or query tokens.
  const network=await context.newCDPSession(page),requests=new Map(),mountProofs=[];
  await network.send('Network.enable');
  network.on('Network.requestWillBeSent',event=>{
    const pathname=safeUrl(event.request.url);
    if(!pathname.startsWith('/react/assets/')&&!pathname.endsWith('/get-evaluations'))return;
    const frames=[];
    for(let stack=event.initiator.stack;stack;stack=stack.parent) for(const frame of stack.callFrames) {
      if(frame.url)frames.push({path:safeUrl(frame.url),line:frame.lineNumber+1,column:frame.columnNumber+1});
    }
    requests.set(event.requestId,{path:pathname,method:event.request.method,type:event.type,initiator:event.initiator.type,frames});
  });
  network.on('Network.responseReceived',event=>{const request=requests.get(event.requestId);if(request)request.status=event.response.status;});
  page.on('pageerror',e=>errors.push({test:current,expected:expectedFailure,message:e.message.replace(/token=[^&\s]+/g,'token=REDACTED')}));
  page.on('console',m=>{if(m.type()==='error')errors.push({test:current,expected:expectedFailure,message:m.text().replace(/token=[^&\s]+/g,'token=REDACTED')});});
  page.on('response',r=>{if(r.status()>=400)http.push({test:current,expected:expectedFailure,status:r.status(),path:safeUrl(r.url())});});
  page.on('requestfailed',r=>{if(r.failure()?.errorText!=='net::ERR_ABORTED')http.push({test:current,expected:expectedFailure,error:r.failure()?.errorText,path:safeUrl(r.url())});});
  async function login(role){await page.goto(dev.base+'/login.html');await page.evaluate(()=>{localStorage.removeItem('trackscore_token');localStorage.removeItem('trackscore_user');localStorage.removeItem('trackscore_user_role');});await page.locator('#tab-'+role).click();await page.locator('#login-email').fill(role+'@phasea.test');await page.locator('#login-password').fill(password);await page.locator('#btn-login-submit').click();await page.waitForURL(`**/${role==='manager'?'dashboard':role==='assessor'?'index':'vendor-portal'}.html`);}
  async function overview(){await page.goto(dev.base+'/react/manager.html');await page.locator('.ts-metrics').waitFor();await settled();}
  async function settled(){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.waitForFunction(()=>!document.querySelector('.ts-refresh button')?.disabled);}
  async function proveReactActive(mode) {
    const ownership=await page.evaluate(()=>{
      const root=document.getElementById('root');
      return {rootExists:!!root,reactContainer:!!root&&Object.keys(root).some(key=>key.startsWith('__reactContainer$')),
        reactChild:!!root?.firstElementChild&&Object.keys(root.firstElementChild).some(key=>key.startsWith('__reactFiber$')),
        heading:root?.querySelector('h1')?.textContent,
        scripts:[...document.scripts].map(script=>({path:new URL(script.src,location.href).pathname,type:script.type})),
        legacyControllerPresent:typeof window.loadManagerOverview==='function'||typeof window.managerOverviewRecordAction==='function'};
    });
    assert.ok(ownership.rootExists&&ownership.reactContainer&&ownership.reactChild,'React must own the mounted root');
    assert.equal(ownership.heading,'Overview');assert.equal(ownership.legacyControllerPresent,false);
    assert.equal(ownership.scripts.length,1);
    const script=ownership.scripts[0];assert.equal(script.type,'module');assert.match(script.path,/^\/react\/assets\/manager-[\w-]+\.js$/);
    const loaded=[...requests.values()].find(request=>request.path===script.path&&request.status===200);
    assert.ok(loaded,'Browser must load the React bundle successfully');
    const request=[...requests.values()].find(request=>request.path.endsWith('/get-evaluations')&&request.method==='GET'&&request.status===200&&request.frames.some(frame=>frame.path===script.path));
    assert.ok(request,'Overview GET must originate in the loaded React bundle');
    const expected=fs.readFileSync(path.join(sandbox,'dist',script.path));
    const served=Buffer.from(await(await fetch(new URL(script.path,page.url()))).arrayBuffer());
    const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
    assert.equal(digest(served),digest(expected),'Served bundle must match generated output');
    const proof={mode,...ownership,bundleSha256:digest(served),overviewRequest:request};
    mountProofs.push(proof);fs.writeFileSync(path.join(qa,'react-mount-proof.json'),JSON.stringify(mountProofs,null,2));return proof;
  }
  const pattern='**/get-evaluations?view=overview*';
  if(!process.argv.includes('--security-only')) {
  await check('Development keeps all eight legacy pages and only serves generated React files',async()=>{
    for(const route of ['/','/login.html','/dashboard.html','/index.html','/vendor-portal.html','/request-assessment.html','/change-password.html','/verify-certificate.html','/react/manager.html'])assert.equal((await fetch(dev.base+route)).status,200,route);
    const blocked=['/src/main.tsx','/.env','/.data/users.json','/build/server.cjs','/server.ts','/react/.env','/react/src/main.tsx','/react/@fs/etc/passwd','/react/manager.html.map','/react/assets/server.cjs','/react/netlify/functions/auth.js','/react/uploads/private.pdf','/react/package.json','/react/unknown'];for(const route of blocked)assert.equal((await fetch(dev.base+route)).status,404,route);return {legacyPages:8,blockedPaths:blocked.length};
  });
  await check('Legacy landing remains usable without a React bundle',async()=>{await page.goto(dev.base);assert.ok((await page.locator('body').innerText()).includes('TrackScore'));assert.ok(await page.locator('a[href]').count()>0);assert.equal(await page.locator('script[src*="/react/"]').count(),0);});
  await check('Legacy Manager login/dashboard and repository remain usable',async()=>{await login('manager');await page.waitForFunction(()=>document.getElementById('overview-active')?.textContent!=='?');await page.locator('#tab-btn-evaluations').click();await page.locator('#evaluations-tbody').getByText('New Fleet',{exact:true}).waitFor();});
  await check('React Manager overview matches the real response totals and samples',async()=>{
    requests.clear();await overview();const mount=await proveReactActive('development');const body=await page.evaluate(async()=>(await fetch('/.netlify/functions/get-evaluations?view=overview',{headers:{Authorization:`Bearer ${localStorage.getItem('trackscore_token')}`}})).json());const data=body.overview;
    assert.deepEqual((await page.locator('.ts-metric strong').allTextContents()).map(Number),[data.attentionTotal,data.metrics.review,data.metrics.certificateReady,data.metrics.overdue,data.metrics.active,data.metrics.dueSoon,data.metrics.unassigned,data.metrics.certificateInProgress]);assert.equal(await page.locator('tbody tr').count(),data.recent.length);assert.ok((await page.locator('.ts-workload').innerText()).includes('Phase A assessor'));assert.equal(await page.locator('script[src$="app.js"]').count(),0);return {total:data.total,recentRows:data.recent.length,reactMounted:mount.reactContainer&&mount.reactChild,apiInitiator:mount.overviewRequest.frames[0].path};
  });
  await check('Recent review/revision/scheduled/in-progress filters use backend groups',async()=>{for(const[value,label,count]of [['review','Waiting Review',2],['revision','Changes Requested',2],['scheduled','Scheduled',1],['in_progress','In Progress',1]]){await page.getByLabel('Status',{exact:true}).selectOption(value);await settled();assert.equal(await page.locator('tbody tr').count(),count);assert.ok((await page.locator('tbody').innerText()).includes(label));}await page.getByLabel('Status',{exact:true}).selectOption('');await settled();});
  await check('Refresh handles a genuinely empty store then repopulates it',async()=>{write('evaluations',[]);await page.getByRole('button',{name:'Refresh overview'}).click();await page.getByRole('heading',{name:'No assessments yet'}).waitFor();assert.ok((await page.locator('.ts-metric strong').allTextContents()).every(v=>v==='0'));write('evaluations',records);await page.getByRole('button',{name:'Refresh overview'}).click();await page.locator('tbody').getByText('New Fleet',{exact:true}).waitFor();await settled();});
  await check('Loading has an announcement until the response arrives',async()=>{await page.route(pattern,async route=>{await delay(600);await route.continue();});await page.reload();await page.getByRole('status').filter({hasText:'Loading overview'}).waitFor();await page.locator('.ts-metrics').waitFor();await settled();});
  await check('API failure preserves last data and Retry recovers',async()=>{await page.route(pattern,route=>route.fulfill({status:503,contentType:'application/json',body:'{"success":false,"error":"QA overview failure"}'}));await page.getByRole('button',{name:'Refresh overview'}).click();await page.getByRole('alert').getByText('QA overview failure').waitFor();assert.ok(await page.locator('.ts-metrics').isVisible());await page.unroute(pattern);await page.getByRole('button',{name:'Try again'}).click();await settled();assert.equal(await page.getByRole('alert').count(),0);},true);
  await check('Ordinary 403 preserves the Manager session',async()=>{await page.route(pattern,route=>route.fulfill({status:403,contentType:'application/json',body:'{"success":false,"error":"QA forbidden overview"}'}));await page.getByRole('button',{name:'Refresh overview'}).click();await page.getByRole('alert').waitFor();assert.ok(await page.evaluate(()=>localStorage.getItem('trackscore_token')));assert.ok(page.url().endsWith('/react/manager.html'));await page.unroute(pattern);await page.getByRole('button',{name:'Try again'}).click();await settled();},true);
  await check('Stale filter response cannot overwrite the newest result',async()=>{let entered;const pending=new Promise(resolve=>{entered=resolve;});await page.route(pattern,async route=>{if(new URL(route.request().url()).searchParams.get('q')==='Phase A Fleet'){const response=await route.fetch();entered();await delay(700);await route.fulfill({response}).catch(()=>{});}else await route.continue();});await page.getByLabel('Search recent assessments').fill('Phase A Fleet');await pending;await page.getByLabel('Search recent assessments').fill('New Fleet');await settled();await delay(850);assert.equal(await page.locator('tbody tr').count(),1);assert.ok((await page.locator('tbody').innerText()).includes('New Fleet'));await page.unroute(pattern);await page.getByLabel('Search recent assessments').fill('');await settled();});
  await check('All five requested viewports fit and keep controls usable',async()=>{
    async function fits(width) {
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overflow ${width}`);
      for(const control of await page.locator('nav a, .ts-topbar button, .ts-refresh button, .ts-filters input, .ts-filters select, [role="alert"] button').all()) {
        await control.scrollIntoViewIfNeeded();
        const box=await control.boundingBox();
        assert.ok(box&&box.width>0&&box.x>=-1&&box.x+box.width<=width+1,`Clipped control at ${width}`);
      }
    }
    for(const[width,height]of [[1920,1080],[1366,768],[1280,800],[768,1024],[390,844]]) {
      await page.setViewportSize({width,height});await fits(width);
      for(const heading of ['Recent assessments','Today’s schedule','Assessor workload']) assert.ok(await page.getByRole('heading',{name:heading,exact:true}).isVisible());
      await page.screenshot({path:path.join(qa,`react-manager-${width}.png`),fullPage:true});
      await page.route(pattern,async route=>{await delay(600);await route.continue();});
      await page.reload();await page.getByRole('status').filter({hasText:'Loading overview'}).waitFor();await fits(width);
      await page.screenshot({path:path.join(qa,`react-manager-loading-${width}.png`),fullPage:true});
      await page.locator('.ts-metrics').waitFor();await settled();await page.unroute(pattern);
      await page.route(pattern,route=>route.fulfill({status:200,contentType:'application/json',body:'{"success":false,"error":"QA responsive overview failure"}'}));
      await page.getByRole('button',{name:'Refresh overview'}).click();await page.getByRole('alert').waitFor();await fits(width);
      await page.screenshot({path:path.join(qa,`react-manager-error-${width}.png`),fullPage:true});
      await page.unroute(pattern);await page.getByRole('button',{name:'Try again'}).click();await settled();
      assert.equal(await page.getByRole('alert').count(),0);
    }
    await page.setViewportSize({width:1366,height:768});return {viewports:5,states:['populated','loading','error'],clippedControls:0};
  });
  await check('Keyboard navigation, focus and labels remain meaningful',async()=>{await page.getByRole('link',{name:'Skip to overview'}).focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement?.id),'overview');assert.equal(await page.getByRole('heading',{level:1}).count(),1);await page.getByLabel('Search recent assessments').focus();assert.equal(await page.evaluate(()=>document.activeElement.type),'search');await page.getByRole('button',{name:'Refresh overview'}).focus();assert.notEqual(await page.getByRole('button',{name:'Refresh overview'}).evaluate(el=>getComputedStyle(el).outlineStyle),'none');await page.keyboard.press('Space');await settled();});
  await check('SSE is singular and batches replay/later-record changes correctly',async()=>{assert.equal(await page.evaluate(()=>window.__activeStreams),1);assert.equal(await page.evaluate(()=>window.__peakStreams),1);let reads=0;const count=r=>{if(r.url().includes('get-evaluations?view=overview'))reads++;};page.on('request',count);await page.evaluate(()=>{const source=window.__sources.at(-1);for(let i=0;i<12;i++)source.onmessage({data:JSON.stringify({id:`qa-event-${i}`,status:'submitted'}),lastEventId:''});});await delay(600);assert.equal(reads,1);await page.evaluate(()=>window.__sources.at(-1).onmessage({data:JSON.stringify({id:'qa-event-11',status:'submitted'}),lastEventId:''}));await delay(450);assert.equal(reads,1);await page.evaluate(()=>window.__sources.at(-1).onmessage({data:JSON.stringify({id:'qa-event-11',timestamp:new Date().toISOString(),newStatus:'approved'}),lastEventId:''}));await delay(500);assert.equal(reads,2);page.off('request',count);return {active:1,burstRefreshes:1,replayRefreshes:0,laterChangeRefreshes:1};});
  await check('Native reconnect reuses the EventSource instance',async()=>{await page.route('**/status-stream?*',route=>route.fulfill({status:200,contentType:'text/event-stream',body:': QA reconnect\n\n'}));await page.reload();await page.locator('.ts-metrics').waitFor();const created=await page.evaluate(()=>window.__sources.length);await delay(3600);assert.equal(await page.evaluate(()=>window.__sources.length),created);assert.equal(await page.evaluate(()=>window.__activeStreams),1);assert.equal(await page.evaluate(()=>window.__peakStreams),1);});
  await check('Fallback polling is singular and stops on recovery',async()=>{await page.reload();await page.locator('.ts-metrics').waitFor();await settled();await page.evaluate(()=>{const source=window.__sources.at(-1);source.onerror({});source.onerror({});});assert.equal(await page.evaluate(()=>window.__polling.size),1);await page.evaluate(()=>window.__sources.at(-1).onopen({}));assert.equal(await page.evaluate(()=>window.__polling.size),0);});
  await check('Session replacement closes old stream and updates the account',async()=>{const replacement=jwt.sign({role:'manager',name:'Replacement QA Manager',email:'manager@phasea.test'},secret,{expiresIn:'1h'});await page.evaluate(token=>{localStorage.setItem('trackscore_token',token);window.dispatchEvent(new Event('trackscore:auth-changed'));},replacement);await page.waitForFunction(()=>document.querySelector('.ts-account > span')?.textContent.includes('Replacement QA Manager'));await settled();assert.equal(await page.evaluate(()=>window.__activeStreams),1);assert.equal(await page.evaluate(()=>window.__peakStreams),1);});
  await check('Logout clears only auth keys, closes SSE and returns to login',async()=>{await page.evaluate(()=>localStorage.setItem('trackscore_drafts','keep'));await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForURL('**/login.html');assert.equal(await page.evaluate(()=>localStorage.getItem('trackscore_token')),null);assert.equal(await page.evaluate(()=>localStorage.getItem('trackscore_drafts')),'keep');assert.equal(streams.at(-1).active,0);});
  for(const role of ['assessor','vendor'])await check(`${role} is denied in React and both authoritative overview API prefixes`,async()=>{await login(role);await page.evaluate(()=>localStorage.setItem('trackscore_user_role','manager'));await page.goto(dev.base+'/react/manager.html');await page.getByRole('heading',{name:'Manager access required'}).waitFor();assert.equal(await page.locator('.ts-metrics').count(),0);assert.equal(await page.evaluate(()=>window.__activeStreams),0);const auth=await page.evaluate(()=>localStorage.getItem('trackscore_token'));for(const prefix of ['/api','/.netlify/functions'])assert.equal((await fetch(dev.base+prefix+'/get-evaluations?view=overview',{headers:{Authorization:`Bearer ${auth}`}})).status,403);});
  async function setToken(value){await page.goto(dev.base+'/login.html');await page.evaluate(token=>{localStorage.setItem('trackscore_token',token);localStorage.setItem('trackscore_user_role','manager');localStorage.setItem('trackscore_user','{}');},value);await page.goto(dev.base+'/react/manager.html');}
  await check('Expired JWT is refused server-side and opens existing login',async()=>{const expired=jwt.sign({role:'manager',exp:Math.floor(Date.now()/1000)-10},secret);assert.equal((await fetch(dev.base+'/api/get-evaluations?view=overview',{headers:{Authorization:`Bearer ${expired}`}})).status,401);await setToken(expired);await page.waitForURL('**/login.html');assert.equal(await page.evaluate(()=>localStorage.getItem('trackscore_token')),null);});
  await check('Overview 401 clears session and stream',async()=>{await login('manager');await page.route(pattern,route=>route.fulfill({status:401,contentType:'application/json',body:'{"success":false,"error":"Expired"}'}));await page.goto(dev.base+'/react/manager.html');await page.waitForURL('**/login.html');assert.equal(await page.evaluate(()=>localStorage.getItem('trackscore_token')),null);assert.equal(streams.at(-1).active,0);},true);
  await check('Cross-tab logout updates the existing React session',async()=>{await login('manager');await overview();const tab=await context.newPage();await tab.goto(dev.base+'/login.html');await tab.evaluate(()=>{localStorage.removeItem('trackscore_token');localStorage.removeItem('trackscore_user_role');localStorage.removeItem('trackscore_user');});await page.waitForURL('**/login.html');assert.equal(streams.at(-1).active,0);await tab.close();});
  await check('Required-password token opens existing password page without loading overview',async()=>{await setToken(jwt.sign({role:'manager',name:'QA Manager',mustChangePassword:true},secret,{expiresIn:'1h'}));await page.waitForURL('**/change-password.html');assert.equal(await page.locator('.ts-metrics').count(),0);});
  await check('Required-password 403 preserves token and opens password page',async()=>{await login('manager');await page.route(pattern,route=>route.fulfill({status:403,contentType:'application/json',body:'{"success":false,"error":"Password change required: update temporary password"}'}));await page.goto(dev.base+'/react/manager.html');await page.waitForURL('**/change-password.html');assert.ok(await page.evaluate(()=>localStorage.getItem('trackscore_token')));},true);
  await check('Legacy navigation closes React resources',async()=>{await login('manager');await overview();await page.getByRole('link',{name:'Open Manager portal'}).click();await page.waitForURL('**/dashboard.html');assert.ok(streams.some(s=>s.test===current&&s.active===0));});
  await check('Legacy and React overview have the same live response metrics and query semantics',async()=>{
    const auth=jwt.sign({role:'manager',name:'Parity QA Manager',email:'manager@phasea.test'},secret,{expiresIn:'1h'});const snapshots=[],filteredSnapshots=[];
    for(const [kind,route]of [['legacy','/dashboard.html'],['react','/react/manager.html']]){
      const capture=await browser.newContext({recordHar:{path:path.join(qa,kind+'-overview.har'),content:'embed',urlFilter:/get-evaluations\?.*view=overview/}});
      await capture.addInitScript(token=>{localStorage.setItem('trackscore_token',token);localStorage.setItem('trackscore_user_role','manager');localStorage.setItem('trackscore_user','{}');sessionStorage.setItem('manager_authenticated','true');},auth);
      const observed=await capture.newPage();const reply=observed.waitForResponse(r=>r.url().includes('get-evaluations?')&&r.url().includes('view=overview'));await observed.goto(dev.base+route);const data=await(await reply).json();snapshots.push(data.overview);
      const revisionReply=observed.waitForResponse(r=>new URL(r.url()).searchParams.get('overviewStatus')==='revision');
      if(kind==='legacy'){await observed.waitForFunction(()=>document.getElementById('overview-active')?.textContent!=='?');assert.equal(Number(await observed.locator('#overview-active').innerText()),data.overview.metrics.active);assert.equal(Number(await observed.locator('#overview-review').innerText()),data.overview.metrics.review);await observed.locator('#overview-status').selectOption('revision');await observed.waitForFunction(()=>document.getElementById('overview-recent-body').textContent.includes('Revision Required'));}
      else{await observed.locator('.ts-metrics').waitFor();assert.equal(Number(await observed.locator('.ts-metric strong').nth(4).innerText()),data.overview.metrics.active);await observed.getByLabel('Status',{exact:true}).selectOption('revision');await observed.locator('tbody').getByText('Changes Requested',{exact:true}).first().waitFor();}
      filteredSnapshots.push((await(await revisionReply).json()).overview);assert.equal(filteredSnapshots.at(-1).recentTotal,2);
      await capture.close();
    }
    assert.deepEqual(snapshots[0].metrics,snapshots[1].metrics);assert.deepEqual(snapshots[0].recent.map(r=>r._id),snapshots[1].recent.map(r=>r._id));assert.deepEqual(snapshots[0].schedule.map(r=>r._id),snapshots[1].schedule.map(r=>r._id));assert.deepEqual(filteredSnapshots[0].recent.map(r=>r._id),filteredSnapshots[1].recent.map(r=>r._id));fs.writeFileSync(path.join(qa,'parity-values.json'),JSON.stringify({metrics:snapshots[0].metrics,attentionTotal:snapshots[0].attentionTotal,recentIds:snapshots[0].recent.map(r=>r._id),revisionIds:filteredSnapshots[0].recent.map(r=>r._id),scheduleIds:snapshots[0].schedule.map(r=>r._id),workload:snapshots[0].workload.assessors.map(a=>({id:a.id,active:a.workload.active,capacity:a.workload.capacity}))},null,2));return {metricsIdentical:true,recentAndScheduleIdsIdentical:true,revisionIdsIdentical:true,captures:['legacy-overview.har','react-overview.har']};
  });
  if(process.argv.includes('--phase-b')) {
    const {verifyPhaseB}=await import('./react-manager-phase-b.mjs');
    await verifyPhaseB({page,context,browser,dev,qa,check,write,records,users,login,overview,settled,delay,streams});
  }
  if(process.argv.includes('--phase-c')) {
    const {verifyPhaseC}=await import('./react-manager-phase-c.mjs');
    await verifyPhaseC({page,context,browser,dev,qa,check,write,records,users,login,overview,settled,delay,streams});
  }
  if(process.argv.includes('--phase-d')) {
    const {verifyPhaseD}=await import('./react-manager-phase-d.mjs');
    await verifyPhaseD({page,context,browser,dev,qa,check,write,records,users,login,overview,settled,delay,streams});
  }
  if(process.argv.includes('--phase-e')) {
    const {verifyPhaseE}=await import('./react-assessor-phase-e.mjs');
    await verifyPhaseE({page,context,browser,dev,qa,check,write,records,users,login,overview,settled,delay,streams});
  }
  if(process.argv.includes('--phase-f')) {
    const {verifyPhaseF}=await import('./react-vendor-phase-f.mjs');
    await verifyPhaseF({page,context,browser,dev,qa,check,write,records,users,vendors,login,overview,settled,delay,streams});
  }
  }
  if(process.argv.includes('--security')||process.argv.includes('--security-only')) {const {verifySecurity}=await import('./security-browser.mjs');await verifySecurity({page,context,browser,dev,qa,check,write,records,users,vendors,login,overview,delay,secret,passwordHash,sandbox});}
  await check('Development watcher rebuilds source safely',async()=>{const file=path.join(sandbox,'src/components/layout/ManagerLayout.tsx'),original=fs.readFileSync(file,'utf8'),html=fs.readFileSync(path.join(sandbox,'dist/react/manager.html'),'utf8');fs.writeFileSync(file,original.replace('Manager Overview</span>','Manager Overview QA rebuild</span>'));for(let i=0;i<80&&fs.readFileSync(path.join(sandbox,'dist/react/manager.html'),'utf8')===html;i++)await delay(100);assert.notEqual(fs.readFileSync(path.join(sandbox,'dist/react/manager.html'),'utf8'),html);await overview();await page.locator('.ts-topbar').getByText('Manager Overview QA rebuild',{exact:true}).waitFor();fs.writeFileSync(file,original);});
  await page.goto('about:blank');dev.child.kill('SIGTERM');await new Promise(resolve=>dev.child.once('exit',resolve));fs.rmSync(path.join(sandbox,'dist'),{recursive:true});fs.cpSync(path.join(root,'dist'),path.join(sandbox,'dist'),{recursive:true});
  const prod=await start('production');
  await check('Production serves legacy HTML and generated React assets, never source',async()=>{for(const route of ['/','/index.html','/dashboard.html','/login.html','/vendor-portal.html','/request-assessment.html','/change-password.html','/verify-certificate.html','/react/manager.html'])assert.equal((await fetch(prod.base+route)).status,200,route);const html=await(await fetch(prod.base+'/react/manager.html')).text();for(const asset of html.matchAll(/(?:src|href)="(\/react\/assets\/[^\"]+)"/g))assert.equal((await fetch(prod.base+asset[1])).status,200);for(const route of ['/src/main.tsx','/react/src/main.tsx','/react/.env','/.data/users.json','/build/server.cjs','/server.cjs','/react/unknown','/react/@fs/etc/passwd'])assert.equal((await fetch(prod.base+route)).status,404,route);assert.ok(!fs.existsSync(path.join(sandbox,'dist/server.cjs')));});
  await check('Production React bundle renders with a valid Manager and real-shaped mock overview',async()=>{const {summarizeManagerDashboard}=await import(pathToFileURL(path.join(sandbox,'netlify/functions/manager-overview.js')).href);await page.route(pattern,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,overview:summarizeManagerDashboard(records,users.filter(u=>u.role==='assessor'))})}));await page.goto(prod.base+'/login.html');await page.evaluate(token=>{localStorage.setItem('trackscore_token',token);localStorage.setItem('trackscore_user_role','manager');localStorage.setItem('trackscore_user','{}');},jwt.sign({role:'manager',name:'Production QA Manager'},secret,{expiresIn:'1h'}));requests.clear();await page.goto(prod.base+'/react/manager.html');await page.locator('.ts-metrics').waitFor();await settled();assert.equal(await page.locator('.ts-metric').count(),8);const mount=await proveReactActive('production');return {productionOverview:'Mocked real backend summarizer; Atlas not exercised',reactMounted:mount.reactContainer&&mount.reactChild,bundleSha256:mount.bundleSha256,apiInitiator:mount.overviewRequest.frames[0].path};});
  await check('Complete run has no unexpected console or HTTP errors',async()=>{assert.equal(errors.filter(e=>!e.expected).length,0);assert.equal(http.filter(e=>!e.expected).length,0);return {unexpectedConsole:0,unexpectedHTTP:0,intentionalFailureCases:new Set(errors.filter(e=>e.expected).map(e=>e.test)).size};});
}finally{
  fs.writeFileSync(path.join(qa,'results.json'),JSON.stringify({generatedAt:new Date().toISOString(),results,errors,http,streams},null,2));
  if(browser)await browser.close();for(const child of children)if(child.exitCode===null)child.kill('SIGTERM');for(const fd of logs)fs.closeSync(fd);console.log('Evidence: '+qa);
}
if(results.some(r=>r.status!=='VERIFIED WORKING'))process.exitCode=1;
