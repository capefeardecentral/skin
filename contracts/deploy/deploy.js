module.exports = async ({getNamedAccounts, deployments}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();

  await deploy("Skin", {
    from: deployer,
    log: true,
    waitConfirmation: 5,
  });
};

module.exports.tags = ["Skin"];
