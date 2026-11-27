import argparse
import os
from sqlalchemy import select, update, delete
from backend.app.config import Settings
from backend.app.db.store import Store
from backend.app.db import tables as t
from backend.app.auth import Auth


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--username',required=True)
    parser.add_argument('--name',default='')
    parser.add_argument('--role',choices=['doctor','admin','viewer'],default='doctor')
    parser.add_argument('--disable',action='store_true')
    args=parser.parse_args()
    store=Store(Settings.from_env())
    try:
        if args.disable:
            with store.transaction() as c:
                user_id=c.execute(select(t.users.c.id).where(t.users.c.username==args.username.strip().lower())).scalar_one()
                c.execute(update(t.users).where(t.users.c.id==user_id).values(disabled=1))
                c.execute(delete(t.sessions).where(t.sessions.c.user_id==user_id))
        else:
            Auth(store).provision(args.username,os.environ['SEPSIS_USER_PASSWORD'],args.name,args.role,replace=True)
        print('Account updated; previous sessions revoked when applicable.')
    finally:
        store.close()


if __name__=='__main__':
    main()
