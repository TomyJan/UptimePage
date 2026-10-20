import { readFile,mkdir,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseConfig,splitConfig } from '../config/schema.ts';
function canonical(value:unknown):string {
 if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
 if(value!==null&&typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
 return JSON.stringify(value);
}
const config=parseConfig(JSON.parse(await readFile(process.env.UPTIMEPAGE_CONFIG||'config/site.json','utf8')));
const version=createHash('sha256').update(canonical(config)).digest('hex');
const {publicConfig,serverConfig}=splitConfig(config,version);
await mkdir('.generated',{recursive:true});
for(const [name,data] of [['public',publicConfig],['server',serverConfig]] as const){
 await writeFile(`.generated/${name}-config.ts`,`// Generated; do not edit.\nexport default ${JSON.stringify(data,null,2)};\n`);
}
console.log(`Configuration generated (${version.slice(0,8)})`);
