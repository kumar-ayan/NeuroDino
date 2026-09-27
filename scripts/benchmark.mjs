import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {benchmark} from '../src/lib/benchmark.ts';
import {validModel} from '../src/lib/policy.ts';
const raw=readFileSync('public/benchmarks/model.json','utf8'),model=JSON.parse(raw);
if(!validModel(model))throw new Error('Invalid model');
const report={...benchmark(model),modelSha256:createHash('sha256').update(raw).digest('hex')};
writeFileSync('public/benchmarks/benchmark.json',JSON.stringify(report,null,2));
console.table(report.results.map(({runs,...result})=>result));
