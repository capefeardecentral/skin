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

  describe('Deployment', () => {
    it('Should successfully deploy', async () => {
      const {orderBook} = await loadFixture(deployOrderBook);
      expect(await orderBook.address).to.exist;
    });
  });
  describe('make_bid()', () => {
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

  });
});
