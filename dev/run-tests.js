// Node runner: extracts the pure sections (1-6, 13) from index.html and runs the self-test suite.
const fs=require('fs'); const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const js=html.match(/<script>\n([\s\S]*)<\/script>\s*<\/body>/)[1];
function section(n){ const re=new RegExp('(/\\* =+\\n\\s+SECTION '+n+' —[\\s\\S]*?)(?=/\\* =+\\n\\s+SECTION \\d+ —|/\\* =+\\n\\s+NAMESPACE EXPORT)'); const m=js.match(re); if(!m) throw new Error('section '+n+' not found'); return m[1]; }
const head=js.slice(0, js.indexOf('/* ============================================================\n   SECTION 1'));
let src=head+[1,2,3,4,5,6,13].map(section).join('\n')+'\nreturn {Rules,AI,Net,Store,Tests,RNG,NAVIES,SHIP_CLASSES,CLASS_ORDER,RESULT,WEAPONS:typeof WEAPONS!=="undefined"?WEAPONS:null};\n})();\nmodule.exports=Underway;\n';
src=src.replace("'use strict';\nconst Underway","'use strict';\nconst Underway"); // keep as-is
const out=path.join(__dirname,'_pure_bundle.js'); fs.writeFileSync(out,src);
const U=require(out);
if(require.main===module){ const r=U.Tests.run(); let fails=0; r.forEach(x=>{ if(!x.pass) fails++; console.log((x.pass?'PASS':'FAIL')+'  '+x.name+(x.pass?'':'  -> '+x.msg)); }); console.log(r.length+' cases, '+fails+' failed'); process.exitCode=fails?1:0; }
module.exports=U;
