// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./SyntheticTokenPair.sol";

// Uncomment this line to use console.log
// import "hardhat/console.sol";

// OrderBook is a simple order book for bid ask orders on both ends of STP
contract OrderBook is SyntheticTokenPair {
    struct Order {
        uint higher_price;
        uint lower_price;
        uint price;
        address maker;
        uint amount;
    }

    struct BidAsk {
        uint price;
        uint amount;
    }

    uint public escrow;

    mapping(Tokens => uint) public bidHead;
    mapping(Tokens => uint) public askHead;
    // best bid is the highest price someone is willing to pay for a token
    // best ask is the lowest price someone is willing to sell a token for
    mapping(Tokens => uint) public bestBidId;
    mapping(Tokens => uint) public bestAskId;
    mapping(Tokens => mapping(uint => Order)) public bids;
    mapping(Tokens => mapping(uint => Order)) public asks;

    function make_bid(Tokens _token, BidAsk memory _bid) public payable {
        require(_bid.price > 0, "Price must be greater than 0");
        require(_bid.amount > 0, "Amount must be greater than 0");
        require(msg.value == _bid.price * _bid.amount, "Value must be equal to price * amount");

        uint _bestBidId = bestBidId[_token];
        Order memory _bestBid = bids[_token][_bestBidId];

        _bid = _match_bid(_token, _bid);

        // if no bids on token
        if (_bestBidId == 0) {
            // initialize the bid book
            bidHead[_token] = 1;
            bestBidId[_token] = 1;
            bids[_token][1] = Order({
            higher_price : 0,
            lower_price : 0,
            price : _bid.price,
            maker : msg.sender,
            amount : _bid.amount
            });
            escrow += msg.value;
            bidHead[_token] += 1;
            return;
        }

        // if bid price is higher than best bid
        if (_bid.price > _bestBid.price) {
            // add bid to the top of the book
            bids[_token][bidHead[_token]] = Order({
            higher_price : 0,
            lower_price : _bestBidId,
            price : _bid.price,
            maker : msg.sender,
            amount : _bid.amount
            });

            bids[_token][bestBidId[_token]].higher_price = bidHead[_token];
            bestBidId[_token] = bidHead[_token];
            bidHead[_token] += 1;
            escrow += msg.value;
            return;
        }

        // otherwise sort and place the bid
        while (true) {
            // if bid price is lower than the current price
            if (_bid.price < _bestBid.price) {
                // if there is a lower price
                if (_bestBid.lower_price != 0) {
                    // move to the lower price
                    _bestBidId = _bestBid.lower_price;
                    _bestBid = bids[_token][_bestBid.lower_price];
                } else {
                    // otherwise add the bid to the bottom of the book
                    bids[_token][bidHead[_token]] = Order({
                    higher_price : _bestBidId,
                    lower_price : 0,
                    price : _bid.price,
                    maker : msg.sender,
                    amount : _bid.amount
                    });
                    bids[_token][_bestBidId].lower_price = bidHead[_token];
                    bidHead[_token] += 1;
                    escrow += msg.value;
                    return;
                }
            } else {
                // if bid price is less than or equal to the current price
                bids[_token][bidHead[_token]] = Order({
                higher_price : _bestBidId,
                lower_price : _bestBid.lower_price,
                price : _bid.price,
                maker : msg.sender,
                amount : _bid.amount
                });
                bids[_token][_bestBid.lower_price].higher_price = bidHead[_token];
                bids[_token][_bestBidId].lower_price = bidHead[_token];
                bidHead[_token] += 1;
                escrow += msg.value;
                return;
            }
        }
    }

    function make_ask(Tokens _token, BidAsk memory _ask) public {
        require(_ask.price > 0, "Price must be greater than 0");
        require(_ask.amount > 0, "Amount must be greater than 0");
        require(ledger[msg.sender][_token] >= _ask.amount, "Insufficient balance");

        _ask = _match_ask(_token, _ask);

        // if no asks on token
        if (bestAskId[_token] == 0) {
            // initialize the ask book
            askHead[_token] = 1;
            bestAskId[_token] = 1;
            asks[_token][1] = Order({
            higher_price : 0,
            lower_price : 0,
            price : _ask.price,
            maker : msg.sender,
            amount : _ask.amount
            });
            askHead[_token] += 1;
            return;
        }

        uint _bestAskId = bestAskId[_token];
        Order memory _bestAsk = asks[_token][_bestAskId];

        // if ask price is lower than best ask
        if (_ask.price < _bestAsk.price) {
            // add bid to the top of the book
            asks[_token][askHead[_token]] = Order({
            higher_price : _bestAskId,
            lower_price : 0,
            price : _ask.price,
            maker : msg.sender,
            amount : _ask.amount
            });

            asks[_token][bestAskId[_token]].lower_price = askHead[_token];
            bestAskId[_token] = askHead[_token];
            askHead[_token] += 1;
            return;
        }
        // otherwise sort and place the ask
        while (true) {
            // if ask price is higher than the current price
            if (_ask.price > _bestAsk.price) {
                // if there is a higher price
                if (_bestAsk.higher_price != 0) {
                    // move to the higher price
                    _bestAskId = _bestAsk.higher_price;
                    _bestAsk = asks[_token][_bestAsk.higher_price];
                } else {
                    // otherwise add the ask to the bottom of the book
                    asks[_token][askHead[_token]] = Order({
                    higher_price : 0,
                    lower_price : _bestAskId,
                    price : _ask.price,
                    maker : msg.sender,
                    amount : _ask.amount
                    });
                    asks[_token][_bestAskId].higher_price = askHead[_token];
                    askHead[_token] += 1;
                    return;
                }
            } else {
                // if ask price is more than or equal to the current price
                asks[_token][askHead[_token]] = Order({
                higher_price : _bestAsk.higher_price,
                lower_price : _bestAskId,
                price : _ask.price,
                maker : msg.sender,
                amount : _ask.amount
                });
                asks[_token][_bestAsk.higher_price].lower_price = askHead[_token];
                asks[_token][_bestAskId].higher_price = askHead[_token];
                askHead[_token] += 1;
                return;
            }
        }
    }

    function _match_ask(Tokens _token, BidAsk memory _ask) private returns (BidAsk memory) {
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
            // transfer tokens
            _transfer(msg.sender, _bestBid.maker, _token, _ask.amount);
            // transfer ether
            payable(msg.sender).transfer(_ask.amount * _bestBid.price);
            // update bid amount
            bids[_token][_bestBidId].amount -= _ask.amount;
            // update escrow
            escrow -= _ask.amount * _bestBid.price;
            // return remaining ask
            _ask.amount = 0;
            return _ask;
        } else {
            // transfer tokens
            ledger[msg.sender][_token] -= _bestBid.amount;
            ledger[_bestBid.maker][_token] += _bestBid.amount;
            // transfer ether
            payable(_bestBid.maker).transfer(_bestBid.amount * _bestBid.price);
            // update escrow
            escrow -= _bestBid.amount * _bestBid.price;
            // update ask amount
            _ask.amount -= _bestBid.amount;
            // remove bid from book
            delete (bids[_token][_bestBidId]);
            // update best bid
            bestBidId[_token] = _bestBid.lower_price;
            // return remaining ask
            return _match_ask(_token, _ask);
        }
    }

    function _match_bid(Tokens _token, BidAsk memory _bid) private returns (BidAsk memory) {
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
            // update escrow
            escrow -= _bid.amount * _bid.price;
            // return remaining bid
            _bid.amount = 0;
            return _bid;
        } else {
            // transfer tokens
            _transfer(_bestAsk.maker, msg.sender, _token, _bestAsk.amount);
            // transfer ether
            payable(_bestAsk.maker).transfer(_bestAsk.amount * _bid.price);
            // update escrow
            escrow -= _bestAsk.amount * _bid.price;
            // update bid amount
            _bid.amount -= _bestAsk.amount;
            // remove ask from book
            delete (asks[_token][_bestAskId]);
            // update best ask
            bestAskId[_token] = _bestAsk.higher_price;
            // return remaining bid
            return _match_bid(_token, _bid);
        }
    }

    function _match_token_pair_bids(Tokens _token, BidAsk memory _bid) private returns (BidAsk memory) {
        Tokens _otherToken = _token == Tokens.YES ? Tokens.NO : Tokens.YES;

        uint _bestBidId = bestBidId[_otherToken];
        Order memory _bestBid = bids[_otherToken][_bestBidId];
        uint _targetPrice = token_price - _bid.price;

        if (_bestBid.price < _targetPrice) {
            return _bid;
        }

        MintPairAddrs memory _pair = MintPairAddrs({
        noAddr : _token == Tokens.NO ? msg.sender : _bestBid.maker,
        yesAddr : _token == Tokens.YES ? msg.sender : _bestBid.maker
        });

        if (_bestBid.amount > _bid.amount) {
            // mint tokens
            _mint(_pair, _bid.amount);
            _bid.amount = 0;
            bids[_otherToken][_bestBidId].amount -= _bid.amount;
        }

        _mint(_pair, _bestBid.amount);
        _bid.amount -= _bestBid.amount;
        bestBidId[_otherToken] = _bestBid.lower_price;
        bids[_otherToken][_bestBid.lower_price].higher_price = 0;
        delete (bids[_otherToken][_bestBidId]);

        if (_bid.amount != 0) {
            return _match_token_pair_bids(_token, _bid);
        }

        return _bid;
    }

}