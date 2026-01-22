import os
import uuid
import shutil
from typing import Optional, Tuple, Dict, Any, List
from fastapi import UploadFile, HTTPException
from pathlib import Path
import hashlib
import logging
from datetime import datetime
from .security import scan_file_content, sanitize_filename, get_file_mime_type

logger = logging.getLogger(__name__)

# Configuration
# Use absolute path to ensure consistency across different working directories
UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads"
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB (increased from 10MB)
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".gif", ".tiff", ".bmp", ".docx", ".doc"}
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg", 
    "image/jpg",
    "image/png", 
    "image/gif",
    "image/tiff",
    "image/bmp",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword"
}

# Create upload directory structure with proper error handling
def ensure_upload_directories():
    """Ensure all required upload directories exist, creating them if necessary."""
    try:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        (UPLOAD_DIR / "documents").mkdir(parents=True, exist_ok=True)
        (UPLOAD_DIR / "temp").mkdir(parents=True, exist_ok=True)
        (UPLOAD_DIR / "quarantine").mkdir(parents=True, exist_ok=True)
        (UPLOAD_DIR / "deleted").mkdir(parents=True, exist_ok=True)
        (UPLOAD_DIR / "backups").mkdir(parents=True, exist_ok=True)
        logger.info(f"Upload directories initialized at: {UPLOAD_DIR}")
    except OSError as e:
        logger.error(f"Failed to create upload directories at {UPLOAD_DIR}: {e}")
        raise RuntimeError(f"Cannot create upload directories: {e}")

# Initialize directories on module import
ensure_upload_directories()

def enhanced_file_validation(file: UploadFile) -> Dict[str, Any]:
    """Enhanced file validation with security checks."""
    validation_result = {
        "valid": True,
        "errors": [],
        "warnings": [],
        "sanitized_filename": "",
        "detected_mime": "",
        "file_hash": ""
    }
    
    # Check file size
    if file.size and file.size > MAX_FILE_SIZE:
        validation_result["valid"] = False
        validation_result["errors"].append(
            f"File too large. Maximum size is {MAX_FILE_SIZE // 1024 // 1024}MB"
        )
    
    # Sanitize and validate filename
    if not file.filename:
        validation_result["valid"] = False
        validation_result["errors"].append("Filename is required")
        return validation_result
    
    sanitized_name = sanitize_filename(file.filename)
    validation_result["sanitized_filename"] = sanitized_name
    
    # Check file extension
    file_ext = Path(sanitized_name).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        validation_result["valid"] = False
        validation_result["errors"].append(
            f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Check MIME type
    if file.content_type not in ALLOWED_MIME_TYPES:
        validation_result["warnings"].append(
            f"MIME type {file.content_type} not in whitelist"
        )
    
    # Create hash of file content for duplicate detection
    try:
        file.file.seek(0)
        content = file.file.read()
        file_hash = hashlib.sha256(content).hexdigest()
        validation_result["file_hash"] = file_hash
        file.file.seek(0)  # Reset file pointer
    except Exception as e:
        validation_result["warnings"].append(f"Could not hash file: {str(e)}")
    
    return validation_result

def quarantine_file(file_path: str, reason: str) -> str:
    """Move suspicious file to quarantine directory."""
    quarantine_path = UPLOAD_DIR / "quarantine" / f"{uuid.uuid4()}_{Path(file_path).name}"
    shutil.move(file_path, quarantine_path)
    
    # Log quarantine action
    with open(UPLOAD_DIR / "quarantine" / "quarantine_log.txt", "a") as log:
        timestamp = datetime.utcnow().isoformat()
        log.write(f"{timestamp} | {Path(file_path).name} -> {quarantine_path.name} | Reason: {reason}\n")
    
    return str(quarantine_path)

async def secure_save_upload_file(file: UploadFile) -> Tuple[str, str, int, Dict[str, Any]]:
    """Securely save uploaded file with enhanced validation and scanning."""
    
    # Validate file
    validation = enhanced_file_validation(file)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation["errors"])
    
    # Generate unique filename
    unique_filename = f"{uuid.uuid4()}_{validation['sanitized_filename']}"
    temp_path = UPLOAD_DIR / "temp" / unique_filename
    final_path = UPLOAD_DIR / "documents" / unique_filename
    
    # Save to temporary location first
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Get file size
        file_size = temp_path.stat().st_size
        
        # Perform security scan
        security_scan = scan_file_content(str(temp_path))
        
        # Check if file passed security scan
        if not security_scan["safe"]:
            quarantine_path = quarantine_file(str(temp_path), "; ".join(security_scan["issues"]))
            raise HTTPException(
                status_code=400, 
                detail=f"File failed security scan: {'; '.join(security_scan['issues'])}"
            )
        
        # Verify MIME type matches extension
        actual_mime = get_file_mime_type(str(temp_path))
        expected_mimes = {
            '.pdf': 'application/pdf',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
        }
        
        file_ext = Path(validation['sanitized_filename']).suffix.lower()
        if file_ext in expected_mimes and actual_mime != expected_mimes[file_ext]:
            quarantine_path = quarantine_file(str(temp_path), f"MIME type mismatch: {actual_mime}")
            raise HTTPException(
                status_code=400,
                detail=f"File content doesn't match extension. Expected {expected_mimes[file_ext]}, got {actual_mime}"
            )
        
        # Move to final location
        shutil.move(temp_path, final_path)
        
        # Prepare metadata
        metadata = {
            "validation_result": validation,
            "security_scan": security_scan,
            "actual_mime_type": actual_mime,
            "file_hash": security_scan.get("file_hash", ""),
            "quarantine_status": "clean"
        }
        
        return str(final_path), unique_filename, file_size, metadata
    
    except Exception as e:
        # Clean up on error
        if temp_path.exists():
            temp_path.unlink()
        if final_path.exists():
            final_path.unlink()
        
        if isinstance(e, HTTPException):
            raise e
        
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save file: {str(e)}"
        )

# Wrapper function for compatibility with existing code
async def save_upload_file(file: UploadFile, destination_path: Optional[str] = None) -> Tuple[str, str, int]:
    """Save uploaded file - wrapper around secure_save_upload_file for compatibility."""
    try:
        file_path, unique_filename, file_size, metadata = await secure_save_upload_file(file)
        
        # If specific destination is requested, move file there
        if destination_path:
            dest_path = Path(destination_path)
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(file_path, dest_path)
            file_path = str(dest_path)
            unique_filename = dest_path.name
        
        logger.info(f"File saved successfully: {unique_filename} ({file_size} bytes)")
        return file_path, unique_filename, file_size
        
    except Exception as e:
        logger.error(f"Failed to save file: {str(e)}")
        raise

def delete_file(file_path: str, soft_delete: bool = True, backup: bool = True) -> bool:
    """
    Delete file with safety options.
    
    Args:
        file_path: Path to file to delete
        soft_delete: If True, move to deleted folder instead of permanent deletion
        backup: If True, create backup before deletion
    
    Returns:
        bool: True if deletion successful, False otherwise
    """
    try:
        path = Path(file_path)
        
        if not path.exists():
            logger.warning(f"File not found for deletion: {file_path}")
            return False
        
        # Create backup if requested
        if backup:
            backup_path = UPLOAD_DIR / "backups" / f"{uuid.uuid4()}_{path.name}"
            shutil.copy2(path, backup_path)
            logger.info(f"Backup created: {backup_path}")
        
        if soft_delete:
            # Move to deleted folder
            deleted_path = UPLOAD_DIR / "deleted" / f"{datetime.utcnow().isoformat()}_{path.name}"
            shutil.move(path, deleted_path)
            
            # Log soft deletion
            with open(UPLOAD_DIR / "deleted" / "deletion_log.txt", "a") as log:
                timestamp = datetime.utcnow().isoformat()
                log.write(f"{timestamp} | SOFT_DELETE | {path.name} -> {deleted_path.name}\n")
            
            logger.info(f"File soft deleted: {path.name} -> {deleted_path.name}")
        else:
            # Permanent deletion
            path.unlink()
            
            # Log permanent deletion
            with open(UPLOAD_DIR / "deletion_log.txt", "a") as log:
                timestamp = datetime.utcnow().isoformat()
                log.write(f"{timestamp} | PERMANENT_DELETE | {path.name}\n")
            
            logger.info(f"File permanently deleted: {path.name}")
        
        return True
        
    except Exception as e:
        logger.error(f"Failed to delete file {file_path}: {str(e)}")
        return False

def restore_deleted_file(deleted_filename: str, restore_to: Optional[str] = None) -> Optional[str]:
    """
    Restore a soft-deleted file.
    
    Args:
        deleted_filename: Name of file in deleted folder
        restore_to: Optional specific path to restore to
    
    Returns:
        str: Path of restored file, or None if restoration failed
    """
    try:
        deleted_dir = UPLOAD_DIR / "deleted"
        deleted_files = list(deleted_dir.glob(f"*_{deleted_filename}"))
        
        if not deleted_files:
            logger.error(f"Deleted file not found: {deleted_filename}")
            return None
        
        # Get the most recent if multiple matches
        deleted_file = max(deleted_files, key=lambda x: x.stat().st_mtime)
        
        if restore_to:
            restore_path = Path(restore_to)
        else:
            # Restore to original location
            original_name = deleted_file.name.split('_', 1)[1]  # Remove timestamp prefix
            restore_path = UPLOAD_DIR / "documents" / original_name
        
        restore_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(deleted_file, restore_path)
        
        # Log restoration
        with open(UPLOAD_DIR / "deleted" / "restoration_log.txt", "a") as log:
            timestamp = datetime.utcnow().isoformat()
            log.write(f"{timestamp} | RESTORED | {deleted_file.name} -> {restore_path}\n")
        
        logger.info(f"File restored: {deleted_file.name} -> {restore_path}")
        return str(restore_path)
        
    except Exception as e:
        logger.error(f"Failed to restore file {deleted_filename}: {str(e)}")
        return None

def get_file_metadata(file_path: str) -> Dict[str, Any]:
    """Get comprehensive file metadata."""
    try:
        path = Path(file_path)
        if not path.exists():
            return {"error": "File not found", "exists": False}
        
        stat = path.stat()
        
        metadata = {
            "size": stat.st_size,
            "size_human": format_file_size(stat.st_size),
            "created": stat.st_ctime,
            "modified": stat.st_mtime,
            "created_iso": datetime.fromtimestamp(stat.st_ctime).isoformat(),
            "modified_iso": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "exists": True,
            "mime_type": get_file_mime_type(file_path),
            "extension": path.suffix.lower(),
            "filename": path.name,
            "readable": os.access(file_path, os.R_OK),
            "writable": os.access(file_path, os.W_OK),
            "file_hash": "",
            "is_image": path.suffix.lower() in {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff'},
            "is_pdf": path.suffix.lower() == '.pdf',
            "is_document": path.suffix.lower() in {'.doc', '.docx'},
        }
        
        # Calculate file hash
        try:
            with open(file_path, 'rb') as f:
                content = f.read()
                metadata["file_hash"] = hashlib.sha256(content).hexdigest()
        except Exception:
            metadata["file_hash"] = "unavailable"
        
        # Add image-specific metadata if applicable
        if metadata["is_image"]:
            metadata.update(get_image_metadata(file_path))
        
        return metadata
    
    except Exception as e:
        return {"error": str(e), "exists": False}

# Alias for compatibility
def get_file_info(file_path: str) -> Dict[str, Any]:
    """Get file information - alias for get_file_metadata."""
    return get_file_metadata(file_path)

def get_image_metadata(file_path: str) -> Dict[str, Any]:
    """Get image-specific metadata using PIL."""
    try:
        from PIL import Image
        from PIL.ExifTags import TAGS
        
        image_metadata = {}
        
        with Image.open(file_path) as img:
            image_metadata.update({
                "image_format": img.format,
                "image_mode": img.mode,
                "image_size": img.size,
                "image_width": img.width,
                "image_height": img.height,
                "has_transparency": img.mode in ('RGBA', 'LA') or 'transparency' in img.info
            })
            
            # Extract EXIF data if available
            exif_data = {}
            if hasattr(img, '_getexif'):
                exif = img._getexif()
                if exif is not None:
                    for tag_id, value in exif.items():
                        tag = TAGS.get(tag_id, tag_id)
                        exif_data[tag] = value
            
            image_metadata["exif_data"] = exif_data
        
        return image_metadata
        
    except ImportError:
        return {"image_metadata_error": "PIL not available"}
    except Exception as e:
        return {"image_metadata_error": str(e)}

def check_duplicate_files(file_hash: str, clinic_id: int, db_session) -> List[Dict]:
    """Check for duplicate files based on hash."""
    from ..models.document import Document
    
    duplicates = db_session.query(Document).filter(
        Document.file_hash == file_hash,
        Document.clinic_id == clinic_id
    ).all()
    
    return [
        {
            "id": doc.id, 
            "filename": doc.original_filename, 
            "upload_date": doc.upload_date.isoformat() if doc.upload_date else None,
            "status": doc.status.value if doc.status else None,
            "patient_id": doc.patient_id
        } 
        for doc in duplicates
    ]

def format_file_size(size_bytes: int) -> str:
    """Format file size in human-readable format."""
    if size_bytes == 0:
        return "0 B"
    
    size_names = ["B", "KB", "MB", "GB", "TB"]
    import math
    i = int(math.floor(math.log(size_bytes, 1024)))
    p = math.pow(1024, i)
    s = round(size_bytes / p, 2)
    return f"{s} {size_names[i]}"

def validate_file_integrity(file_path: str, expected_hash: Optional[str] = None) -> Dict[str, Any]:
    """
    Validate file integrity by checking hash and basic properties.
    
    Args:
        file_path: Path to file to validate
        expected_hash: Optional expected SHA256 hash
    
    Returns:
        Dict with validation results
    """
    try:
        path = Path(file_path)
        
        if not path.exists():
            return {
                "valid": False,
                "error": "File not found",
                "checks_passed": []
            }
        
        checks_passed = []
        errors = []
        
        # Check file is readable
        if os.access(file_path, os.R_OK):
            checks_passed.append("readable")
        else:
            errors.append("File not readable")
        
        # Check file size
        file_size = path.stat().st_size
        if file_size > 0:
            checks_passed.append("non_empty")
        else:
            errors.append("File is empty")
        
        # Check file extension matches content
        try:
            actual_mime = get_file_mime_type(file_path)
            expected_mimes = {
                '.pdf': 'application/pdf',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
            }
            
            file_ext = path.suffix.lower()
            if file_ext in expected_mimes:
                if actual_mime == expected_mimes[file_ext]:
                    checks_passed.append("mime_type_match")
                else:
                    errors.append(f"MIME type mismatch: expected {expected_mimes[file_ext]}, got {actual_mime}")
        except Exception as e:
            errors.append(f"Could not verify MIME type: {str(e)}")
        
        # Check hash if provided
        if expected_hash:
            try:
                with open(file_path, 'rb') as f:
                    content = f.read()
                    actual_hash = hashlib.sha256(content).hexdigest()
                    
                if actual_hash == expected_hash:
                    checks_passed.append("hash_match")
                else:
                    errors.append("Hash mismatch - file may be corrupted")
            except Exception as e:
                errors.append(f"Could not verify hash: {str(e)}")
        
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "checks_passed": checks_passed,
            "file_size": file_size,
            "last_modified": path.stat().st_mtime
        }
        
    except Exception as e:
        return {
            "valid": False,
            "error": str(e),
            "checks_passed": []
        }

def cleanup_temp_files(max_age_hours: int = 24) -> int:
    """
    Clean up temporary files older than specified age.
    
    Args:
        max_age_hours: Maximum age in hours before deletion
    
    Returns:
        int: Number of files cleaned up
    """
    try:
        temp_dir = UPLOAD_DIR / "temp"
        if not temp_dir.exists():
            return 0
        
        current_time = datetime.utcnow().timestamp()
        max_age_seconds = max_age_hours * 3600
        
        cleaned_count = 0
        
        for temp_file in temp_dir.iterdir():
            if temp_file.is_file():
                file_age = current_time - temp_file.stat().st_mtime
                
                if file_age > max_age_seconds:
                    try:
                        temp_file.unlink()
                        cleaned_count += 1
                        logger.info(f"Cleaned up temp file: {temp_file.name}")
                    except Exception as e:
                        logger.error(f"Failed to clean temp file {temp_file.name}: {str(e)}")
        
        return cleaned_count
        
    except Exception as e:
        logger.error(f"Error during temp file cleanup: {str(e)}")
        return 0

def get_storage_stats() -> Dict[str, Any]:
    """Get storage usage statistics."""
    try:
        stats = {
            "total_files": 0,
            "total_size": 0,
            "directories": {},
            "file_types": {},
            "largest_files": []
        }
        
        # Analyze each directory
        for subdir in ['documents', 'temp', 'quarantine', 'deleted', 'backups']:
            dir_path = UPLOAD_DIR / subdir
            if dir_path.exists():
                dir_files = 0
                dir_size = 0
                
                for file_path in dir_path.rglob('*'):
                    if file_path.is_file():
                        file_size = file_path.stat().st_size
                        dir_files += 1
                        dir_size += file_size
                        
                        # Track file types
                        ext = file_path.suffix.lower()
                        stats["file_types"][ext] = stats["file_types"].get(ext, 0) + 1
                
                stats["directories"][subdir] = {
                    "files": dir_files,
                    "size": dir_size,
                    "size_human": format_file_size(dir_size)
                }
                
                stats["total_files"] += dir_files
                stats["total_size"] += dir_size
        
        stats["total_size_human"] = format_file_size(stats["total_size"])
        
        return stats
        
    except Exception as e:
        logger.error(f"Error getting storage stats: {str(e)}")
        return {"error": str(e)}

def create_file_backup(file_path: str, backup_reason: str = "manual") -> Optional[str]:
    """
    Create a backup of a file.
    
    Args:
        file_path: Path to file to backup
        backup_reason: Reason for backup
    
    Returns:
        str: Path to backup file, or None if failed
    """
    try:
        source_path = Path(file_path)
        if not source_path.exists():
            logger.error(f"Source file not found for backup: {file_path}")
            return None
        
        backup_filename = f"{datetime.utcnow().isoformat()}_{backup_reason}_{source_path.name}"
        backup_path = UPLOAD_DIR / "backups" / backup_filename
        
        shutil.copy2(source_path, backup_path)
        
        # Log backup creation
        with open(UPLOAD_DIR / "backups" / "backup_log.txt", "a") as log:
            timestamp = datetime.utcnow().isoformat()
            log.write(f"{timestamp} | BACKUP | {source_path.name} -> {backup_filename} | Reason: {backup_reason}\n")
        
        logger.info(f"Backup created: {backup_filename}")
        return str(backup_path)
        
    except Exception as e:
        logger.error(f"Failed to create backup for {file_path}: {str(e)}")
        return None