import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectActivities, runAgent } from '../netlify/functions/_lib/marketing-agent.mts';

test('agenda includes only upcoming valid events and excludes player data', () => {
  const activities = selectActivities({players:[{name:'Private Player'}], sessions:[{date:'2026-11-01',time:'16:30',location:'Argayon',goal:'Volées',playerIds:[7]},{date:'2026-10-01'},{date:'2026-11-02',status:'cancelled'}],matches:[{date:'2026-11-03',agendaPlanned:true,title:'Private name',club:'Nivelles'},{date:'2026-11-04',status:'FINI'}]},'2026-10-27');
  assert.equal(activities.length,2); assert.equal(activities[0].type,'séance'); assert.equal(activities[1].type,'match');
  assert.doesNotMatch(JSON.stringify(activities),/Private|playerIds/);
});

test('agent sends revision to model and extracts structured proposal without storing data', async () => {
  let sent;
  const proposal={title:'Story',briefing:'Une idée',format:'Story',hook:'Accroche',overlay:'Texte',edit_plan:'Montage',call_to_action:'Suivre',measure:'Partages',caption:'Bonjour',shots:['Filmer'],missing_information:[],approval_note:'À valider'};
  const fetcher=async (url,opts)=>{assert.equal(url,'https://api.openai.com/v1/responses');sent=JSON.parse(opts.body);return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(proposal)}]}]}),{status:200});};
  const result=await runAgent({mode:'revise',request:'Plus court',draft:'Ancien texte',activities:[],apiKey:'test',model:'test-model',fetcher});
  assert.deepEqual(result,proposal);assert.equal(sent.store,false); assert.match(sent.input,/Plus court/);assert.match(sent.input,/Ancien texte/);
});

test('refusal and incomplete responses are not returned as drafts', async () => {
  const fetcher=async()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'non'}]}]}));
  await assert.rejects(runAgent({mode:'brief',request:'',draft:'',activities:[],apiKey:'test',model:'test',fetcher}),/AGENT_REFUSED/);
});

test('selection returns only the chosen activity and excludes free text goal', () => {
  const state={sessions:[{id:1,date:'2026-11-01',goal:'Private player note'},{id:2,date:'2026-11-01',goal:'secret'}],matches:[]};
  const result=selectActivities(state,'2026-10-27',{type:'session',id:'2'});
  assert.equal(result.length,1); assert.equal(result[0].subject,''); assert.doesNotMatch(JSON.stringify(result),/secret|Private/);
  assert.deepEqual(selectActivities(state,'2026-10-27',{type:'match',id:'2'}),[]);
});
