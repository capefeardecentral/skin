// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Staking {
    IERC20 public skinToken;

    mapping(address => uint256) public stakedBalance;
    // TODO track staked tokens being used as a validator and prevent withdrawal on those tokens

    constructor(address _skinToken) {
        skinToken = IERC20(_skinToken);
    }

    function stake(uint256 _amount) external {
        require(_amount > 0, "Staking: Cannot stake 0");
        skinToken.transferFrom(msg.sender, address(this), _amount);
        stakedBalance[msg.sender] += _amount;
    }

    function unstake(uint256 _amount) external {
        require(_amount > 0, "Staking: Cannot unstake 0");
        require(stakedBalance[msg.sender] >= _amount, "Staking: Insufficient balance");
        skinToken.transfer(msg.sender, _amount);
        stakedBalance[msg.sender] -= _amount;
    }
}