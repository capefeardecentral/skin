// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract SkinToken is ERC20 {
    constructor(uint256 initialSupply) ERC20("skin", "SKIN") {
        _mint(msg.sender, initialSupply);
    }

    // we use a smaller decimal here so we can use the layer zero labs v2 OFT proxy when we go omnichain
    function decimals() public view virtual override returns (uint8) {
        return 8;
    }
}
