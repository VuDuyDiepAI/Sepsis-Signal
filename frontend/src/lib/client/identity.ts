// Displayed identity is only a write precondition. The server cookie remains authoritative.
let actorId="";
export const currentActor=()=>actorId;
export const setCurrentActor=(value:string)=>{actorId=value;};
