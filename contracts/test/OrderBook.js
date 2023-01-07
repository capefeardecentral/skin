const {
  loadFixture,
} = require('@nomicfoundation/hardhat-network-helpers');
const {anyValue} = require('@nomicfoundation/hardhat-chai-matchers/withArgs');
const {expect} = require('chai');

describe('OrderBook', () => {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployOrderBook() {
    // Contracts are deployed using the first signer/account by default
    const [owner, bob, alice, charles] = await ethers.getSigners();

    const OrderBook = await ethers.getContractFactory('OrderBook');
    const orderBook = await OrderBook.deploy();

    return {orderBook, owner, bob, alice, charles};
  }

  async function deployOrderBookWithOrders() {
    // Contracts are deployed using the first signer/account by default
    const [owner, bob, alice, charles] = await ethers.getSigners();

    const OrderBook = await ethers.getContractFactory('OrderBook');
    const orderBook = await OrderBook.deploy();
    await orderBook.connect(bob).make_bid(0, {price: 10000, amount: 5}, {value: 50000});
    await orderBook.connect(alice).make_bid(1, {price: 10000, amount: 5}, {value: 50000});

    return {orderBook, owner, bob, alice, charles};

  }

  describe('Deployment', () => {
    it('Should successfully deploy', async () => {
      const {orderBook} = await loadFixture(deployOrderBook);
      expect(await orderBook.address).to.exist;
    });
  });
  describe('make_bid()', () => {
    it('rejects a bid if not enough funds are sent', async () => {
      const {orderBook, bob} = await loadFixture(deployOrderBook);
      await expect(orderBook.connect(bob).make_bid(0, {price: 10000, amount: 5}, {value: 40000})).to.be.reverted;
    });

    it('rejects a bid if too many funds are sent', async () => {
      const {orderBook, bob} = await loadFixture(deployOrderBook);
      await expect(orderBook.connect(bob).make_bid(0, {price: 10000, amount: 5}, {value: 60000})).to.be.reverted;
    });


    it('rejects a bid with amount 0', async () => {
      const {orderBook, bob} = await loadFixture(deployOrderBook);
      await expect(orderBook.connect(bob).make_bid(0, {price: 10000, amount: 0}, {value: 10000})).to.be.reverted;
    });

    it('rejects a bid with price 0', async () => {
      const {orderBook, bob} = await loadFixture(deployOrderBook);
      await expect(orderBook.connect(bob).make_bid(0, {price: 0, amount: 5}, {value: 0})).to.be.reverted;
    });

    it('creates an initial bid', async () => {
      const {orderBook, bob} = await loadFixture(deployOrderBook);
      await orderBook.connect(bob).make_bid(0, {price: 10000, amount: 5}, {value: 50000});

      expect(await orderBook.escrow()).to.equal(50000);
      expect(await orderBook.bestBidId(0)).to.equal(1);
      expect(await orderBook.bidHead(0)).to.equal(2);

      // check bid ledger
      const {higher_price, lower_price, price, maker, amount} = await orderBook.bids(0, 1);
      expect(higher_price).to.equal(0);
      expect(lower_price).to.equal(0);
      expect(price).to.equal(10000);
      expect(maker).to.equal(bob.address);
      expect(amount).to.equal(5);
    });

    it('creates a bid after an initial bid is taken', async () => {
      const {orderBook, bob, charles} = await loadFixture(deployOrderBookWithOrders);
      await orderBook.connect(bob).make_ask(0, {price: 11000, amount: 2});
      await orderBook.connect(charles).make_bid(0, {price: 11000, amount: 2}, {value: 22000});
      await orderBook.connect(bob).make_bid(0, {price: 11000, amount: 2}, {value: 22000});

      const newBid = await orderBook.bids(0, 2);
      const oldBid = await orderBook.bids(0, 1);

      expect(newBid.higher_price).to.equal(0);
      expect(newBid.lower_price).to.equal(0);
      expect(await orderBook.bestBidId(0)).to.equal(2);
      expect(await orderBook.bidHead(0)).to.equal(3);
    });

    it('creates creates a bid after not finding a matching ask', async () => {
      const {orderBook, bob, charles} = await loadFixture(deployOrderBookWithOrders);
      await orderBook.connect(bob).make_ask(0, {price: 11000, amount: 2});
      await orderBook.connect(charles).make_bid(0, {price: 10000, amount: 2}, {value: 20000});
      const charlesBid = await orderBook.bids(0, 2);

      expect(charlesBid.higher_price).to.equal(0);
      expect(charlesBid.lower_price).to.equal(0);
      expect(await orderBook.bestBidId(0)).to.equal(2);
      expect(await orderBook.bidHead(0)).to.equal(3);
    });

    it('places a higher bid', async () => {
      const {orderBook, bob, alice} = await loadFixture(deployOrderBook);
      await orderBook.connect(bob).make_bid(0, {price: 10000, amount: 5}, {value: 50000});
      await orderBook.connect(alice).make_bid(0, {price: 11000, amount: 5}, {value: 55000});

      expect(await orderBook.escrow()).to.equal(105000);
      expect(await orderBook.bestBidId(0)).to.equal(2);
      expect(await orderBook.bidHead(0)).to.equal(3);

      const bobsBid = await orderBook.bids(0, 1);
      const alicesBid = await orderBook.bids(0, 2);

      expect(bobsBid.higher_price).to.equal(2);
      expect(bobsBid.lower_price).to.equal(0);
      expect(alicesBid.higher_price).to.equal(0);
      expect(alicesBid.lower_price).to.equal(1);
    });

    it('sorts a bid between high and low', async () => {
      const {orderBook, bob, alice, charles} = await loadFixture(deployOrderBook);
      await orderBook.connect(bob).make_bid(0, {price: 10000, amount: 5}, {value: 50000});
      await orderBook.connect(alice).make_bid(0, {price: 11000, amount: 5}, {value: 55000});
      await orderBook.connect(charles).make_bid(0, {price: 10500, amount: 5}, {value: 52500});

      expect(await orderBook.escrow()).to.equal(157500);
      expect(await orderBook.bestBidId(0)).to.equal(2);
      expect(await orderBook.bidHead(0)).to.equal(4);

      const bobsBid = await orderBook.bids(0, 1);
      const alicesBid = await orderBook.bids(0, 2);
      const charlesBid = await orderBook.bids(0, 3);

      expect(bobsBid.higher_price).to.equal(3);
      expect(bobsBid.lower_price).to.equal(0);
      expect(alicesBid.higher_price).to.equal(0);
      expect(alicesBid.lower_price).to.equal(3);
      expect(charlesBid.higher_price).to.equal(2);
      expect(charlesBid.lower_price).to.equal(1);
    });

    it('sorts a matching bid under the existing bid', async () => {
      const {orderBook, bob, alice} = await loadFixture(deployOrderBook);
      await orderBook.connect(bob).make_bid(0, {price: 10000, amount: 5}, {value: 50000});
      await orderBook.connect(alice).make_bid(0, {price: 10000, amount: 5}, {value: 50000});

      expect(await orderBook.escrow()).to.equal(100000);
      expect(await orderBook.bestBidId(0)).to.equal(1);
      expect(await orderBook.bidHead(0)).to.equal(3);

      const bobsBid = await orderBook.bids(0, 1);
      const alicesBid = await orderBook.bids(0, 2);

      expect(bobsBid.higher_price).to.equal(0);
      expect(bobsBid.lower_price).to.equal(2);
      expect(alicesBid.higher_price).to.equal(1);
      expect(alicesBid.lower_price).to.equal(0);
    });
  });

  describe('match_token_pair_bids()', () => {
    it('mints a token pair for symmetric bids', async () => {
      const {orderBook, bob, alice} = await loadFixture(deployOrderBook);
      await orderBook.connect(bob).make_bid(0, {price: 10000, amount: 5}, {value: 50000});
      await orderBook.connect(alice).make_bid(1, {price: 10000, amount: 5}, {value: 50000});

      // TODO I think we should split out escrow and token pool
      // expect(await orderBook.escrow()).to.equal(0);
      expect(await orderBook.ledger(bob.address, 0)).to.equal(5);
      expect(await orderBook.ledger(alice.address, 1)).to.equal(5);
      expect(await orderBook.bestBidId(0)).to.equal(0);
      expect(await orderBook.bestBidId(1)).to.equal(0);
      expect(await orderBook.bidHead(1)).to.equal(1);
      expect(await orderBook.bidHead(0)).to.equal(2);
    });

    it('mints a token pair for a partial bid match less than', async () => {
      const {orderBook, bob, alice} = await loadFixture(deployOrderBook);
      await orderBook.connect(bob).make_bid(0, {price: 10000, amount: 5}, {value: 50000});
      await orderBook.connect(alice).make_bid(1, {price: 10000, amount: 3}, {value: 30000});

      // TODO I think we should split out escrow and token pool
      // expect(await orderBook.escrow()).to.equal(0);
      expect(await orderBook.ledger(bob.address, 0)).to.equal(3);
      expect(await orderBook.ledger(alice.address, 1)).to.equal(3);
      expect(await orderBook.bestBidId(0)).to.equal(1);
      expect(await orderBook.bestBidId(1)).to.equal(0);
      expect(await orderBook.bidHead(0)).to.equal(2);
      expect(await orderBook.bidHead(1)).to.equal(1);
    });

    it('mints a token pair for a partial bid match greater than', async () => {
      const {orderBook, bob, alice} = await loadFixture(deployOrderBook);
      await orderBook.connect(bob).make_bid(0, {price: 10000, amount: 5}, {value: 50000});
      await orderBook.connect(alice).make_bid(1, {price: 10000, amount: 8}, {value: 80000});
      const alicesBid = await orderBook.bids(1, 1);

      // TODO I think we should split out escrow and token pool
      // expect(await orderBook.escrow()).to.equal(0);
      expect(await orderBook.ledger(bob.address, 0)).to.equal(5);
      expect(await orderBook.ledger(alice.address, 1)).to.equal(5);
      expect(await orderBook.bestBidId(0)).to.equal(0);
      expect(await orderBook.bestBidId(1)).to.equal(1);
      expect(await orderBook.bidHead(0)).to.equal(2);
      expect(await orderBook.bidHead(1)).to.equal(2);
      expect(alicesBid.amount).to.equal(3);
      expect(alicesBid.price).to.equal(10000);
    });

    it('does not create a bid if settled', async () => {
      const {orderBook, bob, alice} = await loadFixture(deployOrderBook);
      await orderBook.connect(bob).make_bid(0, {price: 10000, amount: 5}, {value: 50000});
      await orderBook.connect(alice).make_bid(1, {price: 10000, amount: 5}, {value: 50000});

      expect(await orderBook.bidHead(0)).to.equal(2);
    });
  });

  describe('make_ask', async () => {
    it('rejects an ask with price not greater than 0', async () => {
      const {orderBook, bob} = await loadFixture(deployOrderBookWithOrders);
      expect(orderBook.connect(bob).make_ask(0, {price: 0, amount: 5})).to.be.reverted;
    });

    it('rejects an ask with amount not greater than 0', async () => {
      const {orderBook, bob} = await loadFixture(deployOrderBookWithOrders);
      expect(orderBook.connect(bob).make_ask(0, {price: 10000, amount: 0})).to.be.reverted;
    });

    it('rejects an ask with insufficent token balance', async () => {
      const {orderBook, bob} = await loadFixture(deployOrderBookWithOrders);
      expect(orderBook.connect(bob).make_ask(0, {price: 10000, amount: 10})).to.be.reverted;
    });

    it('allows a user to place an unmatched ask', async () => {
      const {orderBook, bob} = await loadFixture(deployOrderBookWithOrders);
      await orderBook.connect(bob).make_ask(0, {price: 11000, amount: 5});

      expect(await orderBook.bestAskId(0)).to.equal(1);
      expect(await orderBook.askHead(0)).to.equal(2);
      const {higher_price, lower_price, price, maker, amount} = await orderBook.asks(0, 1);
      expect(higher_price).to.equal(0);
      expect(lower_price).to.equal(0);
      expect(price).to.equal(11000);
      expect(maker).to.equal(bob.address);
      expect(amount).to.equal(5);
    });

    it('allows a user to place an unmatched ask - existing bid', async () => {
      const {orderBook, bob, alice} = await loadFixture(deployOrderBookWithOrders);
      await orderBook.connect(alice).make_bid(0, {price: 10000, amount: 5}, {value: 50000});
      await orderBook.connect(bob).make_ask(0, {price: 11000, amount: 5});

      expect(await orderBook.bestAskId(0)).to.equal(1);
      expect(await orderBook.askHead(0)).to.equal(2);
      const {higher_price, lower_price, price, maker, amount} = await orderBook.asks(0, 1);
      expect(higher_price).to.equal(0);
      expect(lower_price).to.equal(0);
      expect(price).to.equal(11000);
      expect(maker).to.equal(bob.address);
      expect(amount).to.equal(5);
    });


    it('allows a user to place a better ask', async () => {
      const {orderBook, bob} = await loadFixture(deployOrderBookWithOrders);
      await orderBook.connect(bob).make_ask(0, {price: 11000, amount: 3});
      await orderBook.connect(bob).make_ask(0, {price: 10500, amount: 2});
      const higherAsk = await orderBook.asks(0, 1);
      const lowerAsk = await orderBook.asks(0, 2);
      expect(await orderBook.bestAskId(0)).to.equal(2);
      expect(lowerAsk.higher_price).to.equal(1);
      expect(lowerAsk.lower_price).to.equal(0);
      expect(higherAsk.higher_price).to.equal(0);
      expect(higherAsk.lower_price).to.equal(2);
    });

    it('allows a user to place a worse ask', async () => {
      const {orderBook, bob} = await loadFixture(deployOrderBookWithOrders);
      await orderBook.connect(bob).make_ask(0, {price: 11000, amount: 3});
      await orderBook.connect(bob).make_ask(0, {price: 12500, amount: 2});
      const higherAsk = await orderBook.asks(0, 2);
      const lowerAsk = await orderBook.asks(0, 1);

      expect(await orderBook.bestAskId(0)).to.equal(1);
      expect(lowerAsk.higher_price).to.equal(2);
      expect(lowerAsk.lower_price).to.equal(0);
      expect(higherAsk.higher_price).to.equal(0);
      expect(higherAsk.lower_price).to.equal(1);
    });

    it('sorts an ask between high and low', async () => {
      const {orderBook, bob} = await loadFixture(deployOrderBookWithOrders);
      await orderBook.connect(bob).make_ask(0, {price: 11000, amount: 1});
      await orderBook.connect(bob).make_ask(0, {price: 13000, amount: 2});
      await orderBook.connect(bob).make_ask(0, {price: 12000, amount: 2});

      const lowerAsk = await orderBook.asks(0, 1);
      const middleAsk = await orderBook.asks(0, 3);
      const higherAsk = await orderBook.asks(0, 2);

      expect(await orderBook.bestAskId(0)).to.equal(1);
      expect(lowerAsk.higher_price).to.equal(3);
      expect(lowerAsk.lower_price).to.equal(0);
      expect(middleAsk.higher_price).to.equal(2);
      expect(middleAsk.lower_price).to.equal(1);
      expect(higherAsk.higher_price).to.equal(0);
      expect(higherAsk.lower_price).to.equal(3);
    });

    it('sorts an equal ask under the existing ask', async () => {
      const {orderBook, bob} = await loadFixture(deployOrderBookWithOrders);
      await orderBook.connect(bob).make_ask(0, {price: 11000, amount: 2});
      await orderBook.connect(bob).make_ask(0, {price: 11000, amount: 3});

      const firstAsk = await orderBook.asks(0, 1);
      const secondAsk = await orderBook.asks(0, 2);

      expect(await orderBook.bestAskId(0)).to.equal(1);
      expect(firstAsk.amount).to.equal(2)
      expect(secondAsk.amount).to.equal(3)
      expect(secondAsk.lower_price).to.equal(1);
      expect(secondAsk.higher_price).to.equal(0);
      expect(firstAsk.lower_price).to.equal(0);
      expect(firstAsk.higher_price).to.equal(2);
    });

    it('settles a matched ask', async () => {
      const {orderBook, bob, charles} = await loadFixture(deployOrderBookWithOrders);
      await orderBook.connect(bob).make_ask(0, {price: 11000, amount: 2});
      await orderBook.connect(charles).make_bid(0, {price: 11000, amount: 2}, {value: 22000});

      expect(await orderBook.ledger(bob.address, 0)).to.equal(3);
      expect(await orderBook.ledger(charles.address, 0)).to.equal(2);
    });

    it('settles a partially matched ask less than', async () => {
      const {orderBook, bob, charles} = await loadFixture(deployOrderBookWithOrders);
      await orderBook.connect(bob).make_ask(0, {price: 11000, amount: 3});
      await orderBook.connect(charles).make_bid(0, {price: 11000, amount: 2}, {value: 22000});
      const bobsAsk = await orderBook.asks(0, 1);

      expect(await orderBook.ledger(bob.address, 0)).to.equal(3);
      expect(await orderBook.ledger(charles.address, 0)).to.equal(2);
      expect(await orderBook.bestAskId(0)).to.equal(1);
      expect(bobsAsk.amount).to.equal(1);
    });

    it('settles a partially matched ask greater than ask first', async () => {
      const {orderBook, bob, charles} = await loadFixture(deployOrderBookWithOrders);
      const prevBidHead = await orderBook.bidHead(0);
      await orderBook.connect(bob).make_ask(0, {price: 11000, amount: 3});
      await orderBook.connect(charles).make_bid(0, {price: 11000, amount: 4}, {value: 44000});
      const bobsAsk = await orderBook.asks(0, 1);
      const charlesBid = await orderBook.bids(0, prevBidHead);

      expect(await orderBook.ledger(bob.address, 0)).to.equal(2);
      expect(await orderBook.ledger(charles.address, 0)).to.equal(3);
      expect(await orderBook.bestAskId(0)).to.equal(0);
      expect(await orderBook.bestBidId(0)).to.equal(prevBidHead);
      expect(charlesBid.amount).to.equal(1);
    });

    it('settles a partially matched ask greater than bid first', async () => {
      const {orderBook, bob, charles} = await loadFixture(deployOrderBookWithOrders);
      const prevBidHead = await orderBook.bidHead(0);
      await orderBook.connect(charles).make_bid(0, {price: 11000, amount: 2}, {value: 22000});
      await orderBook.connect(bob).make_ask(0, {price: 11000, amount: 3});
      const bobsAsk = await orderBook.asks(0, 1);

      expect(await orderBook.ledger(bob.address, 0)).to.equal(3);
      expect(await orderBook.ledger(charles.address, 0)).to.equal(2);
      expect(await orderBook.bestAskId(0)).to.equal(1);
      expect(await orderBook.bestBidId(0)).to.equal(0);
      expect(bobsAsk.amount).to.equal(1);
    });

    it('settles a partially matched ask less than bid first', async () => {
      const {orderBook, bob, charles} = await loadFixture(deployOrderBookWithOrders);
      const prevBidHead = await orderBook.bidHead(0);
      await orderBook.connect(charles).make_bid(0, {price: 11000, amount: 2}, {value: 22000});
      await orderBook.connect(bob).make_ask(0, {price: 11000, amount: 1});
      const charlesBid = await orderBook.bids(0, prevBidHead);

      expect(await orderBook.ledger(bob.address, 0)).to.equal(4);
      expect(await orderBook.ledger(charles.address, 0)).to.equal(1);
      expect(await orderBook.bestAskId(0)).to.equal(0);
      expect(await orderBook.bestBidId(0)).to.equal(prevBidHead);
      expect(charlesBid.amount).to.equal(1);
    });


    it('does not add a bid if matched ask is settled in full', async () => {
      const {orderBook, bob, charles} = await loadFixture(deployOrderBookWithOrders);
      const prevHead = await orderBook.bidHead(0);
      await orderBook.connect(bob).make_ask(0, {price: 11000, amount: 2});
      await orderBook.connect(charles).make_bid(0, {price: 11000, amount: 2}, {value: 22000});

    expect(await orderBook.bidHead(0)).to.equal(prevHead);
    });

    it('successfully places an ask after the only ask is settled', async () => {
      const {orderBook, bob, charles} = await loadFixture(deployOrderBookWithOrders);
      await orderBook.connect(bob).make_ask(0, {price: 11000, amount: 2});
      await orderBook.connect(charles).make_bid(0, {price: 11000, amount: 2}, {value: 22000});
      await orderBook.connect(bob).make_ask(0, {price: 11000, amount: 3});

      const newAsk = await orderBook.asks(0, 2);
      const oldAsk = await orderBook.asks(0, 1);

      expect(newAsk.higher_price).to.equal(0);
      expect(newAsk.lower_price).to.equal(0);
      expect(await orderBook.bestAskId(0)).to.equal(2);
      expect(await orderBook.askHead(0)).to.equal(3);
    });

  });
});
