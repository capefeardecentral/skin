// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./OrderBook.sol";

contract Consensus is OrderBook {
    event Vote(address indexed user, Tokens token, uint256 amount);

    IERC20 public skinToken;
    mapping (address => mapping(Tokens => uint)) public votes;
    uint256 public totalVotes;
    uint256 public yesVotes;
    uint256 public noVotes;
    uint256 public voteStartTime;
    uint256 public voteEndTime;
    uint256 public reward;
    Tokens public winner = Tokens.NONE;

    constructor(address _skinToken, uint _voteDuration) {
        skinToken = IERC20(_skinToken);
        voteStartTime = block.timestamp;
        voteEndTime = block.timestamp + _voteDuration;
    }

    function vote(Tokens _token, uint256 _amount) external {
        require(_amount > 0, "Consensus: Cannot vote 0");
        require(block.timestamp >= voteStartTime, "Consensus: Voting has not started");
        require(block.timestamp < voteEndTime, "Consensus: Voting has ended");

        skinToken.transferFrom(msg.sender, address(this), _amount);
        votes[msg.sender][_token] += _amount;
        totalVotes += _amount;
        if (_token == Tokens.YES) {
            yesVotes += _amount;
        } else {
            noVotes += _amount;
        }
        emit Vote(msg.sender, _token, _amount);
    }

    function settle() external {
        require(block.timestamp >= voteEndTime, "Consensus: Voting has not ended");
        require(winner == Tokens.NONE, "Consensus: vote is already settled");
        Tokens consensusResult = yesVotes > noVotes ? Tokens.YES : Tokens.NO;
        winner = consensusResult == Tokens.YES ? Tokens.YES : Tokens.NO;
        reward = winner == Tokens.YES ? get_reward(yesVotes, noVotes) : get_reward(noVotes, yesVotes);
    }

    function claim() external {
        require(block.timestamp >= voteEndTime, "Consensus: Voting has not ended");
        require(winner != Tokens.NONE, "Consensus: Consensus has not been reached");
        uint256 _reward = votes[msg.sender][winner] * reward;
        skinToken.transfer(msg.sender, _reward);
        delete votes[msg.sender][winner];
    }

    function get_reward(uint _winVotes, uint _loseVotes) internal pure returns (uint) {
        if (_loseVotes == 0) {
            return 0;
        }

        uint _reward = _winVotes / _loseVotes;
        return _reward;
    }
}