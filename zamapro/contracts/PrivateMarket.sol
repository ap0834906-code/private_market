// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, externalEuint64, euint64, euint128, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract PrivateMarket is ZamaEthereumConfig {
    using SafeERC20 for IERC20;

    address public immutable admin;
    IERC20 public immutable usdc;

    struct Sponsor {
        address authority;
        string name;
        bool isWhitelisted;
        uint256 creationDate;
        uint256 totalMarketsCreated;
    }

    struct Market {
        address sponsor;
        string question;
        uint256 resolutionDate;
        bool resolved;
        bool outcome;
        uint256 liquidityCap;
        uint64 initialLiquidity;
        uint256 totalEscrowed;
        uint256 totalWinShares;
        euint64 encYesPool;
        euint64 encNoPool;
        euint64 encTotalYesShares;
        euint64 encTotalNoShares;
        euint64 encTotalTrades;
        uint256 lastUpdateTs;
    }

    struct UserPosition {
        euint64 encYesShares;
        euint64 encNoShares;
        bool initialized;
        bool claimed;
    }

    struct PendingTrade {
        uint256 marketId;
        address trader;
        bool isBuyYes;
        euint128 encUpper;
        euint128 encLower;
        euint64 encAmount;
        bool exists;
    }

    mapping(address => Sponsor) public sponsors;
    mapping(uint256 => Market) public markets;
    uint256 public marketCount;

    mapping(address => euint64) private encBalances;
    mapping(uint256 => mapping(address => UserPosition)) private positions;
    mapping(address => PendingTrade) private pendingTrades;
    mapping(bytes32 => bool) private usedProofs;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event SponsorRegistered(address indexed authority, string name);
    event SponsorWhitelisted(address indexed authority);
    event MarketCreated(
        uint256 indexed marketId,
        address indexed sponsor,
        string question,
        uint256 resolutionDate,
        uint256 seedLiquidity
    );
    event TradeQueued(uint256 indexed marketId, address indexed trader, bool isBuyYes);
    event TradeSettled(uint256 indexed marketId, address indexed trader);
    event MarketResolved(uint256 indexed marketId, bool outcome);
    event SponsorViewReady(uint256 indexed marketId, address indexed sponsor);
    event PayoutReady(uint256 indexed marketId, address indexed trader);
    event PayoutClaimed(uint256 indexed marketId, address indexed trader, uint64 shares, uint256 usdcAmount);

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

    constructor(address usdcAddress) {
        admin = msg.sender;
        usdc = IERC20(usdcAddress);
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

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

    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        euint64 encAmount = FHE.asEuint64(uint64(amount));
        if (FHE.toBytes32(encBalances[msg.sender]) == bytes32(0)) {
            encBalances[msg.sender] = encAmount;
        } else {
            encBalances[msg.sender] = FHE.add(encBalances[msg.sender], encAmount);
        }

        FHE.allowThis(encBalances[msg.sender]);
        FHE.allow(encBalances[msg.sender], msg.sender);

        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        euint64 encWithdraw = FHE.asEuint64(uint64(amount));
        ebool hasEnough = FHE.ge(encBalances[msg.sender], encWithdraw);
        euint64 safeWithdraw = FHE.select(hasEnough, encWithdraw, FHE.asEuint64(0));
        encBalances[msg.sender] = FHE.sub(encBalances[msg.sender], safeWithdraw);
        FHE.allowThis(encBalances[msg.sender]);
        FHE.allow(encBalances[msg.sender], msg.sender);
        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function getEncBalanceHandle(address user) external view returns (bytes32) {
        return FHE.toBytes32(encBalances[user]);
    }

    function registerSponsor(string calldata name) external {
        sponsors[msg.sender] = Sponsor({
            authority: msg.sender,
            name: name,
            isWhitelisted: false,
            creationDate: block.timestamp,
            totalMarketsCreated: 0
        });
        emit SponsorRegistered(msg.sender, name);
    }

    function whitelistSponsor(address sponsorAddress) external onlyAdmin {
        if (sponsors[sponsorAddress].authority == address(0)) revert SponsorNotRegistered();
        sponsors[sponsorAddress].isWhitelisted = true;
        emit SponsorWhitelisted(sponsorAddress);
    }

    function createMarket(
        string calldata question,
        uint256 resolutionDate,
        uint256 liquidityCap,
        uint64 initialLiquidity,
        uint256 seedLiquidity
    ) external onlyWhitelisted returns (uint256 marketId) {
        if (seedLiquidity == 0) revert ZeroAmount();

        usdc.safeTransferFrom(msg.sender, address(this), seedLiquidity);

        marketId = marketCount++;
        uint64 half = initialLiquidity / 2;

        Market storage m = markets[marketId];
        m.sponsor = msg.sender;
        m.question = question;
        m.resolutionDate = resolutionDate;
        m.resolved = false;
        m.outcome = false;
        m.liquidityCap = liquidityCap;
        m.initialLiquidity = initialLiquidity;
        m.totalEscrowed = seedLiquidity;
        m.totalWinShares = 0;
        m.lastUpdateTs = block.timestamp;

        m.encYesPool = FHE.asEuint64(half);
        m.encNoPool = FHE.asEuint64(half);
        m.encTotalYesShares = FHE.asEuint64(0);
        m.encTotalNoShares = FHE.asEuint64(0);
        m.encTotalTrades = FHE.asEuint64(0);

        FHE.allowThis(m.encYesPool);
        FHE.allowThis(m.encNoPool);
        FHE.allowThis(m.encTotalYesShares);
        FHE.allowThis(m.encTotalNoShares);
        FHE.allowThis(m.encTotalTrades);
        FHE.allow(m.encYesPool, msg.sender);
        FHE.allow(m.encNoPool, msg.sender);
        FHE.allow(m.encTotalYesShares, msg.sender);
        FHE.allow(m.encTotalNoShares, msg.sender);
        FHE.allow(m.encTotalTrades, msg.sender);

        sponsors[msg.sender].totalMarketsCreated++;
        emit MarketCreated(marketId, msg.sender, question, resolutionDate, seedLiquidity);
    }

    function trade(
        uint256 marketId,
        bool isBuyYes,
        externalEuint64 encAmount,
        bytes calldata inputProof
    ) external validMarket(marketId) {
        Market storage m = markets[marketId];
        if (m.resolved) revert MarketAlreadyResolved();

        euint64 amount = FHE.fromExternal(encAmount, inputProof);
        FHE.allowThis(amount);

        ebool hasEnough = FHE.ge(encBalances[msg.sender], amount);
        euint64 safeAmount = FHE.select(hasEnough, amount, FHE.asEuint64(0));

        encBalances[msg.sender] = FHE.sub(encBalances[msg.sender], safeAmount);
        FHE.allowThis(encBalances[msg.sender]);
        FHE.allow(encBalances[msg.sender], msg.sender);

        UserPosition storage pos = positions[marketId][msg.sender];
        if (!pos.initialized) {
            pos.encYesShares = FHE.asEuint64(0);
            pos.encNoShares = FHE.asEuint64(0);
            pos.initialized = true;
            FHE.allowThis(pos.encYesShares);
            FHE.allowThis(pos.encNoShares);
            FHE.allow(pos.encYesShares, msg.sender);
            FHE.allow(pos.encNoShares, msg.sender);
            FHE.allow(pos.encYesShares, m.sponsor);
            FHE.allow(pos.encNoShares, m.sponsor);
        }

        euint128 encUpper;
        euint128 encLower;

        if (isBuyYes) {
            encUpper = FHE.mul(FHE.asEuint128(m.encYesPool), FHE.asEuint128(safeAmount));
            encLower = FHE.add(FHE.asEuint128(m.encNoPool), FHE.asEuint128(safeAmount));
        } else {
            encUpper = FHE.mul(FHE.asEuint128(m.encNoPool), FHE.asEuint128(safeAmount));
            encLower = FHE.add(FHE.asEuint128(m.encYesPool), FHE.asEuint128(safeAmount));
        }

        FHE.allowThis(encUpper);
        FHE.allowThis(encLower);
        FHE.allow(encLower, msg.sender);

        pendingTrades[msg.sender] = PendingTrade({
            marketId: marketId,
            trader: msg.sender,
            isBuyYes: isBuyYes,
            encUpper: encUpper,
            encLower: encLower,
            encAmount: safeAmount,
            exists: true
        });

        FHE.allowThis(pendingTrades[msg.sender].encUpper);
        FHE.allowThis(pendingTrades[msg.sender].encLower);
        FHE.allowThis(pendingTrades[msg.sender].encAmount);

        emit TradeQueued(marketId, msg.sender, isBuyYes);
    }

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
        uint128 plaintextLower,
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
        UserPosition storage pos = positions[pt.marketId][pt.trader];

        euint64 sharesOut = FHE.asEuint64(FHE.div(pt.encUpper, plaintextLower));
        FHE.allowThis(sharesOut);

        if (pt.isBuyYes) {
            pos.encYesShares = FHE.add(pos.encYesShares, sharesOut);
            m.encTotalYesShares = FHE.add(m.encTotalYesShares, sharesOut);
            m.encYesPool = FHE.sub(m.encYesPool, sharesOut);
            m.encNoPool = FHE.add(m.encNoPool, pt.encAmount);
            FHE.allowThis(pos.encYesShares);
            FHE.allow(pos.encYesShares, pt.trader);
            FHE.allow(pos.encYesShares, m.sponsor);
            FHE.allowThis(m.encTotalYesShares);
            FHE.allow(m.encTotalYesShares, m.sponsor);
            FHE.allowThis(m.encYesPool);
            FHE.allowThis(m.encNoPool);
            FHE.allow(m.encYesPool, m.sponsor);
            FHE.allow(m.encNoPool, m.sponsor);
        } else {
            pos.encNoShares = FHE.add(pos.encNoShares, sharesOut);
            m.encTotalNoShares = FHE.add(m.encTotalNoShares, sharesOut);
            m.encNoPool = FHE.sub(m.encNoPool, sharesOut);
            m.encYesPool = FHE.add(m.encYesPool, pt.encAmount);
            FHE.allowThis(pos.encNoShares);
            FHE.allow(pos.encNoShares, pt.trader);
            FHE.allow(pos.encNoShares, m.sponsor);
            FHE.allowThis(m.encTotalNoShares);
            FHE.allow(m.encTotalNoShares, m.sponsor);
            FHE.allowThis(m.encNoPool);
            FHE.allowThis(m.encYesPool);
            FHE.allow(m.encNoPool, m.sponsor);
            FHE.allow(m.encYesPool, m.sponsor);
        }

        m.encTotalTrades = FHE.add(m.encTotalTrades, FHE.asEuint64(1));
        FHE.allowThis(m.encTotalTrades);
        FHE.allow(m.encTotalTrades, m.sponsor);
        m.lastUpdateTs = block.timestamp;

        delete pendingTrades[msg.sender];
        emit TradeSettled(pt.marketId, pt.trader);
    }

    function requestSponsorView(uint256 marketId) external validMarket(marketId) onlySponsor(marketId) {
        Market storage m = markets[marketId];
        FHE.allow(m.encYesPool, msg.sender);
        FHE.allow(m.encNoPool, msg.sender);
        FHE.allow(m.encTotalYesShares, msg.sender);
        FHE.allow(m.encTotalNoShares, msg.sender);
        FHE.allow(m.encTotalTrades, msg.sender);
        emit SponsorViewReady(marketId, msg.sender);
    }

    function resolveMarket(
        uint256 marketId,
        bool outcome,
        uint256 totalWinningShares
    ) external validMarket(marketId) onlySponsor(marketId) {
        Market storage m = markets[marketId];
        if (m.resolved) revert MarketAlreadyResolved();
        if (block.timestamp < m.resolutionDate) revert NotPastResolutionDate();

        m.resolved = true;
        m.outcome = outcome;
        m.totalWinShares = totalWinningShares == 0 ? 1 : totalWinningShares;

        emit MarketResolved(marketId, outcome);
    }

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

    function claimPayout(
        uint256 marketId,
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
        handles[0] = m.outcome ? FHE.toBytes32(pos.encYesShares) : FHE.toBytes32(pos.encNoShares);
        FHE.checkSignatures(handles, abiEncodedCleartexts, decryptionProof);

        uint64 winningShares = abi.decode(abiEncodedCleartexts, (uint64));
        pos.claimed = true;

        uint256 payout = (uint256(winningShares) * m.totalEscrowed) / m.totalWinShares;
        if (payout > 0) {
            if (usdc.balanceOf(address(this)) < payout) revert InsufficientContractBalance();

            euint64 encPayout = FHE.asEuint64(uint64(payout));
            encBalances[msg.sender] = FHE.add(encBalances[msg.sender], encPayout);
            FHE.allowThis(encBalances[msg.sender]);
            FHE.allow(encBalances[msg.sender], msg.sender);
        }

        emit PayoutClaimed(marketId, msg.sender, winningShares, payout);
    }

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

    function getYesPoolHandle(uint256 marketId) external view validMarket(marketId) returns (bytes32) {
        return FHE.toBytes32(markets[marketId].encYesPool);
    }

    function getNoPoolHandle(uint256 marketId) external view validMarket(marketId) returns (bytes32) {
        return FHE.toBytes32(markets[marketId].encNoPool);
    }

    function getTotalYesSharesHandle(uint256 marketId) external view validMarket(marketId) returns (bytes32) {
        return FHE.toBytes32(markets[marketId].encTotalYesShares);
    }

    function getTotalNoSharesHandle(uint256 marketId) external view validMarket(marketId) returns (bytes32) {
        return FHE.toBytes32(markets[marketId].encTotalNoShares);
    }

    function getMarket(uint256 marketId) external view validMarket(marketId) returns (
        address sponsor,
        string memory question,
        uint256 resolutionDate,
        bool resolved,
        bool outcome,
        uint256 liquidityCap,
        uint256 totalEscrowed,
        uint256 totalWinShares,
        uint256 lastUpdateTs
    ) {
        Market storage m = markets[marketId];
        return (
            m.sponsor,
            m.question,
            m.resolutionDate,
            m.resolved,
            m.outcome,
            m.liquidityCap,
            m.totalEscrowed,
            m.totalWinShares,
            m.lastUpdateTs
        );
    }

    function getSponsor(address addr) external view returns (
        string memory name,
        bool isWhitelisted,
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
