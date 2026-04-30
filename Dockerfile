# Minimal Dockerfile for compiling and running C++ submissions
# Uses Alpine for a small image and installs the compilation toolchain

FROM ubuntu:22.04

# Install build tools (g++) and bash, python3
RUN apt-get update && apt-get install -y g++ bash time python3

# Create a non-root user for running untrusted binaries
RUN groupadd -r judge && useradd -r -g judge judge

# Working dir where code will be mounted or copied
WORKDIR /app

# Run as non-root user by default
USER judge

# Default to an interactive shell; callers can override CMD to run compiled binaries
CMD ["/bin/bash"]
