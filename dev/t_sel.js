const {Browser,URL}=require('./cdp.js');
(async()=>{ const b=new Browser({}); await b.launch(); await b.goto(URL); await b.wait(500);
  const bg=sel=>b.eval(`getComputedStyle(document.querySelector(${JSON.stringify(sel)})).backgroundColor`);
  console.log('default selected:', await b.eval(`document.querySelector('.ailvl.selected').textContent`), 'bg', await bg('.ailvl.selected'), '| unselected bg', await bg('.ailvl:not(.selected)'));
  await b.click('.ailvl[data-level="hunter"]'); await b.wait(100); console.log('after click:', await b.eval(`[...document.querySelectorAll('.ailvl')].map(x=>x.textContent.split(' ')[0]+(x.classList.contains('selected')?'*':'')).join(' ')`), 'hunter bg', await bg('.ailvl[data-level="hunter"]'));
  await b.shot(__dirname+'/v_home_sel.png'); console.log('ERRORS:', b.errors.length?b.errors:'none'); b.close(); })();
