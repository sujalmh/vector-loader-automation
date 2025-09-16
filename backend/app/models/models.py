from sqlalchemy import Column, String, Integer, Float, Text, JSON, Enum, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy import DateTime
import uuid
from db_config import Base
import enum


class FileStatus(enum.Enum):
    success = "success"
    failed = "failed"
    error = "error"


class FileIngestionMetadata(Base):
    """
    Stores file ingestion metadata, analysis results, and status.
    """
    __tablename__ = "file_ingestion_metadata"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, nullable=False)

    # File Metadata
    file_name = Column(String, nullable=False)
    file_path = Column(Text, nullable=True)
    file_size = Column(Integer, nullable=True)
    file_type = Column(String, nullable=True)
    source_url = Column(Text, nullable=True)

    # File Hash (for duplicate detection)
    file_hash = Column(String(64), nullable=False)  # e.g., SHA256
    __table_args__ = (UniqueConstraint("file_hash", name="uq_file_hash"),)

    # Ingestion status
    status = Column(Enum(FileStatus), nullable=False, default=FileStatus.success)

    # Quality metrics
    parse_accuracy = Column(Float, nullable=True)

    # Analysis results
    domain = Column(String, nullable=True)
    subdomain = Column(String, nullable=True)
    intents = Column(JSON, nullable=True)  # can be list or string
    publishing_authority = Column(String, nullable=True)
    published_date = Column(String, nullable=True)
    period_of_reference = Column(String, nullable=True)
    brief_summary = Column(Text, nullable=True)
    document_size = Column(String, nullable=True)
    extra_fields = Column(JSON, nullable=True)
    quality_score = Column(Float, nullable=True)
    error = Column(Text, nullable=True)

    # Ingestion details
    ingestion_details = Column(JSON, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
