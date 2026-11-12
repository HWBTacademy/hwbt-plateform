import type { Config, Context } from '@netlify/functions';
import { dataStore, errorResponse, json, requireSession } from './_lib/security.mts';
import { brusselsMorning } from './_lib/marketing-schedule.mts';
export default async (req:Request,_context:Context) => {
  try {
    requireSession(req,['coach']);
    const {date}=brusselsMorning(new Date());
    const briefing=await dataStore().get(`marketing/briefings/${date}.json`,{type:'json',consistency:'strong'});
    return json({date,briefing:briefing||null});
  } catch(e){return errorResponse(e);}
};
export const config:Config={path:'/api/marketing-briefing',method:['GET']};
