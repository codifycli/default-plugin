FROM node:22

USER root

# Install system dependencies without sudo
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    git \
    sudo \
    && rm -rf /var/lib/apt/lists/*

RUN echo "node ALL=(ALL:ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/node

