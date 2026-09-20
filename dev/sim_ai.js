// Reproduce: Fleet Admiral vs a player who never moves. Log every AI action and count distinct target cells.
const U=require('./run-tests.js'); const {Rules,AI,RNG}=U; const name=c=>'ABCDEFGHIJ'[c.x]+(c.y+1);
function sim(seed, level, tpl, humanUsesWeapons){
  let g=Rules.createGame({room:'SIM',mode:'ai',aiLevel:level,seed}); const rng=RNG(seed);
  g=Rules.setFleet(g,'host',Rules.templateFleet(tpl)).game; g=Rules.setFleet(g,'guest',AI.placeFleet(rng)).game; g=Rules.startBattle(g,'host'); g.ai=AI.initMemory(level);
  const seq=[]; let guard=0, hturn=0;
  while(!g.winner&&guard++<400){
    if(g.current==='guest'){ const t=AI.takeTurn(g,'guest',rng); g=t.game; const a=t.action; if(t.rotated) seq.push('rot'); else if(a){ if(a.weapon==='shell') seq.push(name(a.shot.cell)+':'+a.shot.result[0]); else if(a.cells) seq.push(a.weapon+'['+a.cells.map(name).join(' ')+']'); else if(a.lane) seq.push('torp:'+a.shot.result[0]); else if(a.cell) seq.push('mine@'+name(a.cell)); else seq.push(a.weapon); } }
    else { hturn++; let r;
      if(humanUsesWeapons&&hturn===3) r=Rules.airstrike(g,'host',{cells:Rules.lineCells({x:0,y:0},true)});
      else if(humanUsesWeapons&&hturn===5) r=Rules.fireMG(g,'host',{shipIdx:1,cells:[{x:9,y:9},{x:8,y:9},{x:7,y:9},{x:6,y:9}]});
      else r=Rules.fire(g,'host',{x:rng.int(10),y:rng.int(10)});
      g=r.ok?r.game:Rules.fire(g,'host',{x:0,y:0}).game; }
  }
  const shells=seq.filter(x=>/^[A-J]\d+:/.test(x)); const cells=new Set(shells.map(x=>x.split(':')[0]));
  return {winner:g.winner, turns:g.turn, aiActions:seq.length, shells:shells.length, distinct:cells.size, seq};
}
const r=sim(7,'fleet','spread',true); console.log('fleet vs static spread fleet:', JSON.stringify({winner:r.winner,turns:r.turns,aiActions:r.aiActions,shells:r.shells,distinctCells:r.distinct}));
console.log(r.seq.slice(0,70).join('  '));
if(require.main===module){ const rows=[]; for(const lvl of ['hunter','admiral','fleet']) for(const tpl of ['spread','cluster','perimeter']){ const rs=[1,2,3,4,5,6].map(s=>sim(s,lvl,tpl,true)); rows.push(lvl+' / '+tpl+': AI wins '+rs.filter(x=>x.winner==='guest').length+'/6, avg AI actions '+Math.round(rs.reduce((a,x)=>a+x.aiActions,0)/6)+', avg distinct cells '+Math.round(rs.reduce((a,x)=>a+x.distinct,0)/6)); } console.log(rows.join('\n')); }
module.exports={sim};
