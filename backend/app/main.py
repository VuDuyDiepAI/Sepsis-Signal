from contextlib import asynccontextmanager
from collections import defaultdict, deque
import asyncio
import hmac
import threading
import time
from typing import Annotated

from fastapi import FastAPI, Request, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError
from sqlalchemy import select, func
from starlette.concurrency import run_in_threadpool

from backend.app.config import Settings, REPO
from backend.app.db.store import Store, ClinicalError
from backend.app.db import tables as t
from backend.app.auth import Auth, COOKIE, DEMO, SESSION_SECONDS
from backend.app.schemas import Profile, SaveInput, Revision, ReviewInput, Login, ScoreInput
from backend.app.emr import EMREvent, ingest
from backend.app.scoring import predict


def response(value, status=200):
    return JSONResponse(value,status_code=status,headers={'Cache-Control':'no-store'})


def create_app(settings=None, store=None):
    settings = settings or Settings.from_env()
    database = store or Store(settings)
    auth = Auth(database)
    arrivals = defaultdict(deque)
    direct_slots = asyncio.Semaphore(2)

    @asynccontextmanager
    async def lifespan(app):
        stop, worker = threading.Event(), None
        if settings.embedded_worker:
            from backend.worker import run
            worker = threading.Thread(target=run,args=(database,stop),daemon=True,name='sepsis-worker')
            worker.start()
        yield
        stop.set()
        if worker:
            await run_in_threadpool(worker.join,60)
        if store is None:
            database.close()

    app = FastAPI(title='Sepsis Signal API',version='2.0.0',lifespan=lifespan,
                  docs_url=None if settings.public_origin else '/docs',redoc_url=None)
    app.state.store, app.state.auth = database, auth

    @app.exception_handler(ClinicalError)
    async def clinical_error(_request, exc):
        return response({'error':str(exc)},exc.status)

    @app.exception_handler(RequestValidationError)
    async def invalid_input(_request, _exc):
        return response({'error':'Dữ liệu gửi lên không hợp lệ. Kiểm tra chỉ số, mã hồ sơ và thời gian.'},400)

    @app.middleware('http')
    async def boundary(request, call_next):
        if request.url.path.startswith('/api/'):
            host = request.headers.get('host','')
            allowed_hosts = {origin.split('://',1)[1] for origin in settings.origins}
            origin = request.headers.get('origin')
            if host not in allowed_hosts or origin and (origin not in settings.origins or origin.split('://',1)[1] != host) or request.headers.get('sec-fetch-site') == 'cross-site':
                return response({'error':'Nguồn yêu cầu không hợp lệ.'},403)
            bucket = 'login' if request.url.path == '/api/auth/login' else 'score' if request.url.path == '/api/manual-score' else 'api'
            key = (bucket,request.client.host if request.client else 'local')
            now = time.monotonic()
            while arrivals[key] and now-arrivals[key][0]>=60:
                arrivals[key].popleft()
            if len(arrivals[key]) >= ({'login':30,'score':20,'api':1200}[bucket]):
                return response({'error':'Đã đạt giới hạn yêu cầu. Vui lòng thử lại sau.'},429)
            arrivals[key].append(now)
            if request.method in ('POST','PUT','PATCH'):
                chunks, length = [], 0
                async for chunk in request.stream():
                    length += len(chunk)
                    if length > 200000:
                        return response({'error':'Dữ liệu vượt giới hạn.'},413)
                    chunks.append(chunk)
                request._body = b''.join(chunks)
        try:
            return await call_next(request)
        except Exception:
            return response({'error':'Dịch vụ tạm thời chưa sẵn sàng. Vui lòng thử lại.'},503)

    def user(request: Request):
        value = auth.session(request.cookies.get(COOKIE))
        if not value:
            raise ClinicalError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',401)
        if request.method not in ('GET','HEAD') and value['role']=='viewer':
            raise ClinicalError('Tài khoản chỉ có quyền xem dữ liệu.',403)
        displayed = request.headers.get('x-sepsis-user')
        if displayed and displayed != value['id']:
            raise ClinicalError('Tài khoản đã thay đổi ở tab khác. Tải lại trước khi ghi dữ liệu.')
        return value

    @app.get('/api/health')
    def health():
        with database.transaction() as c:
            c.execute(select(func.count()).select_from(t.versions)).scalar_one()
        return response({'status':'ok','database':database.engine.dialect.name})

    @app.get('/api/auth/session')
    def session(request: Request):
        return response({'user':auth.session(request.cookies.get(COOKIE)),
            'demoAccounts':DEMO if settings.demo_accounts else []})

    @app.post('/api/auth/login')
    def login(request: Request, value: Login):
        result = auth.login(value.username,value.password)
        out = response({'user':result['user']})
        out.set_cookie(COOKIE,result['token'],max_age=SESSION_SECONDS,httponly=True,samesite='strict',
                       secure=bool(settings.public_origin) or request.url.scheme=='https',path='/')
        return out

    @app.post('/api/auth/logout')
    def logout(request: Request):
        auth.logout(request.cookies.get(COOKIE))
        out = response({'ok':True})
        out.delete_cookie(COOKIE,path='/',httponly=True,samesite='strict',secure=bool(settings.public_origin))
        return out

    @app.get('/api/clinical-state')
    def clinical_state(_user=Depends(user)):
        return response(database.snapshot())

    @app.post('/api/cases')
    def create_case(value: Profile, _user=Depends(user)):
        database.create(value.model_dump())
        return response(database.snapshot(),201)

    @app.put('/api/cases/{case_id}/entries')
    def save_entry(case_id: str, value: SaveInput, actor=Depends(user)):
        try:
            saved = database.save_input(case_id,value.revision,value.entry.model_dump(),actor['id'])
        except ValueError as exc:
            raise ClinicalError(str(exc),400) from exc
        return response(database.snapshot(),202 if saved['attemptedHours'] else 200)

    @app.post('/api/cases/{case_id}/rescore')
    def rescore(case_id: str, value: Revision, _user=Depends(user)):
        database.request_rescore(case_id,value.revision)
        return response(database.snapshot(),202)

    @app.post('/api/reviews')
    def review(value: ReviewInput, actor=Depends(user)):
        database.record_review(value.model_dump(),actor)
        return response(database.snapshot())

    @app.post('/api/cases/import')
    async def import_case(request: Request, _user=Depends(user)):
        try:
            raw = await request.json()
            source = ScoreInput.model_validate(raw['input']).model_dump()
            reviews = validate_legacy(raw.get('reviews',[]))
        except (ValueError,KeyError,TypeError,ValidationError) as exc:
            raise ClinicalError('Dữ liệu chuyển từ phiên cũ không hợp lệ.',400) from exc
        await run_in_threadpool(database.import_case,raw | {'input':source})
        await run_in_threadpool(database.archive_reviews,reviews)
        return response(await run_in_threadpool(database.snapshot),202)

    @app.post('/api/reviews/import')
    async def import_reviews(request: Request, _user=Depends(user)):
        values = validate_legacy(await request.json())
        await run_in_threadpool(database.archive_reviews,values)
        return response(await run_in_threadpool(database.snapshot))

    @app.post('/api/manual-score')
    async def manual_score(value: ScoreInput, _user=Depends(user)):
        if direct_slots.locked():
            raise ClinicalError('Bộ chấm đang xử lý hồ sơ khác. Vui lòng thử lại.',429)
        async with direct_slots:
            try:
                return response(await run_in_threadpool(predict,value.model_dump()))
            except Exception as exc:
                raise ClinicalError('Bộ chấm chưa sẵn sàng. Vui lòng thử lại hoặc liên hệ quản trị hệ thống.',503) from exc

    @app.post('/api/emr/events')
    async def emr_event(request: Request, value: EMREvent):
        key = request.headers.get('authorization','').removeprefix('Bearer ')
        if not settings.emr_key or len(settings.emr_key)<32:
            raise ClinicalError('Chưa cấu hình nguồn EMR.',503)
        if not hmac.compare_digest(key,settings.emr_key):
            raise ClinicalError('Nguồn EMR chưa được xác thực.',401)
        return response(await run_in_threadpool(ingest,database,value),202)

    @app.get('/api/jobs/{job_id}')
    def job_status(job_id: str, _user=Depends(user)):
        with database.transaction() as c:
            row = c.execute(select(t.queue.c.id,t.queue.c.encounter_id,t.queue.c.revision,t.queue.c.status,
                t.queue.c.attempts,t.queue.c.error,t.queue.c.created_at,t.queue.c.finished_at).where(t.queue.c.id==job_id)).mappings().first()
            if not row:
                raise ClinicalError('Không tìm thấy job.',404)
            return response(dict(row))

    dist = REPO / 'frontend/dist'
    if (dist/'assets').exists():
        app.mount('/assets',StaticFiles(directory=dist/'assets'),name='assets')

    @app.get('/{path:path}')
    def spa(path: str):
        if path.startswith('api/'):
            return response({'error':'Không tìm thấy API.'},404)
        candidate = (dist/path).resolve()
        if candidate.is_relative_to(dist.resolve()) and candidate.is_file():
            return FileResponse(candidate)
        if (dist/'index.html').exists():
            return FileResponse(dist/'index.html',headers={'Cache-Control':'no-cache'})
        return response({'error':'Chưa có bản build giao diện. Chạy npm run build trong frontend.'},503)

    return app


def validate_legacy(values):
    from datetime import datetime, timezone
    if not isinstance(values,list) or len(values)>500:
        raise ClinicalError('Lịch sử chuyển đổi không hợp lệ.',400)
    result=[]
    for r in values:
        if not isinstance(r,dict) or not isinstance(r.get('predictionId'),str) or not 1<=len(r['predictionId'])<=200 or not isinstance(r.get('revision'),int) or r['revision']<1:
            raise ClinicalError('Lịch sử chuyển đổi không hợp lệ.',400)
        if not 2<=len(str(r.get('reviewer','')).strip())<=80 or len(str(r.get('note','')))>1000:
            raise ClinicalError('Lịch sử chuyển đổi không hợp lệ.',400)
        try:
            at=datetime.fromisoformat(r['timestamp'].replace('Z','+00:00'))
            if at.tzinfo is None or at>datetime.now(timezone.utc):
                raise ValueError()
        except (ValueError,KeyError,TypeError) as exc:
            raise ClinicalError('Thời điểm xem xét không hợp lệ.',400) from exc
        result.append(r | {'localOnly':True})
    return result
