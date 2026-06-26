export const IDENTITY_REGISTRY_ABI = [
  'function registerIdentity(address wallet, bytes32 kycHash, string role) external',
  'function isVerified(address wallet) external view returns (bool)',
  'function blacklisted(address wallet) external view returns (bool)',
  'function getIdentity(address wallet) external view returns (tuple(bytes32 kycHash, uint8 status, uint256 registeredAt, string role))',
  'event IdentityRegistered(address indexed wallet, bytes32 kycHash, string role)',
  'event IdentityVerified(address indexed wallet, address indexed verifiedBy)',
]

export const LOAN_FACTORY_ABI = [
  'function createLoan(uint256 amount, uint256 durationDays, uint256 interestRateBps) external returns (address)',
  'function getAllLoans() external view returns (address[])',
  'function getBorrowerLoans(address borrower) external view returns (address[])',
  'function getLoanCount() external view returns (uint256)',
  'event LoanContractDeployed(address indexed loanContract, address indexed borrower, uint256 amount, uint256 durationDays, uint256 interestRateBps)',
]

export const LOAN_CONTRACT_ABI = [
  'function provideGuarantee() external',
  'function fund() external payable',
  'function repay() external payable',
  'function checkDefault() external',
  'function grantLenderAccess(address lender) external',
  'function revokeLenderAccess(address lender) external',
  'function getRepaymentHistory() external view returns (tuple(uint256 amount, uint256 timestamp, uint256 remainingBalance)[])',
  'function getRepaymentHistoryRegulator() external view returns (tuple(uint256 amount, uint256 timestamp, uint256 remainingBalance)[])',
  'function getLoanState() external view returns (uint8)',
  'function getGuarantors() external view returns (address[])',
  'function getRepaymentCount() external view returns (uint256)',
  'function borrower() external view returns (address)',
  'function loanAmount() external view returns (uint256)',
  'function totalFunded() external view returns (uint256)',
  'function remainingBalance() external view returns (uint256)',
  'function dueDate() external view returns (uint256)',
  'function reputationScore() external view returns (uint256)',
  'function hasLenderAccess(address lender) external view returns (bool)',
  'event GuaranteeProvided(address indexed guarantor, uint256 guarantorCount)',
  'event Funded(address indexed funder, uint256 amount, uint256 totalFunded)',
  'event LoanDisbursed(address indexed borrower, uint256 amount)',
  'event RepaymentMade(address indexed borrower, uint256 amount, uint256 remainingBalance)',
  'event ReputationUpdated(address indexed borrower, uint256 newScore)',
  'event DefaultDeclared(address indexed borrower, uint256 daysOverdue)',
]
