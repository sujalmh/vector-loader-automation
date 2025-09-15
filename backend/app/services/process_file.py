from app.services.file_profiler_agent import FileAnalyzer
import asyncio
from typing import List, AsyncGenerator, Dict, Any
import os

async def process_pdf(file_path: str) -> Dict[str, Any]:
    """
    Asynchronously processes a single PDF file by running the synchronous
    analyzer in a separate thread.
    """
    try:
        print(f"Processing {file_path}")
        analyzer_instance = FileAnalyzer()

        analysis = await asyncio.to_thread(
            analyzer_instance.analyze_single_file, file_path
        )
        return {
            "file": file_path,
            "analysis": analysis
        }
    except Exception as e:
        print(f"Error during analysis for {file_path}: {e}")
        return {
             "file": file_path,
             "analysis": {"json": {"error": str(e), "quality_score": 0, "file_name": os.path.basename(file_path)}}
        }

