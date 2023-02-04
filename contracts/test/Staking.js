const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const nil_addr = "0x0000000000000000000000000000000000000000";

describe("Staking", () => {
  async function deployStaking() {
    const [owner, bob] = await ethers.getSigners();
    const SkinToken = await ethers.getContractFactory("SkinToken");
    const Staking = await ethers.getContractFactory("Staking");
    const skin = await SkinToken.deploy(1000000);
    const staking = await Staking.deploy(skin.address);

    await skin.connect(owner).transfer(bob.address, 1000);
    await skin.connect(bob).approve(staking.address, 1000);
    return { owner, bob, staking };
  }

  describe("Deployment", () => {
    it("Should successfully deploy", async () => {
      const { staking, skin } = await loadFixture(deployStaking);
      expect(await staking.address).to.exist;
    });
  });

  describe("Staking", () => {
    it("Should allow a user to stake", async () => {
      const { bob, staking } = await loadFixture(deployStaking);
      await staking.connect(bob).stake(100);
      expect(await staking.stakedBalance(bob.address)).to.equal(100);
    });

    it("Reverts if a user submits a zero stake", async () => {
      const { bob, staking } = await loadFixture(deployStaking);
      await expect(staking.connect(bob).stake(0)).to.be.revertedWith(
        "Staking: Cannot stake 0"
      );
    });
  });

  describe("Unstaking", () => {
    it("Should allow a user to unstake", async () => {
      const { bob, staking } = await loadFixture(deployStaking);
      await staking.connect(bob).stake(100);
      await staking.connect(bob).unstake(100);
      expect(await staking.stakedBalance(bob.address)).to.equal(0);
    });

    it("Reverts if a user submits a zero unstake", async () => {
      const { bob, staking } = await loadFixture(deployStaking);
      await expect(staking.connect(bob).unstake(0)).to.be.revertedWith(
        "Staking: Cannot unstake 0"
      );
    });

    it("Reverts if a user submits an unstake greater than their stake", async () => {
      const { bob, staking } = await loadFixture(deployStaking);
      await expect(staking.connect(bob).unstake(1000)).to.be.revertedWith(
        "Staking: Insufficient balance"
      );
    });
  });
});
