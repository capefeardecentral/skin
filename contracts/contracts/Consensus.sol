// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./OrderBook.sol";

contract Consensus is OrderBook {
    event Vote(address indexed user, Tokens token, uint256 amount);

    IERC20 public skinToken;
    mapping(address => mapping(Tokens => uint)) public votes;
    uint256 public yesVotes;
    uint256 public noVotes;
    uint256 public voteStartTime;
    uint256 public voteEndTime;
    uint256 public reward;
    Tokens public consensus_winner = Tokens.NONE;

    constructor(address _skinToken, uint _voteDuration) {
        skinToken = IERC20(_skinToken);
        voteStartTime = block.timestamp;
        voteEndTime = block.timestamp + _voteDuration;
    }

    function vote(Tokens _token, uint256 _amount) external {
        require(_amount > 0, "Consensus: Cannot vote 0");
        require(
            block.timestamp >= voteStartTime,
            "Consensus: Voting has not started"
        );
        require(block.timestamp < voteEndTime, "Consensus: Voting has ended");

        skinToken.transferFrom(msg.sender, address(this), _amount);
        votes[msg.sender][_token] += _amount;
        if (_token == Tokens.YES) {
            yesVotes += _amount;
        } else {
            noVotes += _amount;
        }
        emit Vote(msg.sender, _token, _amount);
    }

    function settle() external {
        require(
            block.timestamp >= voteEndTime,
            "Consensus: Voting has not ended"
        );
        require(
            consensus_winner == Tokens.NONE,
            "Consensus: vote is already settled"
        );
        Tokens consensusResult = yesVotes > noVotes ? Tokens.YES : Tokens.NO;
        bool consensusReached = _get_consensus_reached(yesVotes, noVotes);
        if (consensusReached) {
            consensus_winner = consensusResult == Tokens.YES
                ? Tokens.YES
                : Tokens.NO;
            reward = consensus_winner == Tokens.YES
                ? _get_reward(yesVotes, noVotes)
                : _get_reward(noVotes, yesVotes);
        } else {
            // fail with error
            revert("Consensus: Consensus not reached");
        }
    }

    function claim() external {
        require(
            block.timestamp >= voteEndTime,
            "Consensus: Voting has not ended"
        );
        require(
            consensus_winner != Tokens.NONE,
            "Consensus: Consensus has not been reached"
        );
        uint256 _reward = votes[msg.sender][consensus_winner] * reward;
        skinToken.transfer(msg.sender, _reward);
        delete votes[msg.sender][consensus_winner];
    }

    function _get_consensus_reached(
        uint _winVotes,
        uint _loseVotes
    ) private pure returns (bool) {
        // no votes
        if (_winVotes == 0) {
            return false;
        }

        uint _totalVotes = _winVotes + _loseVotes;

        // set threshold to 80%
        return _winVotes * 5 >= _totalVotes * 4;
    }

    function _get_reward(
        uint _winVotes,
        uint _loseVotes
    ) private pure returns (uint) {
        // unanimous consensus
        // we don't need to check for _winVotes 0 here since we already checked for consensus
        if (_loseVotes == 0) {
            return 0;
        }

        // break down into token decimals skin erc20 has 8 decimals
        return (_loseVotes * 10 ** 8) / _winVotes;
    }

    // let's extend consensus if we can not defer to orderbook for a winner
    // this would likely happen if an outcome is not reached by the originally set voteEndTime
    function _extend_consensus(uint _duration) internal {
        require(
            block.timestamp >= voteEndTime,
            "Consensus: Voting has not ended"
        );
        require(
            consensus_winner == Tokens.NONE,
            "Consensus: vote is already settled"
        );
        voteEndTime = block.timestamp + _duration;
    }
}
