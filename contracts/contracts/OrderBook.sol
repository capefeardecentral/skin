// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import {SyntheticTokenPair} from "./SyntheticTokenPair.sol";

// Uncomment this line to use console.log
// import "hardhat/console.sol";

// OrderBook is a simple order book for bid ask orders on both ends of STP
contract OrderBook is SyntheticTokenPair {
    event BidPlaced(Tokens token, uint price, uint amount, address maker);
    event BidCanceled(Tokens token, uint bidId);
    event AskPlaced(Tokens token, uint price, uint amount, address maker);
    event AskCanceled(Tokens token, uint askId);
    event OrderMatched(
        Tokens token,
        uint price,
        uint amount,
        address maker,
        address taker
    );

    struct Order {
        uint higherPrice;
        uint lowerPrice;
        uint price;
        address maker;
        uint amount;
    }

    struct BidAsk {
        uint price;
        uint amount;
    }

    // escrow is the funds held for orders in orderbook
    // funds are either returned to maker or transferred to taker
    // when a symmetric order is matched and tokens are minted funds are tracked in the prizePool var
    uint public escrow;
    uint public prizePool;
    // price for a token pair (amount paid to winner)
    uint public tokenPrice = 20000;

    mapping(Tokens => uint) public bidHead;
    mapping(Tokens => uint) public askHead;
    // best bid is the highest price someone is willing to pay for a token
    // best ask is the lowest price someone is willing to sell a token for
    mapping(Tokens => uint) public bestBidId;
    mapping(Tokens => uint) public bestAskId;
    mapping(Tokens => mapping(uint => Order)) public bids;
    mapping(Tokens => mapping(uint => Order)) public asks;

    constructor() {
        escrow = 0;
        bidHead[Tokens.NO] = 1;
        bidHead[Tokens.YES] = 1;
        askHead[Tokens.NO] = 1;
        askHead[Tokens.YES] = 1;
    }

    function makeBid(Tokens _token, BidAsk memory _bid) public payable {
        require(_bid.price > 0, "Price must be greater than 0");
        require(_bid.amount > 0, "Amount must be greater than 0");
        require(msg.value == _bid.price * _bid.amount, "Insufficient funds");

        uint _bestBidId = bestBidId[_token];
        Order memory _bestBid = bids[_token][_bestBidId];

        // match asks
        _bid = _matchBid(_token, _bid);
        // check to mint pair
        _bid = _matchTokenPairBids(_token, _bid);

        // if we settled the bid return
        if (_bid.amount == 0) {
            return;
        }

        // if no bids on token
        if (_bestBidId == 0) {
            // initialize the bid book
            bestBidId[_token] = bidHead[_token];
            bids[_token][bidHead[_token]] = Order({
                higherPrice: 0,
                lowerPrice: 0,
                price: _bid.price,
                maker: msg.sender,
                amount: _bid.amount
            });
            escrow += _bid.amount * _bid.price;
            bidHead[_token] += 1;
            emit BidPlaced(_token, _bid.price, _bid.amount, msg.sender);
            return;
        }

        // if bid price is higher than best bid
        if (_bid.price > _bestBid.price) {
            // add bid to the top of the book
            bids[_token][bidHead[_token]] = Order({
                higherPrice: 0,
                lowerPrice: _bestBidId,
                price: _bid.price,
                maker: msg.sender,
                amount: _bid.amount
            });

            bids[_token][bestBidId[_token]].higherPrice = bidHead[_token];
            bestBidId[_token] = bidHead[_token];
            bidHead[_token] += 1;
            escrow += _bid.amount * _bid.price;
            emit BidPlaced(_token, _bid.price, _bid.amount, msg.sender);
            return;
        }

        // otherwise sort and place the bid
        while (true) {
            // if bid price is lower than the current price
            if (_bid.price <= _bestBid.price) {
                // if there is a lower price
                if (_bestBid.lowerPrice != 0) {
                    // move to the lower price
                    _bestBidId = _bestBid.lowerPrice;
                    _bestBid = bids[_token][_bestBid.lowerPrice];
                } else {
                    // otherwise add the bid to the bottom of the book
                    bids[_token][bidHead[_token]] = Order({
                        higherPrice: _bestBidId,
                        lowerPrice: 0,
                        price: _bid.price,
                        maker: msg.sender,
                        amount: _bid.amount
                    });
                    bids[_token][_bestBidId].lowerPrice = bidHead[_token];
                    bidHead[_token] += 1;
                    escrow += msg.value;
                    emit BidPlaced(_token, _bid.price, _bid.amount, msg.sender);
                    return;
                }
            } else {
                // if bid price is greater than the current price
                bids[_token][bidHead[_token]] = Order({
                    higherPrice: _bestBid.higherPrice,
                    lowerPrice: _bestBidId,
                    price: _bid.price,
                    maker: msg.sender,
                    amount: _bid.amount
                });
                bids[_token][_bestBid.higherPrice].lowerPrice = bidHead[_token];
                bids[_token][_bestBidId].higherPrice = bidHead[_token];
                bidHead[_token] += 1;
                escrow += msg.value;
                emit BidPlaced(_token, _bid.price, _bid.amount, msg.sender);
                return;
            }
        }
    }

    function makeAsk(Tokens _token, BidAsk memory _ask) public {
        require(_ask.price > 0, "Price must be greater than 0");
        require(_ask.amount > 0, "Amount must be greater than 0");
        require(
            ledger[msg.sender][_token] >= _ask.amount,
            "Insufficient balance"
        );

        _ask = _matchAsk(_token, _ask);

        if (_ask.amount == 0) {
            return;
        }

        // if no asks on token
        if (bestAskId[_token] == 0) {
            // initialize the ask book
            bestAskId[_token] = askHead[_token];
            asks[_token][askHead[_token]] = Order({
                higherPrice: 0,
                lowerPrice: 0,
                price: _ask.price,
                maker: msg.sender,
                amount: _ask.amount
            });
            askHead[_token] += 1;
            emit AskPlaced(_token, _ask.price, _ask.amount, msg.sender);
            return;
        }

        uint _bestAskId = bestAskId[_token];
        Order memory _bestAsk = asks[_token][_bestAskId];

        // if ask price is lower than best ask
        if (_ask.price < _bestAsk.price) {
            // add bid to the top of the book
            asks[_token][askHead[_token]] = Order({
                higherPrice: _bestAskId,
                lowerPrice: 0,
                price: _ask.price,
                maker: msg.sender,
                amount: _ask.amount
            });

            asks[_token][bestAskId[_token]].lowerPrice = askHead[_token];
            bestAskId[_token] = askHead[_token];
            askHead[_token] += 1;
            emit AskPlaced(_token, _ask.price, _ask.amount, msg.sender);
            return;
        }
        // otherwise sort and place the ask
        while (true) {
            // if ask price is higher than the current price
            if (_ask.price >= _bestAsk.price) {
                // if there is a higher price
                if (_bestAsk.higherPrice != 0) {
                    // move to the higher price
                    _bestAskId = _bestAsk.higherPrice;
                    _bestAsk = asks[_token][_bestAsk.higherPrice];
                } else {
                    // otherwise add the ask to the bottom of the book
                    asks[_token][askHead[_token]] = Order({
                        higherPrice: 0,
                        lowerPrice: _bestAskId,
                        price: _ask.price,
                        maker: msg.sender,
                        amount: _ask.amount
                    });
                    asks[_token][_bestAskId].higherPrice = askHead[_token];
                    askHead[_token] += 1;
                    emit AskPlaced(_token, _ask.price, _ask.amount, msg.sender);
                    return;
                }
            } else {
                // if ask price is less than to the current price
                asks[_token][askHead[_token]] = Order({
                    higherPrice: _bestAskId,
                    lowerPrice: asks[_token][_bestAskId].lowerPrice,
                    price: _ask.price,
                    maker: msg.sender,
                    amount: _ask.amount
                });
                asks[_token][_bestAsk.lowerPrice].higherPrice = askHead[_token];
                asks[_token][_bestAskId].lowerPrice = askHead[_token];
                askHead[_token] += 1;
                emit AskPlaced(_token, _ask.price, _ask.amount, msg.sender);
                return;
            }
        }
    }

    function takeAsk(Tokens _token, uint _askId) public payable {
        Order memory _ask = asks[_token][_askId];
        require(_ask.amount > 0, "ask does not exist");
        require(_ask.price * _ask.amount == msg.value, "insufficient funds");
        _transfer(_ask.maker, msg.sender, _token, _ask.amount);

        if (_ask.lowerPrice != 0) {
            asks[_token][_ask.lowerPrice].higherPrice = _ask.higherPrice;
        } else {
            bestAskId[_token] = _ask.higherPrice;
        }

        if (_ask.higherPrice != 0) {
            asks[_token][_ask.higherPrice].lowerPrice = _ask.lowerPrice;
        }

        delete asks[_token][_askId];
        emit OrderMatched(
            _token,
            _ask.price,
            _ask.amount,
            _ask.maker,
            msg.sender
        );
        payable(_ask.maker).transfer(msg.value);
    }

    function cancelAsk(Tokens _token, uint _askId) public {
        require(asks[_token][_askId].maker == msg.sender, "not your ask");
        delete asks[_token][_askId];
        emit AskCanceled(_token, _askId);
    }

    function takeBid(Tokens _token, uint _bidId) public {
        Order memory _bid = bids[_token][_bidId];
        uint _price = _bid.price * _bid.amount;
        require(_bid.amount > 0, "bid does not exist");
        require(
            ledger[msg.sender][_token] >= _bid.amount,
            "insufficient tokens"
        );
        _transfer(msg.sender, _bid.maker, _token, _bid.amount);
        escrow -= _price;

        if (_bid.higherPrice != 0) {
            bids[_token][_bid.higherPrice].lowerPrice = _bid.lowerPrice;
        } else {
            bestBidId[_token] = _bid.lowerPrice;
        }

        if (_bid.lowerPrice != 0) {
            bids[_token][_bid.lowerPrice].higherPrice = _bid.higherPrice;
        }

        delete bids[_token][_bidId];
        emit OrderMatched(
            _token,
            _bid.price,
            _bid.amount,
            _bid.maker,
            msg.sender
        );
        payable(msg.sender).transfer(_price);
    }

    function cancelBid(Tokens _token, uint _bidId) public {
        require(bids[_token][_bidId].maker == msg.sender, "not your bid");
        uint _refund = bids[_token][_bidId].price * bids[_token][_bidId].amount;
        delete bids[_token][_bidId];
        escrow -= _refund;
        emit BidCanceled(_token, _bidId);
        payable(msg.sender).transfer(_refund);
    }

    /* solhint-disable reentrancy */
    function _matchAsk(
        Tokens _token,
        BidAsk memory _ask
    ) private returns (BidAsk memory) {
        uint _bestBidId = bestBidId[_token];
        Order memory _bestBid = bids[_token][_bestBidId];

        // if no bids on token
        if (bestBidId[_token] == 0) {
            return _ask;
        }

        if (_bestBid.price < _ask.price) {
            return _ask;
        }

        // if bid price is higher than ask price
        if (_ask.amount < _bestBid.amount) {
            // update bid amount
            bids[_token][_bestBidId].amount -= _ask.amount;
            // update escrow
            escrow -= _ask.amount * _bestBid.price;
            // transfer tokens
            _transfer(msg.sender, _bestBid.maker, _token, _ask.amount);
            // transfer ether
            payable(msg.sender).transfer(_ask.amount * _bestBid.price);
            // return remaining ask
            _ask.amount = 0;
            emit OrderMatched(
                _token,
                _ask.price,
                _ask.amount,
                _bestBid.maker,
                msg.sender
            );
            return _ask;
        } else {
            // transfer tokens
            ledger[msg.sender][_token] -= _bestBid.amount;
            ledger[_bestBid.maker][_token] += _bestBid.amount;
            // update escrow
            escrow -= _bestBid.amount * _bestBid.price;
            // update ask amount
            _ask.amount -= _bestBid.amount;
            // remove bid from book
            delete (bids[_token][_bestBidId]);
            // update best bid
            bestBidId[_token] = _bestBid.lowerPrice;
            // return remaining ask
            // transfer ether
            payable(_bestBid.maker).transfer(_bestBid.amount * _bestBid.price);
            emit OrderMatched(
                _token,
                _ask.price,
                _ask.amount,
                _bestBid.maker,
                msg.sender
            );
            return _matchAsk(_token, _ask);
        }
    }

    /* solhint-enable reentrancy */

    // TODO
    // add no re-entrant since can't modify state first due to recursion
    // maybe batch transfer at end of loop?
    /* solhint-disable reentrancy */
    function _matchBid(
        Tokens _token,
        BidAsk memory _bid
    ) private returns (BidAsk memory) {
        uint _bestAskId = bestAskId[_token];
        Order memory _bestAsk = asks[_token][_bestAskId];

        // if no asks on token
        if (bestAskId[_token] == 0) {
            return _bid;
        }

        if (_bestAsk.price > _bid.price) {
            return _bid;
        }

        // if ask price is lower than bid price
        if (_bid.amount <= _bestAsk.amount) {
            // transfer tokens
            _transfer(_bestAsk.maker, msg.sender, _token, _bid.amount);
            // transfer ether
            payable(_bestAsk.maker).transfer(_bid.amount * _bid.price);
            // update ask amount
            asks[_token][_bestAskId].amount -= _bid.amount;
            // return remaining bid
            if (_bid.amount == _bestAsk.amount) {
                delete (asks[_token][_bestAskId]);
                bestAskId[_token] = _bestAsk.higherPrice;
            }
            _bid.amount = 0;
            emit OrderMatched(
                _token,
                _bid.price,
                _bid.amount,
                _bestAsk.maker,
                msg.sender
            );
            return _bid;
        } else {
            // transfer tokens
            _transfer(_bestAsk.maker, msg.sender, _token, _bestAsk.amount);
            // transfer ether
            payable(_bestAsk.maker).transfer(_bestAsk.amount * _bid.price);
            // update bid amount
            _bid.amount -= _bestAsk.amount;
            // remove ask from book
            delete (asks[_token][_bestAskId]);
            // update best ask
            bestAskId[_token] = _bestAsk.higherPrice;
            emit OrderMatched(
                _token,
                _bid.price,
                _bid.amount,
                _bestAsk.maker,
                msg.sender
            );
            // return remaining bid
            return _matchBid(_token, _bid);
        }
    }

    /* solhint-enable reentrancy */

    function _matchTokenPairBids(
        Tokens _token,
        BidAsk memory _bid
    ) private returns (BidAsk memory) {
        Tokens _otherToken = _token == Tokens.YES ? Tokens.NO : Tokens.YES;

        uint _bestBidId = bestBidId[_otherToken];
        Order memory _bestBid = bids[_otherToken][_bestBidId];
        uint _targetPrice = tokenPrice - _bid.price;

        if (_bestBid.price < _targetPrice) {
            return _bid;
        }

        MintPairAddrs memory _pair = MintPairAddrs({
            noAddr: _token == Tokens.NO ? msg.sender : _bestBid.maker,
            yesAddr: _token == Tokens.YES ? msg.sender : _bestBid.maker
        });

        if (_bestBid.amount > _bid.amount) {
            // mint tokens
            _mint(_pair, _bid.amount);
            prizePool += _bid.amount * tokenPrice;
            escrow -= _bestBid.price * _bid.amount;
            _bid.amount = 0;
            bids[_otherToken][_bestBidId].amount -= _bid.amount;
            return _bid;
        }

        _mint(_pair, _bestBid.amount);
        prizePool += _bestBid.amount * tokenPrice;
        escrow -= _bestBid.price * _bestBid.amount;
        _bid.amount -= _bestBid.amount;
        bestBidId[_otherToken] = _bestBid.lowerPrice;
        bids[_otherToken][_bestBid.lowerPrice].higherPrice = 0;
        delete (bids[_otherToken][_bestBidId]);

        if (_bid.amount != 0) {
            return _matchTokenPairBids(_token, _bid);
        }

        return _bid;
    }
}
