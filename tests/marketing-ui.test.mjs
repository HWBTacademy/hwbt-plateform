import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const code=html.slice(html.indexOf('function marketingStore(){'),html.indexOf('function generateAIBrief(context={})'));
function setup(api){
  const fields={caption:{value:'Texte actuel'},shots:{value:'Plan'},feedback:{value:'Plus court'},status:{value:'Validé'}};
  const STATE={role:'coach',players:[],sessions:[{id:7,date:'2099-11-01',time:'18:00',location:'Argayon',status:'planned'}],matches:[],contentStudio:{posts:[],ideas:[],marketing:{drafts:[]}}};
  const context={STATE,Intl,Date,Math,JSON,document:{getElementById(id){if(id==='marketing-progress')return {textContent:''};return {querySelector(selector){return fields[selector.match(/"([^"]+)"/)[1]]}}}},sessionTitle:()=> 'Joueur',matchClubLabel:()=>'',agendaMatchPlayers:()=>[],matchAgendaActivityLabel:()=>'',esc:x=>String(x??''),apiJson:api,saveState:()=>{},render:()=>{},showNotif:()=>{}};
  vm.createContext(context);vm.runInContext(code,context);return {context,STATE,fields};
}
test('creation puis revision gardent la proposition initiale et repartent en brouillon', async()=>{
 const calls=[];const api=async(_url,opts)=>{calls.push(JSON.parse(opts.body));return {agenda_as_of:'2099-11-01',proposal:{title:'Story',caption:'Texte généré',shots:['Filmer'],briefing:'Brief',format:'Story',hook:'Accroche',overlay:'Texte',edit_plan:'Montage',call_to_action:'Suivre',measure:'Partages',missing_information:[],approval_note:'Valider'}}};
 const {context,STATE}=setup(api); await context.marketingGenerate('draft',0); assert.equal(STATE.contentStudio.marketing.drafts.length,1); assert.equal(calls[0].activity.id,'7');
 await context.marketingGenerate('revise',0);assert.equal(STATE.contentStudio.marketing.drafts.length,2);assert.equal(calls[1].request,'Plus court');assert.equal(calls[1].draft,'Texte actuel');assert.equal(STATE.contentStudio.marketing.drafts[0].status,'À préparer');
});
test('une erreur de génération ne crée pas de proposition',async()=>{const {context,STATE}=setup(async()=>{throw Error('indisponible')});await context.marketingGenerate('draft',0);assert.equal(STATE.contentStudio.marketing.drafts.length,0)});
