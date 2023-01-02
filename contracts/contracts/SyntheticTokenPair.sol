// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

// Uncomment this line to use console.log
// import "hardhat/console.sol";

// SyntheticTokenPair is a simplified ERC-721 non fungible token pair representing a boolean outcome of a prediction market.
contract SyntheticTokenPair {
    enum Tokens {
        NO,
        YES
    }

    struct MintPairAddrs {
        address noAddr;
        address yesAddr;
    }

    mapping(address => mapping(Tokens => uint256)) public ledger;
    uint public pairs_minted;
    uint public token_price;

    function _mint(MintPairAddrs memory to, uint256 amount) internal {
        ledger[to.noAddr][Tokens.NO] += amount;
        ledger[to.yesAddr][Tokens.YES] += amount;
        pairs_minted += amount;
    }

    function _transfer(address from, address to, Tokens token, uint256 amount) internal {
        require(ledger[from][token] >= amount, "Insufficient balance");
        ledger[from][token] -= amount;
        ledger[to][token] += amount;
    }

}
