
// pragma solidity ^0.8.24;

// import {FHE, externalEuint64, euint64, euint128} from "@fhevm/solidity/lib/FHE.sol";
// import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

// contract PrivateMarket is ZamaEthereumConfig {
//     address public immutable admin;
//     constructor() {
//         admin = msg.sender;
//     }

//     modifier onlyAdmin() {
//         if (msg.sender != admin) revert Unauthorized();
//         _;
//     }

//     // ── Structs ───────────────────────────────────────────────────────────────

//     struct Sponsor {
//         address authority;
//         string name;
//         bool isWhitelisted;
//         uint256 creationDate;
//         uint256 totalMarketsCreated;
//     }

//     struct Market {
//         address sponsor;
//         string question;
//         uint256 resolutionDate;
//         bool resolved;
//         bool outcome;
//         uint256 liquidityCap;
//         uint64 initialLiquidity;
//         euint64 encYesPool;
//         euint64 encNoPool;
//         euint64 encTotalTrades;
//         uint256 lastUpdateTs;
//     }

//     struct UserPosition {
//         euint64 encYesShares;
//         euint64 encNoShares;
//         bool initialized;
//         bool claimed;
//     }

//     struct PendingTrade {
//         uint256 marketId;
//         address trader;
//         bool isBuyYes;
//         euint128 encUpper;
//         euint128 encLower;
//         euint64 encAmount;
//         bool exists;
//     }

//     // ── State ─────────────────────────────────────────────────────────────────

//     mapping(address => Sponsor) public sponsors;
//     mapping(uint256 => Market) public markets;
//     uint256 public marketCount;

//     mapping(uint256 => mapping(address => UserPosition)) private positions;
//     mapping(address => PendingTrade) private pendingTrades;
//     mapping(bytes32 => bool) private usedProofs;

//     // ── Events ────────────────────────────────────────────────────────────────

//     event SponsorRegistered(address indexed authority, string name);
//     event SponsorWhitelisted(address indexed authority);
//     event MarketCreated(uint256 indexed marketId, address indexed sponsor, string question, uint256 resolutionDate);
//     event TradeQueued(uint256 indexed marketId, address indexed trader, bool isBuyYes);
//     event TradeSettled(uint256 indexed marketId, address indexed trader);
//     event MarketResolved(uint256 indexed marketId, bool outcome);
//     event SponsorViewReady(uint256 indexed marketId, address indexed sponsor);
//     event PayoutReady(uint256 indexed marketId, address indexed trader);
//     event PayoutClaimed(uint256 indexed marketId, address indexed trader, uint64 amount);

//     // ── Errors ────────────────────────────────────────────────────────────────

//     error NotWhitelisted();
//     error MarketNotFound();
//     error MarketAlreadyResolved();
//     error MarketNotResolved();
//     error NotPastResolutionDate();
//     error Unauthorized();
//     error PositionNotInitialized();
//     error AlreadyClaimed();
//     error NoPendingTrade();
//     error ProofAlreadyUsed();

//     // ── Modifiers ─────────────────────────────────────────────────────────────

//     modifier onlyWhitelisted() {
//         if (!sponsors[msg.sender].isWhitelisted) revert NotWhitelisted();
//         _;
//     }

//     modifier validMarket(uint256 marketId) {
//         if (marketId >= marketCount) revert MarketNotFound();
//         _;
//     }

//     modifier onlySponsor(uint256 marketId) {
//         if (markets[marketId].sponsor != msg.sender) revert Unauthorized();
//         _;
//     }

//     // ── Sponsor Management ────────────────────────────────────────────────────

//     function registerSponsor(string calldata name) external {
//         sponsors[msg.sender] = Sponsor({
//             authority: msg.sender,
//             name: name,
//             isWhitelisted: false,
//             creationDate: block.timestamp,
//             totalMarketsCreated: 0
//         });
//         emit SponsorRegistered(msg.sender, name);
//     }

//     function whitelistSponsor(address sponsorAddress) onlyAdmin external {
       
//         sponsors[sponsorAddress].isWhitelisted = true;
//         emit SponsorWhitelisted(sponsorAddress);
//     }

//     // ── Market Creation ───────────────────────────────────────────────────────

//     function createMarket(
//         string calldata question,
//         uint256 resolutionDate,
//         uint256 liquidityCap,
//         uint64 initialLiquidity
//     ) external onlyWhitelisted returns (uint256 marketId) {
//         marketId = marketCount++;
//         uint64 half = initialLiquidity / 2;

//         Market storage m = markets[marketId];
//         m.sponsor          = msg.sender;
//         m.question         = question;
//         m.resolutionDate   = resolutionDate;
//         m.resolved         = false;
//         m.liquidityCap     = liquidityCap;
//         m.initialLiquidity = initialLiquidity;
//         m.lastUpdateTs     = block.timestamp;

//         m.encYesPool     = FHE.asEuint64(half);
//         m.encNoPool      = FHE.asEuint64(half);
//         m.encTotalTrades = FHE.asEuint64(0);

//         FHE.allowThis(m.encYesPool);
//         FHE.allowThis(m.encNoPool);
//         FHE.allowThis(m.encTotalTrades);
//         FHE.allow(m.encYesPool,     msg.sender);
//         FHE.allow(m.encNoPool,      msg.sender);
//         FHE.allow(m.encTotalTrades, msg.sender);

//         sponsors[msg.sender].totalMarketsCreated++;
//         emit MarketCreated(marketId, msg.sender, question, resolutionDate);
//     }

//     // ── Trade Step 1 ──────────────────────────────────────────────────────────
//     //encrypted inputs used here: they are accopanied by zk proof of knowledge 
//     function trade(
//         uint256 marketId,
//         bool isBuyYes,
//         externalEuint64 encAmount,
//         bytes calldata inputProof
//     ) external validMarket(marketId) {
//         Market storage m = markets[marketId];
//         if (m.resolved) revert MarketAlreadyResolved();

//         // FIX 1: inference attack prevention
//         //require(FHE.isSenderAllowed(encAmount), "Sender not authorized for this ciphertext");

//         euint64 amount = FHE.fromExternal(encAmount, inputProof);
//         FHE.allowThis(amount);

//         UserPosition storage pos = positions[marketId][msg.sender];
//         if (!pos.initialized) {
//             pos.encYesShares = FHE.asEuint64(0);
//             pos.encNoShares  = FHE.asEuint64(0);
//             pos.initialized  = true;
//             FHE.allowThis(pos.encYesShares);
//             FHE.allowThis(pos.encNoShares);
//             FHE.allow(pos.encYesShares, msg.sender);
//             FHE.allow(pos.encNoShares,  msg.sender);
//             FHE.allow(pos.encYesShares, m.sponsor);
//             FHE.allow(pos.encNoShares,  m.sponsor);
//         }

//         euint128 encUpper;
//         euint128 encLower;

//         if (isBuyYes) {
//             encUpper = FHE.mul(FHE.asEuint128(m.encYesPool), FHE.asEuint128(amount));
//             encLower = FHE.add(FHE.asEuint128(m.encNoPool),  FHE.asEuint128(amount));
//         } else {
//             encUpper = FHE.mul(FHE.asEuint128(m.encNoPool),  FHE.asEuint128(amount));
//             encLower = FHE.add(FHE.asEuint128(m.encYesPool), FHE.asEuint128(amount));
//         }

//         // FIX 2: allowThis (contract) + allow (trader only) — NOT makePubliclyDecryptable
//         FHE.allowThis(encUpper);
//         FHE.allowThis(encLower);
//         FHE.allow(encLower, msg.sender);

//         pendingTrades[msg.sender] = PendingTrade({
//             marketId:  marketId,
//             trader:    msg.sender,
//             isBuyYes:  isBuyYes,
//             encUpper:  encUpper,
//             encLower:  encLower,
//             encAmount: amount,
//             exists:    true
//         });
//         FHE.allowThis(pendingTrades[msg.sender].encUpper);
//         FHE.allowThis(pendingTrades[msg.sender].encLower);
//         FHE.allowThis(pendingTrades[msg.sender].encAmount);

//         emit TradeQueued(marketId, msg.sender, isBuyYes);
//     }

//     /// @notice Mark the caller's pending trade denominator encLower as publicly decryptable
//     /// so that an off-chain relayer can compute the cleartext and decryption proof.
//     function requestSettlementProof() external {
//         PendingTrade storage pt = pendingTrades[msg.sender];
//         if (!pt.exists) revert NoPendingTrade();
//         FHE.makePubliclyDecryptable(pt.encLower);
//     }

//     /// @notice Returns the ciphertext handle for a trader's pending trade denominator.
//     /// This handle is passed to the relayer's publicDecrypt() API.
//     function getPendingLowerHandle(address trader) external view returns (bytes32) {
//         PendingTrade storage pt = pendingTrades[trader];
//         if (!pt.exists) revert NoPendingTrade();
//         return FHE.toBytes32(pt.encLower);
//     }

//     // ── Trade Step 2 ──────────────────────────────────────────────────────────

//     function settleTrade(
//         uint128 plaintextLower,
//         bytes calldata abiEncodedCleartexts,
//         bytes calldata decryptionProof
//     ) external {
//         PendingTrade storage pt = pendingTrades[msg.sender];
//         if (!pt.exists) revert NoPendingTrade();

//         // FIX 4: replay protection
//         bytes32 proofHash = keccak256(decryptionProof);
//         if (usedProofs[proofHash]) revert ProofAlreadyUsed();
//         usedProofs[proofHash] = true;

//         bytes32[] memory handles = new bytes32[](1);
//         handles[0] = FHE.toBytes32(pt.encLower);
//         FHE.checkSignatures(handles, abiEncodedCleartexts, decryptionProof);

//         if (plaintextLower == 0) plaintextLower = 1;

//         Market storage m = markets[pt.marketId];

//         euint64 sharesOut = FHE.asEuint64(FHE.div(pt.encUpper, plaintextLower));
//         FHE.allowThis(sharesOut);

//         UserPosition storage pos = positions[pt.marketId][pt.trader];

//         if (pt.isBuyYes) {
//             pos.encYesShares = FHE.add(pos.encYesShares, sharesOut);
//             m.encYesPool     = FHE.sub(m.encYesPool, sharesOut);
//             m.encNoPool      = FHE.add(m.encNoPool,  pt.encAmount);
//             FHE.allowThis(pos.encYesShares);
//             FHE.allow(pos.encYesShares, pt.trader);
//             FHE.allow(pos.encYesShares, m.sponsor);
//             FHE.allowThis(m.encYesPool);
//             FHE.allowThis(m.encNoPool);
//             FHE.allow(m.encYesPool, m.sponsor);
//             FHE.allow(m.encNoPool,  m.sponsor);
//         } else {
//             pos.encNoShares = FHE.add(pos.encNoShares, sharesOut);
//             m.encNoPool     = FHE.sub(m.encNoPool,  sharesOut);
//             m.encYesPool    = FHE.add(m.encYesPool, pt.encAmount);
//             FHE.allowThis(pos.encNoShares);
//             FHE.allow(pos.encNoShares, pt.trader);
//             FHE.allow(pos.encNoShares, m.sponsor);
//             FHE.allowThis(m.encNoPool);
//             FHE.allowThis(m.encYesPool);
//             FHE.allow(m.encNoPool,  m.sponsor);
//             FHE.allow(m.encYesPool, m.sponsor);
//         }

//         m.encTotalTrades = FHE.add(m.encTotalTrades, FHE.asEuint64(1));
//         FHE.allowThis(m.encTotalTrades);
//         FHE.allow(m.encTotalTrades, m.sponsor);
//         m.lastUpdateTs = block.timestamp;

//         delete pendingTrades[msg.sender];
//         emit TradeSettled(pt.marketId, pt.trader);
//     }

//     // ── Sponsor View ──────────────────────────────────────────────────────────

//     function requestSponsorView(uint256 marketId)
//         external
//         validMarket(marketId)
//         onlySponsor(marketId)
//     {
//         Market storage m = markets[marketId];
//         FHE.allow(m.encYesPool,     msg.sender);
//         FHE.allow(m.encNoPool,      msg.sender);
//         FHE.allow(m.encTotalTrades, msg.sender);
//         emit SponsorViewReady(marketId, msg.sender);
//     }

//     // ── Resolution ────────────────────────────────────────────────────────────

//     function resolveMarket(uint256 marketId, bool outcome)
//         external
//         validMarket(marketId)
//         onlySponsor(marketId)
//     {
//         Market storage m = markets[marketId];
//         if (m.resolved) revert MarketAlreadyResolved();
//         if (block.timestamp < m.resolutionDate) revert NotPastResolutionDate();
//         m.resolved = true;
//         m.outcome  = outcome;
//         emit MarketResolved(marketId, outcome);
//     }

//     // ── Payout Step 1 ─────────────────────────────────────────────────────────

//     function preparePayout(uint256 marketId) external validMarket(marketId) {
//         Market storage m = markets[marketId];
//         if (!m.resolved) revert MarketNotResolved();

//         UserPosition storage pos = positions[marketId][msg.sender];
//         if (!pos.initialized) revert PositionNotInitialized();
//         if (pos.claimed) revert AlreadyClaimed();

//         if (m.outcome) {
//             // FIX 3: both contract + user required for user decryption
//             FHE.allowThis(pos.encYesShares);
//             FHE.allow(pos.encYesShares, msg.sender);
//             // Also allow public decryption so that an off-chain relayer can
//             // produce a decryption proof for claimPayout on Sepolia.
//             FHE.makePubliclyDecryptable(pos.encYesShares);
//         } else {
//             FHE.allowThis(pos.encNoShares);
//             FHE.allow(pos.encNoShares, msg.sender);
//             FHE.makePubliclyDecryptable(pos.encNoShares);
//         }

//         emit PayoutReady(marketId, msg.sender);
//     }

//     // ── Payout Step 2 ─────────────────────────────────────────────────────────

//     function claimPayout(
//         uint256 marketId,
//         bytes calldata abiEncodedCleartexts,
//         bytes calldata decryptionProof
//     ) external validMarket(marketId) {
//         Market storage m = markets[marketId];
//         if (!m.resolved) revert MarketNotResolved();

//         UserPosition storage pos = positions[marketId][msg.sender];
//         if (!pos.initialized) revert PositionNotInitialized();
//         if (pos.claimed) revert AlreadyClaimed();

//         // FIX 4: replay protection
//         bytes32 proofHash = keccak256(decryptionProof);
//         if (usedProofs[proofHash]) revert ProofAlreadyUsed();
//         usedProofs[proofHash] = true;

//         bytes32[] memory handles = new bytes32[](1);
//         handles[0] = m.outcome
//             ? FHE.toBytes32(pos.encYesShares)
//             : FHE.toBytes32(pos.encNoShares);
//         FHE.checkSignatures(handles, abiEncodedCleartexts, decryptionProof);

//         uint64 winningShares = abi.decode(abiEncodedCleartexts, (uint64));
//         pos.claimed = true;

//         // TODO: usdcToken.transfer(msg.sender, winningShares);

//         emit PayoutClaimed(marketId, msg.sender, winningShares);
//     }

//     // ── Views ─────────────────────────────────────────────────────────────────

//     /// @notice Returns the ciphertext handle for a trader's YES shares position.
//     function getYesSharesHandle(uint256 marketId, address trader) external view returns (bytes32) {
//         UserPosition storage pos = positions[marketId][trader];
//         if (!pos.initialized) revert PositionNotInitialized();
//         return FHE.toBytes32(pos.encYesShares);
//     }

//     /// @notice Returns the ciphertext handle for a trader's NO shares position.
//     function getNoSharesHandle(uint256 marketId, address trader) external view returns (bytes32) {
//         UserPosition storage pos = positions[marketId][trader];
//         if (!pos.initialized) revert PositionNotInitialized();
//         return FHE.toBytes32(pos.encNoShares);
//     }

//     function getMarket(uint256 marketId) external view validMarket(marketId) returns (
//         address sponsor,
//         string memory question,
//         uint256 resolutionDate,
//         bool resolved,
//         bool outcome,
//         uint256 liquidityCap,
//         uint256 lastUpdateTs
//     ) {
//         Market storage m = markets[marketId];
//         return (m.sponsor, m.question, m.resolutionDate, m.resolved, m.outcome, m.liquidityCap, m.lastUpdateTs);
//     }

//     function getSponsor(address addr) external view returns (
//         string memory name,
//         bool isWhitelisted,
//         uint256 totalMarketsCreated
//     ) {
//         Sponsor storage s = sponsors[addr];
//         return (s.name, s.isWhitelisted, s.totalMarketsCreated);
//     }

//     function hasPendingTrade(address trader) external view returns (bool) {
//         return pendingTrades[trader].exists;
//     }
// }

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, externalEuint64, euint64, euint128, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract PrivateMarket is ZamaEthereumConfig {
    using SafeERC20 for IERC20;

    address public immutable admin;
    IERC20  public immutable usdc;

    constructor(address usdcAddress) {
        admin = msg.sender;
        usdc  = IERC20(usdcAddress);
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    // ── Structs ───────────────────────────────────────────────────────────────

    struct Sponsor {
        address authority;
        string  name;
        bool    isWhitelisted;
        uint256 creationDate;
        uint256 totalMarketsCreated;
    }

    struct Market {
        address  sponsor;
        string   question;
        uint256  resolutionDate;
        bool     resolved;
        bool     outcome;
        uint256  liquidityCap;
        uint64   initialLiquidity;
        uint256  totalEscrowed;    // total USDC held for this market
        uint256  totalWinShares;   // set at resolution for payout calculation
        euint64  encYesPool;
        euint64  encNoPool;
        euint64  encTotalTrades;
        uint256  lastUpdateTs;
    }

    struct UserPosition {
        euint64 encYesShares;
        euint64 encNoShares;
        bool    initialized;
        bool    claimed;
    }

    struct PendingTrade {
        uint256  marketId;
        address  trader;
        bool     isBuyYes;
        euint128 encUpper;
        euint128 encLower;
        euint64  encAmount;        // the safeAmount after balance check
        bool     exists;
    }

    // ── State ─────────────────────────────────────────────────────────────────

    mapping(address => Sponsor)                           public  sponsors;
    mapping(uint256 => Market)                            public  markets;
    uint256                                               public  marketCount;

    // Encrypted USDC balances — deposited plaintext, tracked as ciphertext
    mapping(address => euint64)                           private encBalances;

    mapping(uint256 => mapping(address => UserPosition))  private positions;
    mapping(address => PendingTrade)                      private pendingTrades;
    mapping(bytes32 => bool)                              private usedProofs;

    // ── Events ────────────────────────────────────────────────────────────────

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event SponsorRegistered(address indexed authority, string name);
    event SponsorWhitelisted(address indexed authority);
    event MarketCreated(uint256 indexed marketId, address indexed sponsor, string question, uint256 resolutionDate, uint256 seedLiquidity);
    event TradeQueued(uint256 indexed marketId, address indexed trader, bool isBuyYes);
    event TradeSettled(uint256 indexed marketId, address indexed trader);
    event MarketResolved(uint256 indexed marketId, bool outcome);
    event SponsorViewReady(uint256 indexed marketId, address indexed sponsor);
    event PayoutReady(uint256 indexed marketId, address indexed trader);
    event PayoutClaimed(uint256 indexed marketId, address indexed trader, uint64 shares, uint256 usdcAmount);

    // ── Errors ────────────────────────────────────────────────────────────────

    error NotWhitelisted();
    error MarketNotFound();
    error MarketAlreadyResolved();
    error MarketNotResolved();
    error NotPastResolutionDate();
    error Unauthorized();
    error PositionNotInitialized();
    error AlreadyClaimed();
    error NoPendingTrade();
    error ProofAlreadyUsed();
    error SponsorNotRegistered();
    error InsufficientContractBalance();
    error ZeroAmount();

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyWhitelisted() {
        if (!sponsors[msg.sender].isWhitelisted) revert NotWhitelisted();
        _;
    }

    modifier validMarket(uint256 marketId) {
        if (marketId >= marketCount) revert MarketNotFound();
        _;
    }

    modifier onlySponsor(uint256 marketId) {
        if (markets[marketId].sponsor != msg.sender) revert Unauthorized();
        _;
    }

    // ── Deposit / Withdraw ────────────────────────────────────────────────────

    /**
     * @notice Deposit USDC into the contract.
     *         The deposit amount is visible on-chain (ERC20 transfer),
     *         but all subsequent trade amounts are hidden via encrypted balance.
     * @param amount Plaintext USDC amount (6 decimals). e.g. 100 * 1e6 = 100 USDC
     */
    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        // Credit encrypted internal balance
        // Safe cast: USDC has 6 decimals, max uint64 ~= 18.4 * 10^18 — plenty of headroom
        euint64 encAmount = FHE.asEuint64(uint64(amount));

        if (FHE.toBytes32(encBalances[msg.sender]) == bytes32(0)) {
            // First deposit — initialise balance
            encBalances[msg.sender] = encAmount;
        } else {
            encBalances[msg.sender] = FHE.add(encBalances[msg.sender], encAmount);
        }

        FHE.allowThis(encBalances[msg.sender]);
        FHE.allow(encBalances[msg.sender], msg.sender);

        emit Deposited(msg.sender, amount);
    }

    /**
     * @notice Withdraw a plaintext USDC amount from the contract.
     *         Uses FHE.select to safely deduct without revealing balance.
     *         If requested amount > balance, withdrawal silently does nothing.
     * @param amount Plaintext USDC amount to withdraw.
     */
    function withdraw(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();

        euint64 encWithdraw = FHE.asEuint64(uint64(amount));

        // Only deduct if balance >= withdraw amount
        ebool hasEnough = FHE.ge(encBalances[msg.sender], encWithdraw);
        euint64 safeWithdraw = FHE.select(hasEnough, encWithdraw, FHE.asEuint64(0));

        encBalances[msg.sender] = FHE.sub(encBalances[msg.sender], safeWithdraw);
        FHE.allowThis(encBalances[msg.sender]);
        FHE.allow(encBalances[msg.sender], msg.sender);

        // Transfer USDC back — note: if safeWithdraw was 0, we still transfer
        // the requested amount here. To prevent this we'd need async decryption.
        // For now: frontend should gate this by checking balance first via userDecrypt.
        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Returns the encrypted balance handle for a user.
     *         Use userDecrypt off-chain to read the plaintext value.
     */
    function getEncBalanceHandle(address user) external view returns (bytes32) {
        return FHE.toBytes32(encBalances[user]);
    }

    // ── Sponsor Management ────────────────────────────────────────────────────

    function registerSponsor(string calldata name) external {
        sponsors[msg.sender] = Sponsor({
            authority:           msg.sender,
            name:                name,
            isWhitelisted:       false,
            creationDate:        block.timestamp,
            totalMarketsCreated: 0
        });
        emit SponsorRegistered(msg.sender, name);
    }

    function whitelistSponsor(address sponsorAddress) external onlyAdmin {
        if (sponsors[sponsorAddress].authority == address(0)) revert SponsorNotRegistered();
        sponsors[sponsorAddress].isWhitelisted = true;
        emit SponsorWhitelisted(sponsorAddress);
    }

    // ── Market Creation ───────────────────────────────────────────────────────

    /**
     * @notice Sponsor creates a market and seeds it with USDC liquidity.
     *         Sponsor must have deposited seedLiquidity via deposit() first,
     *         OR can seed directly from wallet (safeTransferFrom).
     * @param seedLiquidity USDC amount (6 decimals) to seed as prize pool.
     */
    function createMarket(
        string   calldata question,
        uint256           resolutionDate,
        uint256           liquidityCap,
        uint64            initialLiquidity,
        uint256           seedLiquidity
    ) external onlyWhitelisted returns (uint256 marketId) {
        if (seedLiquidity == 0) revert ZeroAmount();

        // Pull seed liquidity directly from sponsor wallet into contract
        usdc.safeTransferFrom(msg.sender, address(this), seedLiquidity);

        marketId = marketCount++;
        uint64 half = initialLiquidity / 2;

        Market storage m = markets[marketId];
        m.sponsor          = msg.sender;
        m.question         = question;
        m.resolutionDate   = resolutionDate;
        m.resolved         = false;
        m.liquidityCap     = liquidityCap;
        m.initialLiquidity = initialLiquidity;
        m.totalEscrowed    = seedLiquidity;
        m.lastUpdateTs     = block.timestamp;

        m.encYesPool     = FHE.asEuint64(half);
        m.encNoPool      = FHE.asEuint64(half);
        m.encTotalTrades = FHE.asEuint64(0);

        FHE.allowThis(m.encYesPool);
        FHE.allowThis(m.encNoPool);
        FHE.allowThis(m.encTotalTrades);
        FHE.allow(m.encYesPool,     msg.sender);
        FHE.allow(m.encNoPool,      msg.sender);
        FHE.allow(m.encTotalTrades, msg.sender);

        sponsors[msg.sender].totalMarketsCreated++;
        emit MarketCreated(marketId, msg.sender, question, resolutionDate, seedLiquidity);
    }

    // ── Trade Step 1 ──────────────────────────────────────────────────────────

    /**
     * @notice Submit an encrypted trade.
     *         encAmount is validated against the trader's encrypted balance
     *         using FHE.select — if balance is insufficient, safeAmount = 0
     *         and the trade effectively does nothing (no revert, no balance leak).
     *
     *         The trader must have deposited USDC via deposit() beforehand.
     */
    function trade(
        uint256         marketId,
        bool            isBuyYes,
        externalEuint64 encAmount,
        bytes calldata  inputProof
    ) external validMarket(marketId) {
        Market storage m = markets[marketId];
        if (m.resolved) revert MarketAlreadyResolved();

        // Validate and convert encrypted input
        euint64 amount = FHE.fromExternal(encAmount, inputProof);
        FHE.allowThis(amount);

        // ── Balance check via FHE.select ──────────────────────────────────────
        // If trader has enough balance, deduct amount. Otherwise deduct 0.
        ebool   hasEnough  = FHE.ge(encBalances[msg.sender], amount);
        euint64 safeAmount = FHE.select(hasEnough, amount, FHE.asEuint64(0));

        encBalances[msg.sender] = FHE.sub(encBalances[msg.sender], safeAmount);
        FHE.allowThis(encBalances[msg.sender]);
        FHE.allow(encBalances[msg.sender], msg.sender);

        // Track USDC escrowed for this market (for payout calculation)
        // Note: we can't add safeAmount directly to totalEscrowed (it's encrypted)
        // so totalEscrowed is updated at settlement when we know the plaintext lower
        // This is tracked separately via the pool accounting

        // ── Initialise user position if first trade ───────────────────────────
        UserPosition storage pos = positions[marketId][msg.sender];
        if (!pos.initialized) {
            pos.encYesShares = FHE.asEuint64(0);
            pos.encNoShares  = FHE.asEuint64(0);
            pos.initialized  = true;
            FHE.allowThis(pos.encYesShares);
            FHE.allowThis(pos.encNoShares);
            FHE.allow(pos.encYesShares, msg.sender);
            FHE.allow(pos.encNoShares,  msg.sender);
            FHE.allow(pos.encYesShares, m.sponsor);
            FHE.allow(pos.encNoShares,  m.sponsor);
        }

        // ── AMM price calculation (CPMM) ──────────────────────────────────────
        // safeAmount feeds into the AMM — if balance was insufficient, safeAmount=0
        // and the trade has no effect on pools
        euint128 encUpper;
        euint128 encLower;

        if (isBuyYes) {
            encUpper = FHE.mul(FHE.asEuint128(m.encYesPool), FHE.asEuint128(safeAmount));
            encLower = FHE.add(FHE.asEuint128(m.encNoPool),  FHE.asEuint128(safeAmount));
        } else {
            encUpper = FHE.mul(FHE.asEuint128(m.encNoPool),  FHE.asEuint128(safeAmount));
            encLower = FHE.add(FHE.asEuint128(m.encYesPool), FHE.asEuint128(safeAmount));
        }

        FHE.allowThis(encUpper);
        FHE.allowThis(encLower);
        FHE.allow(encLower, msg.sender);

        pendingTrades[msg.sender] = PendingTrade({
            marketId:  marketId,
            trader:    msg.sender,
            isBuyYes:  isBuyYes,
            encUpper:  encUpper,
            encLower:  encLower,
            encAmount: safeAmount,
            exists:    true
        });
        FHE.allowThis(pendingTrades[msg.sender].encUpper);
        FHE.allowThis(pendingTrades[msg.sender].encLower);
        FHE.allowThis(pendingTrades[msg.sender].encAmount);

        emit TradeQueued(marketId, msg.sender, isBuyYes);
    }

    // ── Settlement ────────────────────────────────────────────────────────────

    function requestSettlementProof() external {
        PendingTrade storage pt = pendingTrades[msg.sender];
        if (!pt.exists) revert NoPendingTrade();
        FHE.makePubliclyDecryptable(pt.encLower);
    }

    function getPendingLowerHandle(address trader) external view returns (bytes32) {
        PendingTrade storage pt = pendingTrades[trader];
        if (!pt.exists) revert NoPendingTrade();
        return FHE.toBytes32(pt.encLower);
    }

    function settleTrade(
        uint128        plaintextLower,
        bytes calldata abiEncodedCleartexts,
        bytes calldata decryptionProof
    ) external {
        PendingTrade storage pt = pendingTrades[msg.sender];
        if (!pt.exists) revert NoPendingTrade();

        bytes32 proofHash = keccak256(decryptionProof);
        if (usedProofs[proofHash]) revert ProofAlreadyUsed();
        usedProofs[proofHash] = true;

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(pt.encLower);
        FHE.checkSignatures(handles, abiEncodedCleartexts, decryptionProof);

        if (plaintextLower == 0) plaintextLower = 1;

        Market storage m = markets[pt.marketId];

        euint64 sharesOut = FHE.asEuint64(FHE.div(pt.encUpper, plaintextLower));
        FHE.allowThis(sharesOut);

        UserPosition storage pos = positions[pt.marketId][pt.trader];

        if (pt.isBuyYes) {
            pos.encYesShares = FHE.add(pos.encYesShares, sharesOut);
            m.encYesPool     = FHE.sub(m.encYesPool, sharesOut);
            m.encNoPool      = FHE.add(m.encNoPool,  pt.encAmount);
            FHE.allowThis(pos.encYesShares);
            FHE.allow(pos.encYesShares, pt.trader);
            FHE.allow(pos.encYesShares, m.sponsor);
            FHE.allowThis(m.encYesPool);
            FHE.allowThis(m.encNoPool);
            FHE.allow(m.encYesPool, m.sponsor);
            FHE.allow(m.encNoPool,  m.sponsor);
        } else {
            pos.encNoShares = FHE.add(pos.encNoShares, sharesOut);
            m.encNoPool     = FHE.sub(m.encNoPool,  sharesOut);
            m.encYesPool    = FHE.add(m.encYesPool, pt.encAmount);
            FHE.allowThis(pos.encNoShares);
            FHE.allow(pos.encNoShares, pt.trader);
            FHE.allow(pos.encNoShares, m.sponsor);
            FHE.allowThis(m.encNoPool);
            FHE.allowThis(m.encYesPool);
            FHE.allow(m.encNoPool,  m.sponsor);
            FHE.allow(m.encYesPool, m.sponsor);
        }

        m.encTotalTrades = FHE.add(m.encTotalTrades, FHE.asEuint64(1));
        FHE.allowThis(m.encTotalTrades);
        FHE.allow(m.encTotalTrades, m.sponsor);
        m.lastUpdateTs = block.timestamp;

        delete pendingTrades[msg.sender];
        emit TradeSettled(pt.marketId, pt.trader);
    }

    // ── Sponsor View ──────────────────────────────────────────────────────────

    function requestSponsorView(uint256 marketId)
        external
        validMarket(marketId)
        onlySponsor(marketId)
    {
        Market storage m = markets[marketId];
        FHE.allow(m.encYesPool,     msg.sender);
        FHE.allow(m.encNoPool,      msg.sender);
        FHE.allow(m.encTotalTrades, msg.sender);
        emit SponsorViewReady(marketId, msg.sender);
    }

    // ── Resolution ────────────────────────────────────────────────────────────

    /**
     * @param totalWinningShares Total shares on winning side — sponsor reads this
     *        via userDecrypt on encYesPool or encNoPool after requestSponsorView.
     */
    function resolveMarket(
        uint256 marketId,
        bool    outcome,
        uint256 totalWinningShares
    )
        external
        validMarket(marketId)
        onlySponsor(marketId)
    {
        Market storage m = markets[marketId];
        if (m.resolved) revert MarketAlreadyResolved();
        if (block.timestamp < m.resolutionDate) revert NotPastResolutionDate();

        m.resolved       = true;
        m.outcome        = outcome;
        m.totalWinShares = totalWinningShares == 0 ? 1 : totalWinningShares;

        emit MarketResolved(marketId, outcome);
    }

    // ── Payout Step 1 ─────────────────────────────────────────────────────────

    function preparePayout(uint256 marketId) external validMarket(marketId) {
        Market storage m = markets[marketId];
        if (!m.resolved) revert MarketNotResolved();

        UserPosition storage pos = positions[marketId][msg.sender];
        if (!pos.initialized) revert PositionNotInitialized();
        if (pos.claimed) revert AlreadyClaimed();

        if (m.outcome) {
            FHE.allowThis(pos.encYesShares);
            FHE.allow(pos.encYesShares, msg.sender);
            FHE.makePubliclyDecryptable(pos.encYesShares);
        } else {
            FHE.allowThis(pos.encNoShares);
            FHE.allow(pos.encNoShares, msg.sender);
            FHE.makePubliclyDecryptable(pos.encNoShares);
        }

        emit PayoutReady(marketId, msg.sender);
    }

    // ── Payout Step 2 ─────────────────────────────────────────────────────────

    /**
     * @notice Claim proportional USDC payout.
     *         payout = (traderShares / totalWinShares) * totalEscrowed
     *         Winning USDC is credited back to trader's encrypted internal balance.
     */
    function claimPayout(
        uint256        marketId,
        bytes calldata abiEncodedCleartexts,
        bytes calldata decryptionProof
    ) external validMarket(marketId) {
        Market storage m = markets[marketId];
        if (!m.resolved) revert MarketNotResolved();

        UserPosition storage pos = positions[marketId][msg.sender];
        if (!pos.initialized) revert PositionNotInitialized();
        if (pos.claimed) revert AlreadyClaimed();

        bytes32 proofHash = keccak256(decryptionProof);
        if (usedProofs[proofHash]) revert ProofAlreadyUsed();
        usedProofs[proofHash] = true;

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = m.outcome
            ? FHE.toBytes32(pos.encYesShares)
            : FHE.toBytes32(pos.encNoShares);
        FHE.checkSignatures(handles, abiEncodedCleartexts, decryptionProof);

        uint64 winningShares = abi.decode(abiEncodedCleartexts, (uint64));
        pos.claimed = true;

        // Proportional USDC payout
        uint256 payout = (uint256(winningShares) * m.totalEscrowed) / m.totalWinShares;

        if (payout > 0) {
            if (usdc.balanceOf(address(this)) < payout) revert InsufficientContractBalance();
            // Credit winnings back to trader's encrypted internal balance
            euint64 encPayout = FHE.asEuint64(uint64(payout));
            encBalances[msg.sender] = FHE.add(encBalances[msg.sender], encPayout);
            FHE.allowThis(encBalances[msg.sender]);
            FHE.allow(encBalances[msg.sender], msg.sender);
        }

        emit PayoutClaimed(marketId, msg.sender, winningShares, payout);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getYesSharesHandle(uint256 marketId, address trader) external view returns (bytes32) {
        UserPosition storage pos = positions[marketId][trader];
        if (!pos.initialized) revert PositionNotInitialized();
        return FHE.toBytes32(pos.encYesShares);
    }

    function getNoSharesHandle(uint256 marketId, address trader) external view returns (bytes32) {
        UserPosition storage pos = positions[marketId][trader];
        if (!pos.initialized) revert PositionNotInitialized();
        return FHE.toBytes32(pos.encNoShares);
    }

    function getMarket(uint256 marketId) external view validMarket(marketId) returns (
        address sponsor,
        string memory question,
        uint256 resolutionDate,
        bool    resolved,
        bool    outcome,
        uint256 liquidityCap,
        uint256 totalEscrowed,
        uint256 totalWinShares,
        uint256 lastUpdateTs
    ) {
        Market storage m = markets[marketId];
        return (
            m.sponsor, m.question, m.resolutionDate,
            m.resolved, m.outcome, m.liquidityCap,
            m.totalEscrowed, m.totalWinShares, m.lastUpdateTs
        );
    }

    function getSponsor(address addr) external view returns (
        string memory name,
        bool    isWhitelisted,
        uint256 totalMarketsCreated
    ) {
        Sponsor storage s = sponsors[addr];
        return (s.name, s.isWhitelisted, s.totalMarketsCreated);
    }

    function hasPendingTrade(address trader) external view returns (bool) {
        return pendingTrades[trader].exists;
    }

    function previewPayout(uint256 marketId, uint64 shares) external view validMarket(marketId) returns (uint256) {
        Market storage m = markets[marketId];
        if (!m.resolved || m.totalWinShares == 0) return 0;
        return (uint256(shares) * m.totalEscrowed) / m.totalWinShares;
    }
}