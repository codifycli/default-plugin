# Use a CentOS base image
FROM rockylinux:9

# Install necessary packages to fetch the NodeSource script and Node.js
#RUN dnf clean all \
# && rm -rf /var/cache/dnf \
# && dnf -y --refresh update
#
#RUN dnf install sudo -y \
#    && dnf install nodejs npm -y

RUN dnf -y install which && dnf clean all
RUN dnf -y install sudo && dnf clean all

# Update base + install deps
#RUN dnf clean all \
# && rm -rf /var/cache/dnf \
# && dnf -y --refresh update \
# && dnf -y install ca-certificates \
# && dnf clean all

# Add NodeSource repo for Node.js 22
RUN curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -

# Install Node.js
RUN dnf -y install nodejs \
 && dnf clean all

# Verify
RUN node --version && npm --version

## Create node user with home directory and bash shell
RUN useradd --create-home --shell /bin/bash node
RUN usermod -aG wheel node

## Ensure node owns its home directory
RUN chown -R node:node /home/node

RUN echo "node ALL=(ALL:ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/node
##
### Switch to node user
#USER node

RUN dnf clean all \
 && rm -rf /var/cache/dnf \
 && dnf clean all
