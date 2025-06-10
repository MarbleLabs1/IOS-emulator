# Multi-stage build for Silicon M1 Apple Emulator
FROM node:18-bullseye as frontend-builder

# Build frontend
WORKDIR /app/frontend
COPY package*.json ./
COPY src/ ./src/
COPY public/ ./public/
COPY index.html ./
COPY vite.config.ts ./
COPY tsconfig*.json ./
COPY tailwind.config.ts ./
COPY postcss.config.js ./
COPY components.json ./

RUN npm ci
RUN npm run build

# Main application image
FROM ubuntu:22.04

# Avoid interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    qemu-system-x86 \
    qemu-system-aarch64 \
    qemu-utils \
    qemu-kvm \
    libvirt-daemon-system \
    libvirt-clients \
    bridge-utils \
    virt-manager \
    ovmf \
    curl \
    wget \
    unzip \
    git \
    build-essential \
    python3 \
    python3-pip \
    nodejs \
    npm \
    supervisor \
    nginx \
    tigervnc-standalone-server \
    tigervnc-common \
    novnc \
    websockify \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 18 (latest LTS)
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Create app user
RUN useradd -m -s /bin/bash appuser && \
    usermod -aG kvm appuser && \
    usermod -aG libvirt appuser

# Set up application directories
WORKDIR /app
RUN mkdir -p /app/backend /app/frontend /app/vms /app/disk-images /app/logs /app/temp

# Copy backend code
COPY backend/ /app/backend/
WORKDIR /app/backend
RUN npm ci --only=production

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist /app/frontend/

# Copy configuration files
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker/nginx.conf /etc/nginx/sites-available/default
COPY docker/entrypoint.sh /entrypoint.sh
COPY scripts/ /app/scripts/

# Set up OVMF firmware files
RUN cp /usr/share/OVMF/OVMF_CODE.fd /app/disk-images/ && \
    cp /usr/share/OVMF/OVMF_VARS.fd /app/disk-images/

# Create OpenCore bootloader placeholder (user needs to provide this)
RUN echo "# OpenCore bootloader files should be placed here" > /app/disk-images/README-OpenCore.txt

# Set up VNC and noVNC
RUN mkdir -p /app/vnc && \
    ln -s /usr/share/novnc /app/vnc/novnc && \
    ln -s /usr/share/novnc/vnc.html /app/vnc/novnc/index.html

# Set permissions
RUN chown -R appuser:appuser /app && \
    chmod +x /entrypoint.sh && \
    chmod +x /app/scripts/*.sh

# Expose ports
# 3001: Backend API
# 80: Frontend (nginx)
# 5900-5999: VNC ports for VMs
# 6080: noVNC web interface
EXPOSE 3001 80 5900-5999 6080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV FRONTEND_URL=http://localhost
ENV VNC_PASSWORD=silicon123

# Volume mounts for persistent data
VOLUME ["/app/vms", "/app/disk-images", "/app/logs"]

# Switch to app user
USER appuser

# Start services
ENTRYPOINT ["/entrypoint.sh"]
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]

