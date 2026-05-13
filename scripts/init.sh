tart clone ghcr.io/cirruslabs/macos-tahoe-base:latest codify-test-vm
tart set codify-test-vm --memory 6124 --cpu 4

tart clone ghcr.io/cirruslabs/ubuntu:latest codify-test-vm-linux
tart set codify-test-vm-linux --memory 6124 --cpu 4

## Will need to manually install nodeJS on the vm
tart run codify-test-vm-linux
tart exec -i codify-test-vm-linux bash -c -i "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash"
tart exec -i codify-test-vm-linux bash -c -i "nvm install 24; nvm alias default 24"

# tart clone ghcr.io/kevinwang5658/sonoma-codify:v0.0.3 codify-sonoma
