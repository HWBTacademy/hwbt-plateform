import type { Config, Context } from '@netlify/functions';
import { STATE_KEY, dataStore } from './_lib/security.mts';
import { runAgent, selectActivities } from './_lib/marketing-agent.mts';
import { brusselsMorning } from './_lib/marketing-schedule.mts';

// Disabled until explicitly configured. Runs only on published deploys.
export default async (_req:Request, _context:Context) => {
  const {date,isMorning}=brusselsMorning(new Date());
  if(process.env.HWBT_AUTOBRIEF_ENABLED !== 'true' || !isMorning) return;
  const key=process.env.OPENAI_API_KEY || '', model=process.env.HWBT_MARKETING_MODEL || '';
  if(!key || !model) { console.error('Morning briefing: agent not configured'); return; }
  const store=dataStore(), resultKey=`marketing/briefings/${date}.json`, lockKey=`marketing/locks/${date}.json`;
  if(await store.get(resultKey,{type:'json',consistency:'strong'})) return;
  // Conditional write prevents duplicate invocations from generating twice.
  const lock=await store.setJSON(lockKey,{date,createdAt:new Date().toISOString()},{onlyIfNew:true});
  if(!lock.modified) return;
  try {
    const state=await store.get(STATE_KEY,{type:'json',consistency:'strong'});
    if(!state) throw new Error('agenda unavailable');
    const activities=selectActivities(state,date);
    const proposal=await runAgent({mode:'brief',request:'Prépare le briefing marketing du jour et les prises de vue à prévoir à partir de l’agenda.',draft:'',activities,apiKey:key,model,timeoutMs:22000});
    await store.setJSON(resultKey,{date,createdAt:new Date().toISOString(),activityCount:activities.length,proposal,status:'draft'},{onlyIfNew:true});
  } catch { await store.delete(lockKey); console.error('Morning briefing generation failed'); }
};
export const config:Config={schedule:'0 6,7 * * *'};
