# Dockerfile for the judge sandbox
# Stage 1: build the judge executable (g++)
FROM gcc:13-bookworm AS builder
WORKDIR /app
COPY judge.cpp .
# Build a static binary for faster startup and fewer runtime dependencies
RUN g++ -O2 -static -s judge.cpp -o judge.exe

# Stage 2: runtime image with required runtimes
FROM debian:bookworm-slim
# Install runtimes needed for multi-language support
RUN apt-get update && apt-get install -y \
    python3 \
    openjdk-17-jdk \
    && rm -rf /var/lib/apt/lists/*
# Copy the built judge binary
COPY --from=builder /app/judge.exe /usr/local/bin/judge.exe
# Ensure the binary is executable
RUN chmod +x /usr/local/bin/judge.exe
# Default entrypoint (can be overridden by docker run args)
ENTRYPOINT ["/usr/local/bin/judge.exe"]
