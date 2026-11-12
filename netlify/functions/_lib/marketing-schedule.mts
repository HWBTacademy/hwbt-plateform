/** Netlify schedules are UTC. Only 08:00 in Brussels creates a briefing. */
export function brusselsMorning(now: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const part = (name:string) => parts.find(x => x.type === name)?.value || '';
  return {date:`${part('year')}-${part('month')}-${part('day')}`, isMorning:part('hour')==='08'};
}
