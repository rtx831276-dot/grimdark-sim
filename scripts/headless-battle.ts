/**
 * Banc d'essai headless : déroule une bataille complète sans navigateur et imprime
 * un compte rendu. C'est la preuve vivante que la simulation est indépendante du rendu,
 * et l'outil de travail pour équilibrer sans lancer le jeu.
 *
 *   npm run headless                    # graine 12345, 5 minutes de jeu
 *   npm run headless -- 777 600         # graine 777, 10 minutes
 */
import { createSimulation, hashState, stepSimulation, summarize, TICKS_PER_SECOND } from '../src/sim';
import { factionDef } from '../src/data/factions';
import { unitDef } from '../src/data/units';

const seed = Number(process.argv[2] ?? 12345);
const seconds = Number(process.argv[3] ?? 300);

const state = createSimulation({ seed });
const totalTicks = Math.round(seconds * TICKS_PER_SECOND);
const started = performance.now();

console.log(`=== ${state.map.def.name} ===`);
console.log(state.map.def.briefing);
console.log(`graine=${seed} — ${state.units.length} unités engagées\n`);

let lastReport = 0;
for (let i = 0; i < totalTicks && !state.over; i++) {
  const events = stepSimulation(state);

  for (const event of events) {
    switch (event.type) {
      case 'kill': {
        const victim = state.units[event.unitId! - 1];
        const label = victim ? unitDef(victim.defId).label : 'inconnu';
        console.log(`  [${(state.elapsed / 60).toFixed(1)}min] MORT  ${label} (${factionDef(event.faction ?? '').shortName})`);
        break;
      }
      case 'terrainDestroyed': {
        console.log(`  [${(state.elapsed / 60).toFixed(1)}min] RUINE ${event.label} en (${Math.round(event.x ?? 0)},${Math.round(event.y ?? 0)})`);
        break;
      }
      case 'objectiveCaptured': {
        const who = event.faction ? factionDef(event.faction).shortName : 'personne';
        console.log(`  [${(state.elapsed / 60).toFixed(1)}min] OBJECTIF ${event.label} -> ${who}`);
        break;
      }
      case 'artilleryRequested': {
        console.log(`  [${(state.elapsed / 60).toFixed(1)}min] BARRAGE ${factionDef(event.faction ?? '').shortName} sur (${Math.round(event.x ?? 0)},${Math.round(event.y ?? 0)})`);
        break;
      }
      case 'gameOver': {
        console.log(`\n>>> FIN: ${event.label}`);
        break;
      }
      default:
        break;
    }
  }

  if (state.elapsed - lastReport >= 60) {
    lastReport = state.elapsed;
    console.log(`[${(state.elapsed / 60).toFixed(0)}min] ${summarize(state).split('\n')[0]}`);
  }
}

const duration = performance.now() - started;
console.log('\n=== RAPPORT ===');
console.log(summarize(state));
console.log(`\n${state.tick} ticks simulés en ${duration.toFixed(0)} ms (${(state.tick / duration * 1000).toFixed(0)} ticks/s)`);
console.log(`empreinte d'état: ${hashState(state)}`);
if (!state.over) console.log('(la bataille n\'est pas allée à son terme : augmente la durée ou la létalité)');
