from __future__ import annotations

import secrets
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from med_data_cleaner.deid.models import ManualFinding, PipelineInputError
from med_data_cleaner.deid.pipeline import MAX_TEXT_LENGTH, DeidentificationPipeline
from med_data_cleaner.deid.policy import ALLOWED_MANUAL_ENTITY_TYPES, POLICY_ID

STATIC_DIR = Path(__file__).resolve().parent / "static"


class ManualFindingRequest(BaseModel):
    start: int = Field(ge=0)
    end: int = Field(gt=0)
    entity_type: str = Field(min_length=1, max_length=64)


class ProcessRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT_LENGTH)
    excluded_finding_ids: list[str] = Field(default_factory=list, max_length=2_000)
    manual_findings: list[ManualFindingRequest] = Field(default_factory=list, max_length=1_000)


class ExportRequest(ProcessRequest):
    review_confirmed: bool = False


def _process(pipeline: DeidentificationPipeline, payload: ProcessRequest):
    return pipeline.deidentify(
        payload.text,
        excluded_finding_ids=payload.excluded_finding_ids,
        manual_findings=(
            ManualFinding(
                start=finding.start,
                end=finding.end,
                entity_type=finding.entity_type,
            )
            for finding in payload.manual_findings
        ),
    )


def _serialize_result(result) -> dict:
    return {
        "cleaned_text": result.cleaned_text,
        "findings": [
            {
                "finding_id": finding.finding_id,
                "start": finding.start,
                "end": finding.end,
                "entity_type": finding.entity_type,
                "score": round(finding.score, 4),
                "recognizers": list(finding.recognizers),
                "selected": finding.selected,
                "source": finding.source,
            }
            for finding in result.findings
        ],
        "residual_findings": [
            {
                "finding_id": finding.finding_id,
                "start": finding.start,
                "end": finding.end,
                "entity_type": finding.entity_type,
                "score": round(finding.score, 4),
                "recognizers": list(finding.recognizers),
                "selected": finding.selected,
                "source": finding.source,
            }
            for finding in result.residual_findings
        ],
        "detector_statuses": [
            {
                "name": status.name,
                "ready": status.ready,
                "required": status.required,
                "detail": status.detail,
            }
            for status in result.detector_statuses
        ],
        "policy_id": result.policy_id,
        "applied_count": result.applied_count,
        "export_allowed": result.export_allowed,
        "export_block_reasons": list(result.export_block_reasons),
        "manual_entity_types": list(ALLOWED_MANUAL_ENTITY_TYPES),
    }


def create_app(
    pipeline: DeidentificationPipeline | None = None,
    *,
    api_token: str | None = None,
) -> FastAPI:
    app = FastAPI(
        title="Med Data Cleaner",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.pipeline = pipeline or DeidentificationPipeline()
    app.state.api_token = api_token or secrets.token_urlsafe(32)

    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["127.0.0.1", "localhost", "testserver"],
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
        )
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; "
            "form-action 'self'; connect-src 'self'; img-src 'self' data:; "
            "script-src 'self'; style-src 'self'"
        )
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_request: Request, _error: RequestValidationError):
        # FastAPI's default response can echo invalid input. Never put request values in an error.
        return JSONResponse(status_code=422, content={"detail": "Invalid request data."})

    @app.exception_handler(PipelineInputError)
    async def pipeline_error_handler(_request: Request, _error: PipelineInputError):
        return JSONResponse(status_code=422, content={"detail": "Invalid text or review data."})

    def require_token(
        request: Request,
        supplied_token: Annotated[str | None, Header(alias="X-Med-Data-Cleaner-Token")] = None,
    ) -> None:
        expected_token = request.app.state.api_token
        if supplied_token is None or not secrets.compare_digest(supplied_token, expected_token):
            raise HTTPException(status_code=403, detail="Local session token required.")

    @app.get("/", response_class=HTMLResponse)
    async def index(request: Request) -> HTMLResponse:
        template = (STATIC_DIR / "index.html").read_text(encoding="utf-8")
        html = template.replace("__API_TOKEN__", request.app.state.api_token)
        return HTMLResponse(html)

    @app.get("/api/status", dependencies=[Depends(require_token)])
    async def status(request: Request) -> dict:
        local_pipeline: DeidentificationPipeline = request.app.state.pipeline
        return {
            "engine_ready": local_pipeline.engine_ready,
            "policy_id": POLICY_ID,
            "max_text_length": local_pipeline.max_text_length,
            "detector_statuses": [
                {
                    "name": detector_status.name,
                    "ready": detector_status.ready,
                    "required": detector_status.required,
                    "detail": detector_status.detail,
                }
                for detector_status in local_pipeline.detector_statuses
            ],
        }

    @app.post("/api/deidentify", dependencies=[Depends(require_token)])
    async def deidentify(payload: ProcessRequest, request: Request) -> dict:
        result = _process(request.app.state.pipeline, payload)
        return _serialize_result(result)

    @app.post("/api/export", dependencies=[Depends(require_token)])
    async def export(payload: ExportRequest, request: Request) -> Response:
        if not payload.review_confirmed:
            raise HTTPException(status_code=409, detail="Human review confirmation is required.")

        result = _process(request.app.state.pipeline, payload)
        if not result.export_allowed:
            raise HTTPException(
                status_code=409,
                detail="Export is blocked until all local safety checks pass.",
            )

        return Response(
            content=result.cleaned_text,
            media_type="text/plain; charset=utf-8",
            headers={
                "Content-Disposition": 'attachment; filename="deidentified.txt"',
                "X-Deidentification-Policy": result.policy_id,
            },
        )

    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    return app


app = create_app()
