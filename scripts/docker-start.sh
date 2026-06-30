#!/bin/bash
# EDL Microfinance — Complete Docker Startup Script
# Deploys contracts to Ganache, extracts addresses, starts all services.
# Usage: bash scripts/docker-start.sh
set -e

echo "╔══════════════════════════════════════════════╗"
echo "║     EDL Microfinance System Startup          ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Step 1: Start Ganache first so contracts can be deployed
echo "[1/4] Starting Ganache blockchain node..."
docker-compose up -d ganache
echo "      Waiting 5 seconds for Ganache to be ready..."
sleep 5

# Step 2: Deploy smart contracts to the running Ganache
echo "[2/4] Deploying smart contracts to Ganache..."
cd contracts
npm install --silent
npx hardhat run scripts/deploy-all.js --network ganache
cd ..

# Step 3: Extract deployed addresses from the deployment record
GANACHE_LATEST="contracts/deployments/ganache-latest.json"
if [ ! -f "$GANACHE_LATEST" ]; then
  echo "ERROR: $GANACHE_LATEST not found — deploy must have failed."
  exit 1
fi

export IDENTITY_REGISTRY_ADDRESS=$(python3 -c \
  "import sys,json; d=json.load(open('$GANACHE_LATEST')); print(d['contracts']['IdentityRegistry'])")
export EDL_ACCESS_CONTROL_ADDRESS=$(python3 -c \
  "import sys,json; d=json.load(open('$GANACHE_LATEST')); print(d['contracts']['EDLAccessControl'])")
export LOAN_FACTORY_ADDRESS=$(python3 -c \
  "import sys,json; d=json.load(open('$GANACHE_LATEST')); print(d['contracts']['LoanFactory'])")

echo "[3/4] Contract addresses:"
echo "      IdentityRegistry:  $IDENTITY_REGISTRY_ADDRESS"
echo "      EDLAccessControl:  $EDL_ACCESS_CONTROL_ADDRESS"
echo "      LoanFactory:       $LOAN_FACTORY_ADDRESS"

# Step 4: Start all remaining services with injected addresses
echo "[4/4] Starting all EDL services..."
IDENTITY_REGISTRY_ADDRESS=$IDENTITY_REGISTRY_ADDRESS \
EDL_ACCESS_CONTROL_ADDRESS=$EDL_ACCESS_CONTROL_ADDRESS \
LOAN_FACTORY_ADDRESS=$LOAN_FACTORY_ADDRESS \
docker-compose up --build -d

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║         EDL System Running                   ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Frontend:  http://localhost:3000            ║"
echo "║  Backend:   http://localhost:8000            ║"
echo "║  Ganache:   http://localhost:8545            ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "View logs:  docker-compose logs -f"
echo "Stop:       docker-compose down"
