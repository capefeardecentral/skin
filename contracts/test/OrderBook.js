const {
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const {anyValue} = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const {expect} = require("chai");

describe("OrderBook", () => {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployOrderBook() {
    // Contracts are deployed using the first signer/account by default
    const [owner, bob, alice] = await ethers.getSigners();

    const OrderBook = await ethers.getContractFactory("OrderBook");
    const orderBook = await OrderBook.deploy();

    return {orderBook, owner, bob, alice};
  }

  describe("Deployment", function () {
    it("Should successfully deploy", async () => {
      const {orderBook} = await loadFixture(deployOrderBook);
      expect(await orderBook.address).to.exist;
    });

  });
});
