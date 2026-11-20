import {spawn} from "node:child_process";
const mode=process.argv[2];
if(!["start","dev"].includes(mode))throw new Error("Expected start or dev");
// This convenience launcher always binds loopback. Network access must use an explicitly configured HTTPS origin.
const child=spawn(process.execPath,["node_modules/next/dist/bin/next",mode,"--hostname","127.0.0.1",...process.argv.slice(3)],{
  stdio:"inherit",env:{...process.env,SEPSIS_DEMO_ACCOUNTS:process.env.SEPSIS_PUBLIC_ORIGIN?"0":"1"},windowsHide:true,
});
child.on("exit",code=>process.exit(code??1));
for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>child.kill(signal));
