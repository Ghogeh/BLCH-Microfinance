# Deployment Records
After each deployment, create a file named {network}-{timestamp}.json
containing the deployed contract addresses. Example:
ganache-2024-01-01.json:
{
  "network": "ganache",
  "chainId": 1337,
  "deployedAt": "2024-01-01T00:00:00Z",
  "IdentityRegistry": "0x...",
  "LoanFactory": "0x...",
  "deployer": "0x..."
}
