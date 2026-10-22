import fs from 'node:fs';import vm from 'node:vm';
const p=process.argv[2],s=fs.readFileSync(p,'utf8');const body=s.match(/function clockStr\(t\) \{[\s\S]*?\n\}/)[0];const f=vm.runInNewContext(body+';clockStr',{GLEN:2880,QLEN:720});
let bad=0;for(let t=0;t<=3600;t+=.1){if(/:60$/.test(f(t).cl))bad++;}console.log(JSON.stringify({file:p,at240_1:f(240.1),invalidClockSamples:bad}));process.exitCode=bad?1:0;
