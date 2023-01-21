const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const nil_addr = "0x0000000000000000000000000000000000000000";

describe("OrderBook", () => {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployOrderBook() {
    // Contracts are deployed using the first signer/account by default
    const [owner, bob, alice, charles] = await ethers.getSigners();

    const OrderBook = await ethers.getContractFactory("OrderBook");
    const orderBook = await OrderBook.deploy();

    return { orderBook, owner, bob, alice, charles };
  }

  async function deployOrderBookWithOrders() {
    // Contracts are deployed using the first signer/account by default
    const [owner, bob, alice, charles] = await ethers.getSigners();

    const OrderBook = await ethers.getContractFactory("OrderBook");
    const orderBook = await OrderBook.deploy();
    await orderBook
      .connect(bob)
      .make_bid(0, { price: 10000, amount: 5 }, { value: 50000 });
    await orderBook
      .connect(alice)
      .make_bid(1, { price: 10000, amount: 5 }, { value: 50000 });

    return { orderBook, owner, bob, alice, charles };
  }

  async function checkBalance(orderBook) {
    const balance = await ethers.provider.getBalance(orderBook.address);
    const escrow = await orderBook.escrow();
    const prize_pool = await orderBook.prize_pool();
    const expectedFunds = prize_pool.add(escrow);

    expect(balance).to.equal(expectedFunds);
  }

  describe("Deployment", () => {
    it("Should successfully deploy", async () => {
      const { orderBook } = await loadFixture(deployOrderBook);
      expect(await orderBook.address).to.exist;
    });
  });
  describe("make_bid()", () => {
    it("rejects a bid if not enough funds are sent", async () => {
      const { orderBook, bob } = await loadFixture(deployOrderBook);
      await expect(
        orderBook
          .connect(bob)
          .make_bid(0, { price: 10000, amount: 5 }, { value: 40000 })
      ).to.be.reverted;
    });

    it("rejects a bid if too many funds are sent", async () => {
      const { orderBook, bob } = await loadFixture(deployOrderBook);
      await expect(
        orderBook
          .connect(bob)
          .make_bid(0, { price: 10000, amount: 5 }, { value: 60000 })
      ).to.be.reverted;
    });

    it("rejects a bid with amount 0", async () => {
      const { orderBook, bob } = await loadFixture(deployOrderBook);
      await expect(
        orderBook
          .connect(bob)
          .make_bid(0, { price: 10000, amount: 0 }, { value: 10000 })
      ).to.be.reverted;
    });

    it("rejects a bid with price 0", async () => {
      const { orderBook, bob } = await loadFixture(deployOrderBook);
      await expect(
        orderBook
          .connect(bob)
          .make_bid(0, { price: 0, amount: 5 }, { value: 0 })
      ).to.be.reverted;
    });

    it("creates an initial bid", async () => {
      const { orderBook, bob } = await loadFixture(deployOrderBook);
      await orderBook
        .connect(bob)
        .make_bid(0, { price: 10000, amount: 5 }, { value: 50000 });

      expect(await orderBook.escrow()).to.equal(50000);
      expect(await orderBook.bestBidId(0)).to.equal(1);
      expect(await orderBook.bidHead(0)).to.equal(2);

      // check bid ledger
      const { higher_price, lower_price, price, maker, amount } =
        await orderBook.bids(0, 1);
      expect(higher_price).to.equal(0);
      expect(lower_price).to.equal(0);
      expect(price).to.equal(10000);
      expect(maker).to.equal(bob.address);
      expect(amount).to.equal(5);
      await checkBalance(orderBook);
    });

    it("creates a bid after an initial bid is taken", async () => {
      const { orderBook, bob, charles } = await loadFixture(
        deployOrderBookWithOrders
      );

      await orderBook.connect(bob).make_ask(0, { price: 11000, amount: 2 });
      await orderBook
        .connect(charles)
        .make_bid(0, { price: 11000, amount: 2 }, { value: 22000 });
      await orderBook
        .connect(bob)
        .make_bid(0, { price: 11000, amount: 2 }, { value: 22000 });

      const newBid = await orderBook.bids(0, 2);
      const oldBid = await orderBook.bids(0, 1);

      expect(await orderBook.escrow()).to.equal(22000);
      expect(newBid.higher_price).to.equal(0);
      expect(newBid.lower_price).to.equal(0);
      expect(await orderBook.bestBidId(0)).to.equal(2);
      expect(await orderBook.bidHead(0)).to.equal(3);
      await checkBalance(orderBook);
    });

    it("creates creates a bid after not finding a matching ask", async () => {
      const { orderBook, bob, charles } = await loadFixture(
        deployOrderBookWithOrders
      );
      await orderBook.connect(bob).make_ask(0, { price: 11000, amount: 2 });
      await orderBook
        .connect(charles)
        .make_bid(0, { price: 10000, amount: 2 }, { value: 20000 });
      const charlesBid = await orderBook.bids(0, 2);

      expect(await orderBook.escrow()).to.equal(20000);
      expect(charlesBid.higher_price).to.equal(0);
      expect(charlesBid.lower_price).to.equal(0);
      expect(await orderBook.bestBidId(0)).to.equal(2);
      expect(await orderBook.bidHead(0)).to.equal(3);
      await checkBalance(orderBook);
    });

    it("places a higher bid", async () => {
      const { orderBook, bob, alice } = await loadFixture(deployOrderBook);
      await orderBook
        .connect(bob)
        .make_bid(0, { price: 10000, amount: 5 }, { value: 50000 });
      await orderBook
        .connect(alice)
        .make_bid(0, { price: 11000, amount: 5 }, { value: 55000 });

      expect(await orderBook.escrow()).to.equal(105000);
      expect(await orderBook.bestBidId(0)).to.equal(2);
      expect(await orderBook.bidHead(0)).to.equal(3);

      const bobsBid = await orderBook.bids(0, 1);
      const alicesBid = await orderBook.bids(0, 2);

      expect(bobsBid.higher_price).to.equal(2);
      expect(bobsBid.lower_price).to.equal(0);
      expect(alicesBid.higher_price).to.equal(0);
      expect(alicesBid.lower_price).to.equal(1);
      await checkBalance(orderBook);
    });

    it("sorts a bid between high and low", async () => {
      const { orderBook, bob, alice, charles } = await loadFixture(
        deployOrderBook
      );
      await orderBook
        .connect(bob)
        .make_bid(0, { price: 10000, amount: 5 }, { value: 50000 });
      await orderBook
        .connect(alice)
        .make_bid(0, { price: 11000, amount: 5 }, { value: 55000 });
      await orderBook
        .connect(charles)
        .make_bid(0, { price: 10500, amount: 5 }, { value: 52500 });

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
      await checkBalance(orderBook);
    });

    it("sorts a matching bid under the existing bid", async () => {
      const { orderBook, bob, alice } = await loadFixture(deployOrderBook);
      await orderBook
        .connect(bob)
        .make_bid(0, { price: 10000, amount: 5 }, { value: 50000 });
      await orderBook
        .connect(alice)
        .make_bid(0, { price: 10000, amount: 5 }, { value: 50000 });

      expect(await orderBook.escrow()).to.equal(100000);
      expect(await orderBook.bestBidId(0)).to.equal(1);
      expect(await orderBook.bidHead(0)).to.equal(3);

      const bobsBid = await orderBook.bids(0, 1);
      const alicesBid = await orderBook.bids(0, 2);

      expect(bobsBid.higher_price).to.equal(0);
      expect(bobsBid.lower_price).to.equal(2);
      expect(alicesBid.higher_price).to.equal(1);
      expect(alicesBid.lower_price).to.equal(0);
      await checkBalance(orderBook);
    });
  });

  describe("match_token_pair_bids()", () => {
    it("mints a token pair for symmetric bids", async () => {
      const { orderBook, bob, alice } = await loadFixture(deployOrderBook);
      await orderBook
        .connect(bob)
        .make_bid(0, { price: 10000, amount: 5 }, { value: 50000 });
      await orderBook
        .connect(alice)
        .make_bid(1, { price: 10000, amount: 5 }, { value: 50000 });

      const token_price = await orderBook.token_price();
      // TODO I think we should split out escrow and token pool
      expect(await orderBook.escrow()).to.equal(0);
      expect(await orderBook.prize_pool()).to.equal(token_price * 5);
      expect(await orderBook.ledger(bob.address, 0)).to.equal(5);
      expect(await orderBook.ledger(alice.address, 1)).to.equal(5);
      expect(await orderBook.bestBidId(0)).to.equal(0);
      expect(await orderBook.bestBidId(1)).to.equal(0);
      expect(await orderBook.bidHead(1)).to.equal(1);
      expect(await orderBook.bidHead(0)).to.equal(2);
      await checkBalance(orderBook);
    });

    it("mints a token pair for a partial bid match less than", async () => {
      const { orderBook, bob, alice } = await loadFixture(deployOrderBook);
      await orderBook
        .connect(bob)
        .make_bid(0, { price: 10000, amount: 5 }, { value: 50000 });
      await orderBook
        .connect(alice)
        .make_bid(1, { price: 10000, amount: 3 }, { value: 30000 });

      // TODO I think we should split out escrow and token pool
      expect(await orderBook.escrow()).to.equal(20000);
      expect(await orderBook.prize_pool()).to.equal(60000);
      expect(await orderBook.ledger(bob.address, 0)).to.equal(3);
      expect(await orderBook.ledger(alice.address, 1)).to.equal(3);
      expect(await orderBook.bestBidId(0)).to.equal(1);
      expect(await orderBook.bestBidId(1)).to.equal(0);
      expect(await orderBook.bidHead(0)).to.equal(2);
      expect(await orderBook.bidHead(1)).to.equal(1);
      await checkBalance(orderBook);
    });

    it("mints a token pair for a partial bid match greater than", async () => {
      const { orderBook, bob, alice } = await loadFixture(deployOrderBook);
      await orderBook
        .connect(bob)
        .make_bid(0, { price: 10000, amount: 5 }, { value: 50000 });

      expect(await orderBook.escrow()).to.equal(50000);
      await orderBook
        .connect(alice)
        .make_bid(1, { price: 10000, amount: 8 }, { value: 80000 });
      const alicesBid = await orderBook.bids(1, 1);

      // TODO I think we should split out escrow and token pool
      expect(await orderBook.escrow()).to.equal(30000);
      expect(await orderBook.prize_pool()).to.equal(100000);
      expect(await orderBook.ledger(bob.address, 0)).to.equal(5);
      expect(await orderBook.ledger(alice.address, 1)).to.equal(5);
      expect(await orderBook.bestBidId(0)).to.equal(0);
      expect(await orderBook.bestBidId(1)).to.equal(1);
      expect(await orderBook.bidHead(0)).to.equal(2);
      expect(await orderBook.bidHead(1)).to.equal(2);
      expect(alicesBid.amount).to.equal(3);
      expect(alicesBid.price).to.equal(10000);
      await checkBalance(orderBook);
    });

    it("does not create a bid if settled", async () => {
      const { orderBook, bob, alice } = await loadFixture(deployOrderBook);
      await orderBook
        .connect(bob)
        .make_bid(0, { price: 10000, amount: 5 }, { value: 50000 });
      await orderBook
        .connect(alice)
        .make_bid(1, { price: 10000, amount: 5 }, { value: 50000 });

      expect(await orderBook.bidHead(0)).to.equal(2);
      await checkBalance(orderBook);
    });
  });

  describe("make_ask", async () => {
    it("rejects an ask with price not greater than 0", async () => {
      const { orderBook, bob } = await loadFixture(deployOrderBookWithOrders);
      expect(orderBook.connect(bob).make_ask(0, { price: 0, amount: 5 })).to.be
        .reverted;
    });

    it("rejects an ask with amount not greater than 0", async () => {
      const { orderBook, bob } = await loadFixture(deployOrderBookWithOrders);
      expect(orderBook.connect(bob).make_ask(0, { price: 10000, amount: 0 })).to
        .be.reverted;
    });

    it("rejects an ask with insufficent token balance", async () => {
      const { orderBook, bob } = await loadFixture(deployOrderBookWithOrders);
      expect(orderBook.connect(bob).make_ask(0, { price: 10000, amount: 10 }))
        .to.be.reverted;
    });

    it("allows a user to place an unmatched ask", async () => {
      const { orderBook, bob } = await loadFixture(deployOrderBookWithOrders);
      await orderBook.connect(bob).make_ask(0, { price: 11000, amount: 5 });

      expect(await orderBook.bestAskId(0)).to.equal(1);
      expect(await orderBook.askHead(0)).to.equal(2);
      const { higher_price, lower_price, price, maker, amount } =
        await orderBook.asks(0, 1);
      expect(higher_price).to.equal(0);
      expect(lower_price).to.equal(0);
      expect(price).to.equal(11000);
      expect(maker).to.equal(bob.address);
      expect(amount).to.equal(5);
      await checkBalance(orderBook);
    });

    it("allows a user to place an unmatched ask - existing bid", async () => {
      const { orderBook, bob, alice } = await loadFixture(
        deployOrderBookWithOrders
      );
      await orderBook
        .connect(alice)
        .make_bid(0, { price: 10000, amount: 5 }, { value: 50000 });
      await orderBook.connect(bob).make_ask(0, { price: 11000, amount: 5 });

      expect(await orderBook.bestAskId(0)).to.equal(1);
      expect(await orderBook.askHead(0)).to.equal(2);
      const { higher_price, lower_price, price, maker, amount } =
        await orderBook.asks(0, 1);
      expect(higher_price).to.equal(0);
      expect(lower_price).to.equal(0);
      expect(price).to.equal(11000);
      expect(maker).to.equal(bob.address);
      expect(amount).to.equal(5);
      await checkBalance(orderBook);
    });

    it("allows a user to place a better ask", async () => {
      const { orderBook, bob } = await loadFixture(deployOrderBookWithOrders);
      await orderBook.connect(bob).make_ask(0, { price: 11000, amount: 3 });
      await orderBook.connect(bob).make_ask(0, { price: 10500, amount: 2 });
      const higherAsk = await orderBook.asks(0, 1);
      const lowerAsk = await orderBook.asks(0, 2);
      expect(await orderBook.bestAskId(0)).to.equal(2);
      expect(lowerAsk.higher_price).to.equal(1);
      expect(lowerAsk.lower_price).to.equal(0);
      expect(higherAsk.higher_price).to.equal(0);
      expect(higherAsk.lower_price).to.equal(2);
      await checkBalance(orderBook);
    });

    it("allows a user to place a worse ask", async () => {
      const { orderBook, bob } = await loadFixture(deployOrderBookWithOrders);
      await orderBook.connect(bob).make_ask(0, { price: 11000, amount: 3 });
      await orderBook.connect(bob).make_ask(0, { price: 12500, amount: 2 });
      const higherAsk = await orderBook.asks(0, 2);
      const lowerAsk = await orderBook.asks(0, 1);

      expect(await orderBook.bestAskId(0)).to.equal(1);
      expect(lowerAsk.higher_price).to.equal(2);
      expect(lowerAsk.lower_price).to.equal(0);
      expect(higherAsk.higher_price).to.equal(0);
      expect(higherAsk.lower_price).to.equal(1);
      await checkBalance(orderBook);
    });

    it("sorts an ask between high and low", async () => {
      const { orderBook, bob } = await loadFixture(deployOrderBookWithOrders);
      await orderBook.connect(bob).make_ask(0, { price: 11000, amount: 1 });
      await orderBook.connect(bob).make_ask(0, { price: 13000, amount: 2 });
      await orderBook.connect(bob).make_ask(0, { price: 12000, amount: 2 });

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
      await checkBalance(orderBook);
    });

    it("sorts an equal ask under the existing ask", async () => {
      const { orderBook, bob } = await loadFixture(deployOrderBookWithOrders);
      await orderBook.connect(bob).make_ask(0, { price: 11000, amount: 2 });
      await orderBook.connect(bob).make_ask(0, { price: 11000, amount: 3 });

      const firstAsk = await orderBook.asks(0, 1);
      const secondAsk = await orderBook.asks(0, 2);

      expect(await orderBook.bestAskId(0)).to.equal(1);
      expect(firstAsk.amount).to.equal(2);
      expect(secondAsk.amount).to.equal(3);
      expect(secondAsk.lower_price).to.equal(1);
      expect(secondAsk.higher_price).to.equal(0);
      expect(firstAsk.lower_price).to.equal(0);
      expect(firstAsk.higher_price).to.equal(2);
      await checkBalance(orderBook);
    });

    it("settles a matched ask", async () => {
      const { orderBook, bob, charles } = await loadFixture(
        deployOrderBookWithOrders
      );
      await orderBook.connect(bob).make_ask(0, { price: 11000, amount: 2 });
      await orderBook
        .connect(charles)
        .make_bid(0, { price: 11000, amount: 2 }, { value: 22000 });

      expect(await orderBook.ledger(bob.address, 0)).to.equal(3);
      expect(await orderBook.ledger(charles.address, 0)).to.equal(2);
      await checkBalance(orderBook);
    });

    it("settles a partially matched ask less than", async () => {
      const { orderBook, bob, charles } = await loadFixture(
        deployOrderBookWithOrders
      );
      await orderBook.connect(bob).make_ask(0, { price: 11000, amount: 3 });
      await orderBook
        .connect(charles)
        .make_bid(0, { price: 11000, amount: 2 }, { value: 22000 });
      const bobsAsk = await orderBook.asks(0, 1);

      expect(await orderBook.ledger(bob.address, 0)).to.equal(3);
      expect(await orderBook.ledger(charles.address, 0)).to.equal(2);
      expect(await orderBook.bestAskId(0)).to.equal(1);
      expect(bobsAsk.amount).to.equal(1);
      await checkBalance(orderBook);
    });

    it("settles a partially matched ask greater than ask first", async () => {
      const { orderBook, bob, charles } = await loadFixture(
        deployOrderBookWithOrders
      );
      const prevBidHead = await orderBook.bidHead(0);
      await orderBook.connect(bob).make_ask(0, { price: 11000, amount: 3 });
      await orderBook
        .connect(charles)
        .make_bid(0, { price: 11000, amount: 4 }, { value: 44000 });
      const bobsAsk = await orderBook.asks(0, 1);
      const charlesBid = await orderBook.bids(0, prevBidHead);

      expect(await orderBook.ledger(bob.address, 0)).to.equal(2);
      expect(await orderBook.ledger(charles.address, 0)).to.equal(3);
      expect(await orderBook.bestAskId(0)).to.equal(0);
      expect(await orderBook.bestBidId(0)).to.equal(prevBidHead);
      expect(charlesBid.amount).to.equal(1);
      await checkBalance(orderBook);
    });

    it("settles a partially matched ask greater than bid first", async () => {
      const { orderBook, bob, charles } = await loadFixture(
        deployOrderBookWithOrders
      );
      const prevBidHead = await orderBook.bidHead(0);
      await orderBook
        .connect(charles)
        .make_bid(0, { price: 11000, amount: 2 }, { value: 22000 });
      await orderBook.connect(bob).make_ask(0, { price: 11000, amount: 3 });
      const bobsAsk = await orderBook.asks(0, 1);

      expect(await orderBook.ledger(bob.address, 0)).to.equal(3);
      expect(await orderBook.ledger(charles.address, 0)).to.equal(2);
      expect(await orderBook.bestAskId(0)).to.equal(1);
      expect(await orderBook.bestBidId(0)).to.equal(0);
      expect(bobsAsk.amount).to.equal(1);
      await checkBalance(orderBook);
    });

    it("settles a partially matched ask less than bid first", async () => {
      const { orderBook, bob, charles } = await loadFixture(
        deployOrderBookWithOrders
      );
      const prevBidHead = await orderBook.bidHead(0);
      await orderBook
        .connect(charles)
        .make_bid(0, { price: 11000, amount: 2 }, { value: 22000 });
      await orderBook.connect(bob).make_ask(0, { price: 11000, amount: 1 });
      const charlesBid = await orderBook.bids(0, prevBidHead);

      expect(await orderBook.ledger(bob.address, 0)).to.equal(4);
      expect(await orderBook.ledger(charles.address, 0)).to.equal(1);
      expect(await orderBook.bestAskId(0)).to.equal(0);
      expect(await orderBook.bestBidId(0)).to.equal(prevBidHead);
      expect(charlesBid.amount).to.equal(1);
      await checkBalance(orderBook);
    });

    it("does not add a bid if matched ask is settled in full", async () => {
      const { orderBook, bob, charles } = await loadFixture(
        deployOrderBookWithOrders
      );
      const prevHead = await orderBook.bidHead(0);
      await orderBook.connect(bob).make_ask(0, { price: 11000, amount: 2 });
      await orderBook
        .connect(charles)
        .make_bid(0, { price: 11000, amount: 2 }, { value: 22000 });

      expect(await orderBook.bidHead(0)).to.equal(prevHead);
      await checkBalance(orderBook);
    });

    it("successfully places an ask after the only ask is settled", async () => {
      const { orderBook, bob, charles } = await loadFixture(
        deployOrderBookWithOrders
      );
      await orderBook.connect(bob).make_ask(0, { price: 11000, amount: 2 });
      await orderBook
        .connect(charles)
        .make_bid(0, { price: 11000, amount: 2 }, { value: 22000 });
      await orderBook.connect(bob).make_ask(0, { price: 11000, amount: 3 });

      const newAsk = await orderBook.asks(0, 2);
      const oldAsk = await orderBook.asks(0, 1);

      expect(newAsk.higher_price).to.equal(0);
      expect(newAsk.lower_price).to.equal(0);
      expect(await orderBook.bestAskId(0)).to.equal(2);
      expect(await orderBook.askHead(0)).to.equal(3);
      await checkBalance(orderBook);
    });
  });

  describe("cancelAsk", () => {
    it("reverts if the ask does not exist", async () => {
      const { orderBook, bob } = await loadFixture(deployOrderBookWithOrders);
      await expect(orderBook.connect(bob).cancel_ask(0, 5)).to.be.reverted;
    });

    it("allows a user to cancel their own ask", async () => {
      const { orderBook, bob } = await loadFixture(deployOrderBookWithOrders);
      await orderBook.connect(bob).make_ask(0, { price: 11000, amount: 2 });
      await orderBook.connect(bob).cancel_ask(0, 1);
      const canceledAsk = await orderBook.asks(0, 1);
      expect(canceledAsk.amount).to.equal(0);
      expect(canceledAsk.maker).to.equal(nil_addr);
      await checkBalance(orderBook);
    });

    it("does not allow a user to cancel anothers ask", async () => {
      const { orderBook, bob, charles } = await loadFixture(
        deployOrderBookWithOrders
      );
      await orderBook.connect(bob).make_ask(0, { price: 11000, amount: 2 });
      await expect(orderBook.connect(charles).cancel_ask(0, 1)).to.be.reverted;
    });
  });

  describe("cancelBid", () => {
    it("reverts if the bid does not exist", async () => {
      const { orderBook, bob } = await loadFixture(deployOrderBookWithOrders);
      await expect(orderBook.connect(bob).cancel_bid(0, 5)).to.be.reverted;
      await checkBalance(orderBook);
    });

    it("allows a user to cancel their own bid", async () => {
      const { orderBook, bob } = await loadFixture(deployOrderBookWithOrders);
      const bidHead = await orderBook.bidHead(0);
      await orderBook
        .connect(bob)
        .make_bid(0, { price: 11000, amount: 2 }, { value: 22000 });
      await orderBook.connect(bob).cancel_bid(0, bidHead);
      const canceledBid = await orderBook.bids(0, bidHead);
      expect(canceledBid.amount).to.equal(0);
      expect(canceledBid.maker).to.equal(nil_addr);
      await checkBalance(orderBook);
    });

    it("does not allow a user to cancel anothers bid", async () => {
      const { orderBook, bob, charles } = await loadFixture(
        deployOrderBookWithOrders
      );
      const bidHead = await orderBook.bidHead(0);
      await orderBook
        .connect(bob)
        .make_bid(0, { price: 11000, amount: 2 }, { value: 22000 });
      await expect(orderBook.connect(charles).cancel_bid(0, bidHead)).to.be
        .reverted;
    });
  });

  describe("takeAsk", () => {
    it("reverts if the ask does not exist", async () => {
      const { orderBook, bob } = await loadFixture(deployOrderBookWithOrders);
      await expect(orderBook.connect(bob).take_ask(0, 5)).to.be.reverted;
    });

    it("reverts if the user does not send enough value", async () => {
      const { orderBook, bob, charles } = await loadFixture(
        deployOrderBookWithOrders
      );
      const askHead = await orderBook.askHead(0);
      await orderBook.connect(bob).make_ask(0, { price: 11000, amount: 2 });
      await expect(
        orderBook.connect(charles).take_ask(0, askHead, { value: 10000 })
      ).to.be.reverted;
    });

    it("allows a user to take an ask", async () => {
      const { orderBook, bob, charles } = await loadFixture(
        deployOrderBookWithOrders
      );
      const askHead = await orderBook.askHead(0);
      await orderBook.connect(bob).make_ask(0, { price: 11000, amount: 2 });
      await orderBook.connect(charles).take_ask(0, askHead, { value: 22000 });
      const ask = await orderBook.asks(0, askHead);
      expect(ask.amount).to.equal(0);
      expect(ask.maker).to.equal(nil_addr);
      expect(await orderBook.ledger(charles.address, 0)).to.equal(2);
      await checkBalance(orderBook);
    });

    it("updates the best ask when the best ask is taken", async () => {
      const { orderBook, bob, charles } = await loadFixture(
        deployOrderBookWithOrders
      );
      const askHead = await orderBook.askHead(0);
      await orderBook.connect(bob).make_ask(0, { price: 11000, amount: 2 });
      await orderBook.connect(bob).make_ask(0, { price: 12000, amount: 2 });
      await orderBook.connect(charles).take_ask(0, askHead, { value: 22000 });
      const ask = await orderBook.asks(0, 1);
      expect(ask.amount).to.equal(0);
      expect(ask.maker).to.equal(nil_addr);
      expect(await orderBook.ledger(charles.address, 0)).to.equal(2);
      expect(await orderBook.bestAskId(0)).to.equal(2);
      const newBestAsk = await orderBook.asks(0, 2);
      expect(newBestAsk.higher_price).to.equal(0);
      expect(newBestAsk.lower_price).to.equal(0);
      await checkBalance(orderBook);
    });

    it("resorts the orderbook when the best ask is taken", async () => {
      const { orderBook, bob, charles } = await loadFixture(
        deployOrderBookWithOrders
      );
      const askHead = await orderBook.askHead(0);
      await orderBook.connect(bob).make_ask(0, { price: 11000, amount: 1 });
      await orderBook.connect(bob).make_ask(0, { price: 12000, amount: 2 });
      await orderBook.connect(bob).make_ask(0, { price: 13000, amount: 1 });
      await orderBook
        .connect(charles)
        .take_ask(0, askHead.add(1), { value: 24000 });
      const firstAsk = await orderBook.asks(0, askHead);
      const secondAsk = await orderBook.asks(0, askHead.add(1));
      const thirdAsk = await orderBook.asks(0, askHead.add(2));
      expect(firstAsk.higher_price).to.equal(askHead.add(2));
      expect(firstAsk.lower_price).to.equal(0);
      expect(thirdAsk.higher_price).to.equal(0);
      expect(thirdAsk.lower_price).to.equal(askHead);
      await checkBalance(orderBook);
    });
  });

  describe("takeBid", () => {
    it("reverts if the bid does not exist", async () => {
      const { orderBook, bob } = await loadFixture(deployOrderBookWithOrders);
      await expect(orderBook.connect(bob).take_bid(0, 5)).to.be.revertedWith(
        "bid does not exist"
      );
    });

    it("reverts if user doesn't have enough tokens to fill the bid", async () => {
      const { orderBook, bob, charles } = await loadFixture(
        deployOrderBookWithOrders
      );
      const bidHead = await orderBook.bidHead(0);
      await orderBook
        .connect(charles)
        .make_bid(0, { price: 10000, amount: 10 }, { value: 100000 });
      await expect(
        orderBook.connect(bob).take_bid(0, bidHead)
      ).to.be.revertedWith("insufficient tokens");
    });

    it("allows a user to take a bid", async () => {
      const { orderBook, bob, charles } = await loadFixture(
        deployOrderBookWithOrders
      );
      const bobBalance = await bob.getBalance();
      const bidHead = await orderBook.bidHead(0);
      await orderBook
        .connect(charles)
        .make_bid(0, { price: 10000, amount: 2 }, { value: 20000 });
      await orderBook.connect(bob).take_bid(0, bidHead);
      expect(await orderBook.ledger(bob.address, 0)).to.equal(3);
      expect(await orderBook.ledger(charles.address, 0)).to.equal(2);
      await checkBalance(orderBook);
    });

    it("updates the best bid when the best bid is taken", async () => {
      const { orderBook, bob, charles } = await loadFixture(
        deployOrderBookWithOrders
      );
      const bobBalance = await bob.getBalance();
      const bidHead = await orderBook.bidHead(0);
      await orderBook
        .connect(charles)
        .make_bid(0, { price: 10000, amount: 2 }, { value: 20000 });
      await orderBook
        .connect(charles)
        .make_bid(0, { price: 11000, amount: 1 }, { value: 11000 });
      await orderBook.connect(bob).take_bid(0, bidHead);
      expect(await orderBook.ledger(bob.address, 0)).to.equal(3);
      expect(await orderBook.ledger(charles.address, 0)).to.equal(2);
      const newBestBid = await orderBook.bids(0, bidHead.add(1));
      expect(await orderBook.bestBidId(0)).to.equal(bidHead.add(1));
      expect(newBestBid.higher_price).to.equal(0);
      expect(newBestBid.lower_price).to.equal(0);
      await checkBalance(orderBook);
    });

    it("resorts the orderbook when a bid is taken", async () => {
      const { orderBook, bob, charles } = await loadFixture(
        deployOrderBookWithOrders
      );
      const bidHead = await orderBook.bidHead(0);
      const secondBid = bidHead.add(1);
      const thirdBid = bidHead.add(2);
      await orderBook
        .connect(charles)
        .make_bid(0, { price: 10000, amount: 2 }, { value: 20000 });
      await orderBook
        .connect(charles)
        .make_bid(0, { price: 11000, amount: 1 }, { value: 11000 });
      await orderBook
        .connect(charles)
        .make_bid(0, { price: 12000, amount: 1 }, { value: 12000 });
      await orderBook.connect(bob).take_bid(0, secondBid);
      expect(await orderBook.ledger(bob.address, 0)).to.equal(4);
      expect(await orderBook.ledger(charles.address, 0)).to.equal(1);
      expect(await orderBook.bestBidId(0)).to.equal(thirdBid);
      const thirdBidBody = await orderBook.bids(0, thirdBid);
      const bidHeadBody = await orderBook.bids(0, bidHead);
      expect(thirdBidBody.higher_price).to.equal(0);
      expect(thirdBidBody.lower_price).to.equal(bidHead);
      expect(bidHeadBody.higher_price).to.equal(thirdBid);
      expect(bidHeadBody.lower_price).to.equal(0);
      await checkBalance(orderBook);
    });
  });
});
