import { spawn } from 'node:child_process';
const processHandle=spawn(process.execPath,['node_modules/vite/bin/vite.js'],{stdio:'inherit',env:{...process.env,VITE_DEMO:'true'}});
processHandle.on('exit',code=>process.exit(code??1));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>processHandle.kill(signal));
