// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

// Uncomment this line to use console.log
// import "hardhat/console.sol";

// SyntheticTokenPair is a simplified ERC-721 non fungible token pair representing a boolean outcome of a prediction market.
contract SyntheticTokenPair {
    event Mint(address indexed to, uint256 amount, Tokens token);

    enum Tokens {
        NO,
        YES,
        NONE
    }

    struct MintPairAddrs {
        address noAddr;
        address yesAddr;
    }

    mapping(address => mapping(Tokens => uint256)) public ledger;
    uint public pairsMinted;

    function _mint(MintPairAddrs memory to, uint256 amount) internal {
        ledger[to.noAddr][Tokens.NO] += amount;
        ledger[to.yesAddr][Tokens.YES] += amount;
        pairsMinted += amount;
        emit Mint(to.noAddr, amount, Tokens.NO);
        emit Mint(to.yesAddr, amount, Tokens.YES);
    }

    function _transfer(
        address from,
        address to,
        Tokens token,
        uint256 amount
    ) internal {
        require(ledger[from][token] >= amount, "Insufficient balance");
        ledger[from][token] -= amount;
        ledger[to][token] += amount;
    }
}
