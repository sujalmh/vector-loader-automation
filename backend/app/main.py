# main.py
import os
import shutil
from typing import List

import uvicorn
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.services.process_file import process_pdf
from app.services.vector_ingestion import ingest_unstructured_file

from app.models.model_definition import QualityMetrics, AnalysisResult, FileProcessingResult, FileIngestionResult, IngestionResponse, DownloadResult, UrlListRequest, FileMetadata, DownloadSuccess, DownloadError, ProcessingResult

import asyncio
from pathlib import Path
from typing import List, Dict, Tuple, AsyncGenerator
from urllib.parse import urlparse, unquote
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl
from starlette.responses import StreamingResponse, FileResponse
import tempfile
import json
import aiofiles
import uuid
import base64

UPLOAD_DIRECTORY = Path("uploaded_files")
MARKDOWN_DIRECTORY = "markdown_output"

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan event handler for the application.
    This replaces the deprecated on_event("startup") and on_event("shutdown").
    """
    # --- Startup Event ---
    # Ensure the upload directory exists when the application starts.
    UPLOAD_DIRECTORY.mkdir(exist_ok=True)

    yield
    # --- Shutdown Event ---
    # Add any cleanup tasks here if needed.
    print("Application shutdown complete.")

# --- App Initialization ---
# Create a FastAPI app instance
app = FastAPI(
    title="File Ingestion API",
    description="An API to receive and store user-uploaded files.",
    lifespan=lifespan
)

origins = [
    "http://localhost",
    "http://localhost:3000",
    "http://34.41.241.77:8071",
    "http://localhost:8071",
    "http://0.0.0.0:3000",
    "http://100.104.12.231:8071"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- API Endpoints ---
@app.post("/upload-files/", summary="Upload and Store Files Asynchronously")
async def upload_and_store_files(files: List[UploadFile] = File(...)):
    """
    Handles file uploads asynchronously, saving them to the server with a unique ID.

    This endpoint generates a UUID for each file to prevent filename collisions
    and returns detailed metadata, including the unique ID, for each
    successfully stored file.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files were sent.")

    response_data = []

    for file in files:
        try:
            # 1. Generate a unique ID and secure filename
            file_id = str(uuid.uuid4())
            original_filename = file.filename or "unknown"
            # Get the file extension (e.g., ".pdf", ".jpg")
            suffix = Path(original_filename).suffix
            unique_filename = f"{file_id}{suffix}"
            file_path = UPLOAD_DIRECTORY / unique_filename

            # 2. Read and write the file content
            content = await file.read()
            async with aiofiles.open(file_path, "wb") as buffer:
                await buffer.write(content)

            # 3. Gather metadata, now including the unique ID
            response_data.append(
                {
                    "id": file_id, # <-- Add the unique ID here
                    "name": original_filename, # Keep the original name for display
                    "path": str(file_path.resolve()), # The new, unique server path
                    "size": len(content),
                    "type": file.content_type,
                }
            )

        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Could not save file: {file.filename}. Error: {e}",
            )
    print(response_data)
    return {
        "message": f"Successfully stored {len(response_data)} file(s).",
        "files": response_data,
    }


async def _process_saved_files(saved_files: List[Dict[str, str]]) -> AsyncGenerator[str, None]:
    """
    Generator that processes already-saved files and yields SSE events.
    Each element in saved_files = (file_id, file_path).
    """
    for file_info in saved_files:
        file_path = file_info["path"]
        file_id = file_info["id"]
        file_name = file_info["original_name"]

        try:
            processing_result = await process_pdf(file_path)

            if not processing_result or "analysis" not in processing_result:
                error_result = {
                    "fileId": file_id,
                    "fileName": os.path.basename(file_path),
                    "error": "Processing returned no result."
                }
                yield f"data: {json.dumps(error_result)}\n\n"
                continue

            analysis_data = processing_result.get("analysis", {}).get("json", {})
            analysis_result_model = AnalysisResult(**analysis_data)

            final_result = FileProcessingResult(
                fileId=file_id,
                fileName=os.path.basename(file_path),
                qualityMetrics=QualityMetrics(parseAccuracy=analysis_result_model.quality_score),
                analysis=analysis_result_model
            )
            yield f"data: {final_result.model_dump_json()}\n\n"

        except Exception as e:
            error_result = {
                "fileId": file_id,
                "fileName": os.path.basename(file_path),
                "error": f"Processing error: {e}"
            }
            yield f"data: {json.dumps(error_result)}\n\n"

        finally:
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception:
                    pass

@app.post("/process-files")
async def process_files_endpoint(
    files: List[UploadFile] = File(...),
    file_ids: List[str] = Form(...)
):
    if not files:
        raise HTTPException(status_code=400, detail="No files were uploaded.")

    saved_info = []  # list of dicts with {path, id, original_name}

    for upload, fid in zip(files, file_ids):

        if not upload.filename:
            continue

        suffix = os.path.splitext(upload.filename)[1]
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=UPLOAD_DIRECTORY)
        tmp_path = tmp.name
        tmp.close()

        try:
            with open(tmp_path, "wb") as buffer:
                while True:
                    chunk = await upload.read(1024 * 1024)
                    if not chunk:
                        break
                    buffer.write(chunk)
            await upload.close()

            saved_info.append({
                "path": tmp_path,
                "id": fid,
                "original_name": upload.filename
            })

        except Exception as e:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            continue

    return StreamingResponse(
        _process_saved_files(saved_info),
        media_type="text/event-stream"
    )

@app.post("/ingest/", tags=["Ingestion"])
async def start_ingestion_process(
    files: List[UploadFile] = File(...),
    file_details: str = Form(...),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files were provided for ingestion.")

    try:
        details_list = json.loads(file_details)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format for file_details.")

    uploaded_files_map = {file.filename: file for file in files}

    async def ingestion_generator():
        total_files = len(details_list)
        for i, details_data in enumerate(details_list):
            print(i, details_data)
            filename = details_data.get("name")
            if not filename or filename not in uploaded_files_map:
                continue

            full_filepath = details_data.get("path")
            
            try:
                # --- CORRECTED LOGIC ---
                # 1. Call the ingestion function, which returns a complete result object
                analysis = details_data.get("analysis", {})
                ingestion_result_obj = ingest_unstructured_file(
                    file_path=full_filepath,
                    category=analysis.get("subdomain"),
                    reference=analysis.get("publishing_authority"),
                    url=details_data.get("sourceUrl") or "https://www.epfindia.gov.in/",
                    fileId = details_data.get("id")
                )
                
                # 2. Convert the entire Pydantic result object to a dictionary
                # This correctly captures status, error, and ingestionDetails
                result_payload = ingestion_result_obj.dict()
                print(result_payload)
                # 3. Add the progress, the only info unique to this loop
                result_payload["progress"] = ((i + 1) / total_files) * 100

            except Exception as e:
                # This is a fallback for unexpected errors that ingest_unstructured_file might not catch
                print(f"\nAn unhandled error occurred during ingestion for {filename}: {e}")
                result_payload = {
                    "fileName": filename,
                    "fileId": details_data.get("id"),
                    "fileSize": details_data.get('size', 0),
                    "status": "failed",
                    "error": f"An unhandled exception occurred in the endpoint: {str(e)}",
                    "progress": ((i + 1) / total_files) * 100,
                    "ingestionDetails": None
                }
            
            finally:
                # --- File cleanup runs regardless of the outcome ---
                if os.path.exists(full_filepath):
                    os.remove(full_filepath)
                filename_without_ext, _ = os.path.splitext(str(filename))
                md_filepath = os.path.join(MARKDOWN_DIRECTORY, str(filename_without_ext) + '.md')
                if os.path.exists(md_filepath):
                    os.remove(md_filepath)

            # Yield the correctly formed result
            yield f"data: {json.dumps(result_payload)}\n\n"
            await asyncio.sleep(0.01)

    return StreamingResponse(ingestion_generator(), media_type="text/event-stream")


async def download_and_save_file(client: httpx.AsyncClient, url: HttpUrl) -> DownloadResult:
    try:
        parsed_path = urlparse(str(url)).path
        filename = os.path.basename(parsed_path)
        filename = unquote(filename) or "downloaded_file"
        file_path = UPLOAD_DIRECTORY / filename

        async with client.stream("GET", str(url), follow_redirects=True, timeout=30.0) as response:
            response.raise_for_status()

            file_size = 0
            file_bytes = b""
            async with aiofiles.open(file_path, "wb") as buffer:
                async for chunk in response.aiter_bytes():
                    await buffer.write(chunk)
                    file_bytes += chunk
                    file_size += len(chunk)

        # Encode the file as base64
        encoded_file = base64.b64encode(file_bytes).decode("utf-8")

        return DownloadSuccess(
            url=url,
            data=FileMetadata(
                name=filename,
                path=str(file_path.resolve()),
                size=file_size,
                type=filename.split(".")[-1].lower() if "." in filename else "unknown",
                source_url=str(url),
                file_base64=encoded_file,  # 👈 add file content here
            ),
        )

    except httpx.HTTPStatusError as e:
        return DownloadError(url=url, error=f"HTTP error: {e.response.status_code}")
    except httpx.RequestError as e:
        return DownloadError(url=url, error=f"Network error: {e.__class__.__name__}")
    except Exception as e:
        return DownloadError(url=url, error=f"An unexpected error occurred: {e}")

@app.post("/download-from-urls", response_model=List[DownloadResult])
async def download_from_urls(request: UrlListRequest):
    """
    Accepts a list of URLs, downloads and saves the files concurrently,
    and returns the results.
    """
    if not request.urls:
        raise HTTPException(status_code=400, detail="URL list cannot be empty.")

    UPLOAD_DIRECTORY.mkdir(exist_ok=True)
    
    async with httpx.AsyncClient(verify=False) as client:
        tasks = [download_and_save_file(client, url) for url in request.urls]
        results = await asyncio.gather(*tasks)
        return results
    

@app.post("/ingest/stream")
async def start_ingestion_stream(
    files: List[UploadFile] = File(...),
    file_details: str = Form(...),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files were provided for ingestion.")

    try:
        details_list = json.loads(file_details)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format for file_details.")

    async def generator():
        ingestion_results = []
        total = len(details_list)
        processed_count = 0

        for details_data in details_list:
            filename = details_data.get("name")
            full_filepath = details_data.get("path")
            analysis = details_data.get("analysis", {}) or {}
            subdomain = analysis.get("subdomain")
            publishing_authority = analysis.get("publishing_authority")
            source_url = details_data.get("sourceUrl", "https://www.epfindia.gov.in/")

            # Send 'started' event for this file
            started_evt = {
                "event": "file_started",
                "fileName": filename,
                "fileSize": details_data.get("size", 0),
            }
            yield (json.dumps(started_evt) + "\n").encode("utf-8")

            try:
                # If ingest_unstructured_file is blocking, run in thread
                result_success = await asyncio.to_thread(
                    ingest_unstructured_file,
                    file_path=full_filepath,
                    category=subdomain,
                    reference=publishing_authority,
                    url=source_url,
                )

                # Compose success message (safe-serialize ingestion details)
                success_evt = {
                    "event": "file_result",
                    "fileName": filename,
                    "status": "success",
                    "ingestionDetails": getattr(result_success, "ingestionDetails", None),
                }
                ingestion_results.append({
                    "fileName": filename,
                    "fileSize": details_data.get("size", 0),
                    "status": "success",
                    "ingestionDetails": success_evt["ingestionDetails"],
                })
                yield (json.dumps(success_evt) + "\n").encode("utf-8")

            except ImportError as ie:
                error_msg = "fpdf missing: pip install fpdf"
                error_evt = {
                    "event": "file_result",
                    "fileName": filename,
                    "status": "failed",
                    "error": error_msg,
                }
                ingestion_results.append({
                    "fileName": filename,
                    "fileSize": details_data.get("size", 0),
                    "status": "failed",
                    "error": error_msg,
                })
                yield (json.dumps(error_evt) + "\n").encode("utf-8")

            except Exception as e:
                # Send failure event
                err = str(e)
                error_evt = {
                    "event": "file_result",
                    "fileName": filename,
                    "status": "failed",
                    "error": err,
                }
                ingestion_results.append({
                    "fileName": filename,
                    "fileSize": details_data.get("size", 0),
                    "status": "failed",
                    "error": err,
                })
                yield (json.dumps(error_evt) + "\n").encode("utf-8")

            # Cleanup files (same as before)
            try:
                if full_filepath and os.path.exists(full_filepath):
                    os.remove(full_filepath)
                if filename:
                    filename_without_ext, _ = os.path.splitext(str(filename))
                    md_filepath = os.path.join(MARKDOWN_DIRECTORY, f"{filename_without_ext}.md")
                    if os.path.exists(md_filepath):
                        os.remove(md_filepath)
            except Exception:
                # don't break stream on cleanup problems; notify optionally
                pass

            processed_count += 1
            # Optionally send progress event
            progress_evt = {
                "event": "progress",
                "processed": processed_count,
                "total": total,
                "percent": round(processed_count / total * 100, 2),
            }
            yield (json.dumps(progress_evt) + "\n").encode("utf-8")

            # yield control to event loop so client sees incremental data
            await asyncio.sleep(0)

        # final completion event with aggregated results
        complete_evt = {"event": "complete", "results": ingestion_results}
        yield (json.dumps(complete_evt) + "\n").encode("utf-8")

    # NDJSON streaming — client will parse one JSON object per line
    return StreamingResponse(generator(), media_type="application/x-ndjson")

