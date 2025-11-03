# Design: Web Interface (Flask/FastAPI)

**Number**: 11  
**Status**: 📝 Planned  
**Priority**: 🚀 P2 - Larger Project  
**Effort**: 1-2 weeks  
**Impact**: Very High

---

## 1. Overview

### 1.1 Problem Statement

CLI tool limits accessibility to technical users only.

### 1.2 Solution Overview

Create web interface:
1. Upload XML via browser
2. Select playlists
3. View results
4. Download CSVs
5. Real-time progress

---

## 2. Architecture Design

### 2.1 System Architecture

```
Frontend (Browser)
    ↓ HTTP Requests
Backend API (FastAPI)
    ├─ File Upload Handler
    ├─ Job Queue (Celery/RQ)
    └─ Processing Worker
        └─ Existing Processing Pipeline
    ↓
Results Storage
    ├─ File System (CSV/JSON)
    └─ Database (optional)
    ↓
WebSocket/SSE
    └─ Real-time Progress Updates
```

### 2.2 Tech Stack

**Backend**:
- **FastAPI**: Modern, fast Python web framework
- **Celery** or **RQ**: Background job processing
- **SQLite/PostgreSQL**: Optional result storage
- **WebSockets**: Real-time progress updates

**Frontend**:
- **Option 1**: Simple HTML/JavaScript (lightweight)
- **Option 2**: React/Vue (modern, rich UI)
- **Bootstrap/Tailwind**: UI styling

**Infrastructure**:
- **Nginx**: Reverse proxy (production)
- **Docker**: Containerization (optional)

---

## 3. API Design

### 3.1 Endpoints

**File Upload**:
```python
POST /api/upload
Content-Type: multipart/form-data
Body: {xml_file: File, playlist_name: str, config: dict}
Response: {job_id: str, status: "queued"}
```

**Job Status**:
```python
GET /api/jobs/{job_id}
Response: {
    job_id: str,
    status: "queued" | "processing" | "completed" | "failed",
    progress: float,  # 0-100
    tracks_processed: int,
    total_tracks: int,
    results_url: str  # When completed
}
```

**Job Results**:
```python
GET /api/jobs/{job_id}/results
Response: {
    download_urls: {
        main: "/download/{job_id}/main.csv",
        candidates: "/download/{job_id}/candidates.csv",
        ...
    },
    statistics: {...}
}
```

**Download Files**:
```python
GET /download/{job_id}/{filename}
Response: File download
```

### 3.2 WebSocket Progress

```python
# WebSocket endpoint
WS /ws/jobs/{job_id}

# Messages from server
{
    "type": "progress",
    "tracks_processed": 10,
    "total_tracks": 25,
    "percentage": 40.0,
    "current_track": "Never Sleep Again - Solomun"
}

{
    "type": "completed",
    "results_url": "/api/jobs/{job_id}/results"
}
```

---

## 4. Implementation Details

### 4.1 FastAPI Application

**Location**: `web/main.py` (new directory)

```python
from fastapi import FastAPI, UploadFile, File, Form, WebSocket
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
import uuid
import os

app = FastAPI(title="CuePoint Web Interface")

# Job storage (in-memory or database)
jobs = {}

@app.post("/api/upload")
async def upload_file(
    xml_file: UploadFile = File(...),
    playlist_name: str = Form(...),
    config: str = Form(None)  # JSON config string
):
    """Upload XML file and start processing"""
    job_id = str(uuid.uuid4())
    
    # Save uploaded file
    upload_dir = f"uploads/{job_id}"
    os.makedirs(upload_dir, exist_ok=True)
    
    file_path = f"{upload_dir}/{xml_file.filename}"
    with open(file_path, "wb") as f:
        content = await xml_file.read()
        f.write(content)
    
    # Parse config if provided
    config_dict = json.loads(config) if config else {}
    
    # Queue job
    job = {
        "job_id": job_id,
        "status": "queued",
        "xml_path": file_path,
        "playlist_name": playlist_name,
        "config": config_dict,
        "progress": 0.0
    }
    jobs[job_id] = job
    
    # Start background task
    process_playlist_task.delay(job_id)
    
    return {"job_id": job_id, "status": "queued"}

@app.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str):
    """Get job status"""
    if job_id not in jobs:
        return {"error": "Job not found"}, 404
    
    return jobs[job_id]

@app.websocket("/ws/jobs/{job_id}")
async def websocket_progress(websocket: WebSocket, job_id: str):
    """WebSocket for real-time progress"""
    await websocket.accept()
    
    # Subscribe to job updates
    while True:
        if job_id in jobs:
            job = jobs[job_id]
            await websocket.send_json({
                "type": "progress",
                "status": job["status"],
                "progress": job["progress"],
                "tracks_processed": job.get("tracks_processed", 0),
                "total_tracks": job.get("total_tracks", 0)
            })
            
            if job["status"] in ["completed", "failed"]:
                break
        
        await asyncio.sleep(1)  # Update every second
```

### 4.2 Background Processing

**Location**: `web/worker.py`

```python
from celery import Celery
from SRC.processor import run

celery_app = Celery('cuepoint', broker='redis://localhost:6379')

@celery_app.task
def process_playlist_task(job_id: str):
    """Background task to process playlist"""
    job = jobs[job_id]
    job["status"] = "processing"
    
    try:
        # Process with progress callback
        def progress_callback(current: int, total: int):
            job["progress"] = (current / total) * 100
            job["tracks_processed"] = current
            job["total_tracks"] = total
        
        # Run processing
        result = run(
            job["xml_path"],
            job["playlist_name"],
            f"output/{job_id}",
            auto_research=job["config"].get("auto_research", False)
        )
        
        job["status"] = "completed"
        job["results"] = result
        
    except Exception as e:
        job["status"] = "failed"
        job["error"] = str(e)
```

### 4.3 Frontend (Simple HTML/JS)

**Location**: `web/static/index.html`

```html
<!DOCTYPE html>
<html>
<head>
    <title>CuePoint - Web Interface</title>
    <link rel="stylesheet" href="/static/style.css">
</head>
<body>
    <div class="container">
        <h1>CuePoint - Beatport Metadata Enricher</h1>
        
        <form id="uploadForm">
            <div class="form-group">
                <label>Rekordbox XML File:</label>
                <input type="file" id="xmlFile" accept=".xml" required>
            </div>
            
            <div class="form-group">
                <label>Playlist Name:</label>
                <input type="text" id="playlistName" required>
            </div>
            
            <button type="submit">Process Playlist</button>
        </form>
        
        <div id="progressSection" style="display: none;">
            <h2>Processing...</h2>
            <div class="progress-bar">
                <div id="progressBar" class="progress-fill"></div>
            </div>
            <p id="progressText">0%</p>
        </div>
        
        <div id="resultsSection" style="display: none;">
            <h2>Results Ready</h2>
            <a id="downloadLink" href="#">Download Results</a>
        </div>
    </div>
    
    <script src="/static/app.js"></script>
</body>
</html>
```

**JavaScript** (`web/static/app.js`):
```javascript
const form = document.getElementById('uploadForm');
const progressSection = document.getElementById('progressSection');
const resultsSection = document.getElementById('resultsSection');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append('xml_file', document.getElementById('xmlFile').files[0]);
    formData.append('playlist_name', document.getElementById('playlistName').value);
    
    const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
    });
    
    const {job_id} = await response.json();
    
    // Show progress section
    progressSection.style.display = 'block';
    
    // Connect WebSocket for progress
    const ws = new WebSocket(`ws://localhost:8000/ws/jobs/${job_id}`);
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'progress') {
            updateProgress(data.progress, data.tracks_processed, data.total_tracks);
        } else if (data.type === 'completed') {
            showResults(job_id);
        }
    };
});

function updateProgress(percentage, processed, total) {
    document.getElementById('progressBar').style.width = percentage + '%';
    document.getElementById('progressText').textContent = 
        `${percentage.toFixed(1)}% - ${processed}/${total} tracks`;
}

function showResults(job_id) {
    progressSection.style.display = 'none';
    resultsSection.style.display = 'block';
    document.getElementById('downloadLink').href = `/api/jobs/${job_id}/results`;
}
```

---

## 5. Deployment

### 5.1 Development Server

```bash
# Install dependencies
pip install fastapi uvicorn celery redis

# Start Redis (for Celery)
redis-server

# Start Celery worker
celery -A web.worker worker --loglevel=info

# Start FastAPI server
uvicorn web.main:app --reload
```

### 5.2 Production Deployment

```bash
# Using Gunicorn
gunicorn web.main:app -w 4 -k uvicorn.workers.UvicornWorker

# With Nginx reverse proxy
# nginx.conf configured to proxy to FastAPI
```

---

## 6. Features

### 6.1 Core Features

- **File Upload**: Drag-and-drop or file picker
- **Playlist Selection**: Dropdown or text input
- **Configuration**: Optional YAML config upload
- **Real-time Progress**: WebSocket updates
- **Results Download**: Download CSV/JSON files
- **Statistics View**: Summary statistics display

### 6.2 Advanced Features (Future)

- **Multiple Playlists**: Batch processing UI
- **Result Preview**: View results in browser table
- **History**: Previous job results
- **Authentication**: User accounts
- **Sharing**: Share results with others

---

## 7. Security Considerations

### 7.1 File Upload Security

- **File size limits**: Max 50MB for XML files
- **File type validation**: Only accept .xml files
- **Temporary storage**: Clean up uploaded files after processing
- **Virus scanning**: Optional antivirus scanning

### 7.2 API Security

- **Rate limiting**: Prevent abuse
- **Authentication**: Optional API keys
- **CORS**: Configure allowed origins

---

## 8. Benefits

### 8.1 User Experience

- **No installation**: Use from any browser
- **Easy to use**: Intuitive interface
- **Real-time feedback**: See progress immediately
- **Cross-platform**: Works on any OS with browser

### 8.2 Accessibility

- **Non-technical users**: No command-line needed
- **Remote access**: Use from anywhere
- **Mobile support**: Responsive design

---

## 9. Dependencies

### 9.1 Backend

```
fastapi>=0.100.0
uvicorn[standard]>=0.23.0
celery>=5.3.0
redis>=4.6.0
python-multipart>=0.0.6  # For file uploads
websockets>=11.0
```

### 9.2 Frontend

- Modern browser (Chrome, Firefox, Safari, Edge)
- No additional dependencies for simple HTML/JS version

---

## 10. Future Enhancements

### 10.1 Potential Improvements

1. **User Accounts**: Persistent user profiles
2. **Result Storage**: Database for result history
3. **Batch Processing UI**: Process multiple playlists
4. **Advanced Configuration**: Web-based config editor
5. **API Access**: RESTful API for programmatic access

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-03  
**Author**: CuePoint Development Team

