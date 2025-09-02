# main.py
import os
import shutil
from typing import List

import uvicorn
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.services.process_file import process_pdf, csv_to_markdown_file
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
    "http://0.0.0.0:3000"
    "*"  # Using "*" is permissive; tighten this for production.
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
    Handles file uploads asynchronously, saving them to the server.

    This endpoint reads and writes files without blocking the server, making it
    highly performant. It returns detailed metadata for each successfully
    stored file.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files were sent.")

    # This list will hold the metadata for the frontend (like FileData)
    response_data = []

    for file in files:
        # Create a secure and OS-agnostic path to the file
        file_path = UPLOAD_DIRECTORY / file.filename # type: ignore
        
        try:
            # 1. Read the file's content in an async manner
            content = await file.read()

            # 2. Write the file to disk asynchronously
            async with aiofiles.open(file_path, "wb") as buffer:
                await buffer.write(content)

            # 3. Gather metadata to return to the client
            response_data.append(
                {
                    "name": file.filename,
                    "path": str(file_path.resolve()), # Absolute server path
                    "size": len(content), # Get size from the read content
                    "type": file.content_type, # Use the MIME type from the upload
                }
            )

        except Exception as e:
            # If any file fails, return an error immediately
            raise HTTPException(
                status_code=500,
                detail=f"Could not save file: {file.filename}. Error: {e}",
            )

    return {
        "message": f"Successfully stored {len(response_data)} file(s).",
        "files": response_data,
    }


@app.post("/process-files", response_model=List[FileProcessingResult])
async def process_files(files: List[UploadFile] = File(...)):
    """
    Receives a list of files, processes each one to generate metrics
    and classification, and returns the results.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files were uploaded.")

    results = []
    for file in files:
        if not file.filename:
            continue
        base_name = os.path.basename(file.filename)
        file_path = os.path.join(UPLOAD_DIRECTORY, str(base_name))

        if not os.path.exists(file_path):
            raise HTTPException(
                status_code=404,
                detail=f"File not found: {file.filename}"
            )

        result = process_pdf(file_path)
        
        print("Raw result from process_pdf:", result)  # Inspect the result

        if not result:
            if not file.filename:
                continue
            base_name = os.path.basename(file.filename)
            file_path = os.path.join(UPLOAD_DIRECTORY, str(base_name))

            if not os.path.exists(file_path):
                raise HTTPException(
                    status_code=404,
                    detail=f"File not found: {file.filename}"
                )

            result = process_pdf(file_path)
            if not result:

                raise HTTPException(
                    status_code=500,
                    detail=f"Could not process file: {file.filename}"
                )
        
        try:
            # 1. Create the QualityMetrics object
            quality_metrics = QualityMetrics(
                parseAccuracy=result.get("avg_parse_quality", 0.0),
                complexity=result.get("complexity_score", 0.0)
            )

            # 2. Create the AnalysisResult object
            analysis_data = result.get("analysis", {}).get("json", {})
            # Pass known fields directly and let Pydantic handle the rest
            analysis_result = AnalysisResult(**analysis_data)


            # 3. Create the final FileProcessingResult object
            final_result = FileProcessingResult(
                fileName=file.filename,
                qualityMetrics=quality_metrics,
                analysis=analysis_result
            )
            print(analysis_result)
            results.append(final_result)

        except Exception as e:
            # This will catch errors during Pydantic model validation
            print(f"Error creating response model for {file.filename}: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Could not create processing result for {file.filename}. Error: {e}"
            )

    return results

@app.post("/ingest/", response_model=IngestionResponse, tags=["Ingestion"])
async def start_ingestion_process(
    files: List[UploadFile] = File(...),
    file_details: str = Form(...),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files were provided for ingestion.")

    try:
        details_list = json.loads(file_details)
        print(f"Parsed file details: {details_list}")  # Debugging line
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format for file_details or db_config.")

    ingestion_results = []
    files_map = {file.filename: file for file in files}

    for details_data in details_list:
        file_ingestion_result = []
        filename = details_data.get("name")
        if not filename:
                continue
        filename_without_ext, file_type = os.path.splitext(str(filename))
        full_filepath = details_data.get("path")
        analysis = details_data.get("analysis")
        intents = analysis.get("intents")
        brief_summary = analysis.get("brief_summary")
        subdomain = analysis.get("subdomain")
        publishing_authority = analysis.get("publishing_authority")
        source_url = details_data.get("sourceUrl")

        try:
            result_success = ingest_unstructured_file(
                file_path=full_filepath,
                category=subdomain,
                reference=publishing_authority,
                url=source_url if source_url else "https://esankhyiki.mospi.gov.in"
                )
            file_ingestion_result.append(result_success.ingestionDetails)
            ingestion_results.append(result_success)
        except ImportError:
            print("\nPlease install fpdf to run the example with a dummy file: pip install fpdf")
        except Exception as e:
            print(f"\nAn error occurred during the example run: {e}")

        ingestion_results.append(FileIngestionResult(
                    fileName=str(filename),
                    fileSize=details_data.get('size', 0),
                    status="success",
                    ingestionDetails=file_ingestion_result,
                ))
        if os.path.exists(full_filepath):
            os.remove(full_filepath)
            filename_without_ext, file_type = os.path.splitext(str(filename))
            md_filepath = os.path.join(MARKDOWN_DIRECTORY, str(filename_without_ext)+'.md')
            if os.path.exists(md_filepath):
                os.remove(md_filepath)
                
    result = IngestionResponse(results=ingestion_results)
    print(f"Ingestion results: {result}")
    return result


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
