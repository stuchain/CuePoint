# Design: Docker Containerization

**Number**: 14  
**Status**: 📝 Planned  
**Priority**: 🚀 P2 - Larger Project  
**Effort**: 1 week  
**Impact**: Medium

---

## 1. Overview

### 1.1 Problem Statement

Dependency management and installation complexity.

### 1.2 Solution Overview

Create Docker container:
1. Dockerfile with all dependencies
2. Includes Playwright browsers (pre-installed)
3. Consistent environment across systems
4. Easy deployment and distribution
5. No local installation needed

---

## 2. Dockerfile Design

### 2.1 Multi-Stage Build

```dockerfile
# Stage 1: Build stage
FROM python:3.11-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# Install Playwright browsers
RUN pip install --user playwright && \
    python -m playwright install chromium --with-deps

# Stage 2: Runtime stage
FROM python:3.11-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /root/.local /root/.local

# Copy application code
COPY SRC/ ./SRC/
COPY main.py .
COPY config.yaml.template .

# Make sure scripts in .local are usable
ENV PATH=/root/.local/bin:$PATH

# Create output directory
RUN mkdir -p /data/output

# Set working directory
WORKDIR /data

# Default command
ENTRYPOINT ["python", "/app/main.py"]
CMD ["--help"]
```

### 2.2 Optimized Dockerfile

**For smaller image size**:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (for layer caching)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright and browser
RUN pip install playwright && \
    playwright install chromium --with-deps

# Copy application
COPY . .

# Create data volume
VOLUME ["/data"]

WORKDIR /data

ENTRYPOINT ["python", "/app/main.py"]
```

---

## 3. Docker Compose

### 3.1 docker-compose.yml

```yaml
version: '3.8'

services:
  cuepoint:
    build: .
    image: cuepoint:latest
    volumes:
      - ./collection.xml:/data/collection.xml:ro
      - ./output:/data/output
      - ./config.yaml:/data/config.yaml:ro
    command: 
      - --xml
      - /data/collection.xml
      - --playlist
      - "My Playlist"
      - --auto-research
```

---

## 4. Usage Examples

### 4.1 Basic Usage

```bash
# Build image
docker build -t cuepoint .

# Run container
docker run --rm \
  -v $(pwd)/collection.xml:/data/collection.xml:ro \
  -v $(pwd)/output:/data/output \
  cuepoint \
  --xml /data/collection.xml \
  --playlist "My Playlist"
```

### 4.2 With Configuration

```bash
docker run --rm \
  -v $(pwd)/collection.xml:/data/collection.xml:ro \
  -v $(pwd)/config.yaml:/data/config.yaml:ro \
  -v $(pwd)/output:/data/output \
  cuepoint \
  --xml /data/collection.xml \
  --playlist "My Playlist" \
  --config /data/config.yaml
```

### 4.3 Interactive Mode

```bash
# Run interactively
docker run -it --rm \
  -v $(pwd):/data \
  cuepoint bash

# Then run commands inside container
python /app/main.py --xml /data/collection.xml --playlist "My Playlist"
```

---

## 5. Image Optimization

### 5.1 Size Optimization

- **Multi-stage build**: Separate build and runtime
- **Alpine base**: Use `python:3.11-alpine` for smaller image (~50MB smaller)
- **Cleanup**: Remove build dependencies and cache

### 5.2 Layer Caching

```dockerfile
# Order matters for caching
# 1. Install system packages (rarely changes)
# 2. Install Python packages (changes more often)
# 3. Copy application code (changes frequently)
```

---

## 6. Publishing to Docker Hub

### 6.1 Build and Tag

```bash
# Build
docker build -t cuepoint:latest .
docker build -t yourusername/cuepoint:latest .

# Tag versions
docker tag cuepoint:latest yourusername/cuepoint:1.0.0
```

### 6.2 Push to Docker Hub

```bash
# Login
docker login

# Push
docker push yourusername/cuepoint:latest
docker push yourusername/cuepoint:1.0.0
```

### 6.3 Usage from Docker Hub

```bash
# Pull and run
docker pull yourusername/cuepoint:latest
docker run --rm \
  -v $(pwd)/collection.xml:/data/collection.xml:ro \
  -v $(pwd)/output:/data/output \
  yourusername/cuepoint:latest \
  --xml /data/collection.xml \
  --playlist "My Playlist"
```

---

## 7. Benefits

### 7.1 User Benefits

- **No installation**: Just Docker
- **Consistent environment**: Same environment for everyone
- **Isolated**: Doesn't affect system Python
- **Easy updates**: `docker pull` to update

### 7.2 Developer Benefits

- **Reproducible builds**: Same environment everywhere
- **CI/CD integration**: Easy to test in containers
- **Distribution**: Single image contains everything

---

## 8. Volume Mounts

### 8.1 Recommended Mounts

```bash
-v $(pwd)/collection.xml:/data/collection.xml:ro  # XML file (read-only)
-v $(pwd)/output:/data/output                     # Output directory (read-write)
-v $(pwd)/config.yaml:/data/config.yaml:ro        # Config file (read-only)
```

---

## 9. Future Enhancements

### 9.1 Potential Improvements

1. **Multi-architecture**: ARM64 support
2. **Health checks**: Container health monitoring
3. **Docker Compose**: Orchestration for complex workflows
4. **Kubernetes**: Kubernetes deployment manifests

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-03  
**Author**: CuePoint Development Team

