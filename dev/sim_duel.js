// Head-to-head benchmark: the engine (guest) against scripted "human" styles (host).
const U=require('./run-tests.js'); const {Rules,AI,RNG}=U;
function human(g,rng,style,mem){
  if(style.evade){ const f=g.players.host.fleet; for(let i=0;i<5;i++){ const s=f[i]; if(s.sunk||s.crippled||Rules.hitCount(s)===0) continue; const o=['advance','reverse'].filter(t=>Rules.canMove(f,i,t).ok); if(o.length){ const r=Rules.maneuver(g,'host',i,o[rng.int(o.length)]); if(r.ok){ g=r.game; break; } } } }
  if(style.weapons){ const n=g.players.host.shots.length; if(n===6){ const r=Rules.airstrike(g,'host',{cells:Rules.lineCells({x:rng.int(8),y:rng.int(10)},true)}); if(r.ok) return r.game; } if(n===12){ const r=Rules.fireMG(g,'host',{shipIdx:1,cells:[{x:1,y:1},{x:2,y:1},{x:7,y:7},{x:8,y:7}]}); if(r.ok) return r.game; } }
  const c=AI.hunterShot(g.players.host.shots,mem,rng); const r=Rules.fire(g,'host',c); return r.ok?r.game:g;
}
function duel(seed,level,style){ let g=Rules.createGame({room:'D',mode:'ai',aiLevel:level,seed}); const rng=RNG(seed); g=Rules.setFleet(g,'host',Rules.randomFleet(rng)).game; g=Rules.setFleet(g,'guest',AI.placeFleet(rng)).game; g=Rules.startBattle(g,seed%2?'host':'guest'); g.ai=AI.initMemory(level); const hm=AI.initMemory('hunter'); let guard=0;
  while(!g.winner&&guard++<600){ if(g.current==='guest'){ const t=AI.takeTurn(g,'guest',rng); g=t.game; } else g=human(g,rng,style,hm); }
  return {w:g.winner, turns:g.turn, aiShots:g.players.guest.shots.length}; }
const N=parseInt(process.argv[2]||'40',10); const t0=Date.now();
for(const level of ['hunter','admiral','fleet']) for(const [name,style] of [['static hunter-human',{}],['evasive human',{evade:true}],['evasive + weapons',{evade:true,weapons:true}]]){ const rs=[]; for(let s=1;s<=N;s++) rs.push(duel(s,level,style)); const wins=rs.filter(r=>r.w==='guest').length; const done=rs.filter(r=>r.w); console.log(level.padEnd(8), name.padEnd(22), 'AI wins', (wins+'/'+N).padEnd(6), 'avg turns', Math.round(done.reduce((a,r)=>a+r.turns,0)/Math.max(1,done.length)), 'unfinished', N-done.length); }
console.log('ms per game ~', Math.round((Date.now()-t0)/(N*9)));
