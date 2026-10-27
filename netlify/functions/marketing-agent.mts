import type { Config, Context } from '@netlify/functions';
import { STATE_KEY, dataStore, json, errorResponse, readJson, requireCsrf, requireSession } from './_lib/security.mts';
import { runAgent, selectActivities, type AgentMode } from './_lib/marketing-agent.mts';

export default async (req: Request, _context: Context) => {
  try {
    const session = requireSession(req, ['coach']);
    requireCsrf(req, session);
    const body = await readJson<{mode?:unknown; request?:unknown; draft?:unknown; activity?:{type?:unknown; id?:unknown}}>(req, 16000);
    if (!['brief','draft','revise'].includes(String(body.mode))) return json({error:'Mode invalide'}, {status:400});
    if (body.request != null && typeof body.request !== 'string' || body.draft != null && typeof body.draft !== 'string') return json({error:'Contenu invalide'}, {status:400});
    if (String(body.request || '').length > 3000 || String(body.draft || '').length > 6000) return json({error:'Contenu trop long'}, {status:400});
    const apiKey = process.env.OPENAI_API_KEY || '';
    const model = process.env.HWBT_MARKETING_MODEL || '';
    if (!apiKey || !model) return json({error:'Agent IA non configuré : clé serveur ou modèle manquant.'}, {status:503});
    const state = await dataStore().get(STATE_KEY, {type:'json'});
    if (!state) return json({error:'Agenda indisponible.'}, {status:503});
    const date = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    let selection: {type:string; id:string} | undefined;
    if (body.activity != null) {
      if (typeof body.activity !== 'object' || !['session','match'].includes(String(body.activity.type)) || !['string','number'].includes(typeof body.activity.id) || String(body.activity.id).length > 100) return json({error:'Activité invalide'}, {status:400});
      selection={type:String(body.activity.type),id:String(body.activity.id)};
    }
    const activities=selectActivities(state,date,selection);
    if (selection && !activities.length) return json({error:'Activité introuvable dans l’agenda enregistré. Enregistre et réessaie.'}, {status:404});
    try {
      const proposal = await runAgent({mode:body.mode as AgentMode,request:String(body.request||''),draft:String(body.draft||''),activities,apiKey,model});
      return json({proposal, agenda_as_of:date, activity_count:activities.length, status:'draft'});
    } catch {
      return json({error:'La génération IA a échoué. Réessaie plus tard ; aucun contenu n’a été publié.'}, {status:502});
    }
  } catch (error) { return errorResponse(error); }
};
export const config: Config = {path:'/api/marketing-agent',method:['POST']};
