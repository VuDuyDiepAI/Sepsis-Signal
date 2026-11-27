import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root=path.resolve("..");
const local=path.join(root,".venv",process.platform==="win32"?"Scripts/python.exe":"bin/python");
const python=process.env.SEPSIS_PYTHON??(existsSync(local)?local:process.platform==="win32"?"python":"python3");
const child=spawn(python,[path.join(root,"scripts/serve_api.py"),"--port","3000","--embedded-worker"],{
  cwd:root,stdio:"inherit",windowsHide:true,env:process.env,
});
for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>child.kill(signal));
child.on("exit",code=>process.exit(code??1));
