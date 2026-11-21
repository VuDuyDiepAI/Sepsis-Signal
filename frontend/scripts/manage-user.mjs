import {DatabaseSync} from "node:sqlite";
import {randomBytes,randomUUID,scryptSync} from "node:crypto";
import path from "node:path";
import {existsSync} from "node:fs";
const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1];
const username=args.includes("--username")?value("--username").trim().toLowerCase():"";
const role=args.includes("--role")?value("--role"):"doctor";
const displayName=args.includes("--name")?value("--name"):username;
const disable=args.includes("--disable"),password=process.env.SEPSIS_USER_PASSWORD;
if(!/^[a-z0-9._-]{3,80}$/.test(username)||!["admin","doctor","viewer"].includes(role)||!displayName||displayName.length>80)
  throw new Error("Use --username <name> --name <display name> --role admin|doctor|viewer [--disable]");
if(!disable&&(!password||password.length<12||password.length>200))
  throw new Error("Set SEPSIS_USER_PASSWORD to a private password of 12–200 characters");
const filename=process.env.SEPSIS_WEB_DB??path.resolve("../data/frontend_clinical.sqlite3");
if(!existsSync(filename))throw new Error("Database does not exist; start the updated web app once first");
const db=new DatabaseSync(filename,{open:false});
try {
  db.open();db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
  if(Number(db.prepare("PRAGMA user_version").get()?.user_version)!==2)throw new Error("Start the updated web app once to migrate this database before managing users");
  db.exec("BEGIN IMMEDIATE");
  try {
    if(disable){
      const row=db.prepare("SELECT id FROM auth_users WHERE username=?").get(username);
      if(!row)throw new Error("Account does not exist");
      db.prepare("UPDATE auth_users SET disabled=1 WHERE id=?").run(row.id);
    } else {
      const salt=randomBytes(16).toString("hex"),hash=`scrypt$${salt}$${scryptSync(password,salt,64).toString("hex")}`;
      db.prepare(`INSERT INTO auth_users VALUES(?,?,?,?,?,0,0) ON CONFLICT(username) DO UPDATE SET
        display_name=excluded.display_name,password_hash=excluded.password_hash,role=excluded.role,is_demo=0,disabled=0`)
        .run(randomUUID(),username,displayName,hash,role);
    }
    db.prepare("DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM auth_users WHERE username=?)").run(username);
    db.prepare("DELETE FROM auth_attempts WHERE username=?").run(username);
    db.exec("COMMIT");
  } catch(error){db.exec("ROLLBACK");throw error;}
  console.log(`${disable?"Disabled":"Saved"} account: ${username}. Previous sessions revoked.`);
} finally {try{db.close();}catch{}}
