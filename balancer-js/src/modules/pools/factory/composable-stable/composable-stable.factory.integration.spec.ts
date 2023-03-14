// yarn test:only ./src/modules/pools/factory/composable-stable/composable-stable.factory.integration.spec.ts
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Network, PoolType } from '@/types';
import { ADDRESSES } from '@/test/lib/constants';
import { AddressZero } from '@ethersproject/constants';
import { BalancerSDK } from '@/modules/sdk.module';
import { Interface, LogDescription } from '@ethersproject/abi';
import composableStableFactoryAbi from '@/lib/abi/ComposableStableFactory.json';
import {
  findEventInReceiptLogs,
  forkSetup,
  sendTransactionGetBalances,
} from '@/test/lib/utils';
import dotenv from 'dotenv';
import { BALANCER_NETWORK_CONFIG } from '@/lib/constants/config';
import { Vault__factory } from '@/contracts/factories/Vault__factory';
import ComposableStablePoolAbi from '@/lib/abi/ComposableStable.json';
import { Contract } from '@ethersproject/contracts';
import { parseFixed } from '@ethersproject/bignumber';
import { OldBigNumber, StableMaths } from '@balancer-labs/sor';
import { _upscale, SolidityMaths } from '@/lib/utils/solidityMaths';

dotenv.config();

const network = Network.MAINNET;
const rpcUrl = 'http://127.0.0.1:8545';
const alchemyRpcUrl = `${process.env.ALCHEMY_URL}`;
const blockNumber = 16720000;

const name = 'My-Test-Pool-Name';
const symbol = 'My-Test-Pool-Symbol';

const addresses = ADDRESSES[network];

const USDC_address = addresses.USDC.address;
const USDT_address = addresses.USDT.address;

const rateProviders = [AddressZero, AddressZero];

const exemptFromYieldProtocolFeeFlags = [false, false];
const tokenRateCacheDurations = ['0', '0'];
const factoryAddress = `${BALANCER_NETWORK_CONFIG[network].addresses.contracts.composableStablePoolFactory}`;
const owner = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const tokenAddresses = [USDC_address, USDT_address];
const slots = [addresses.USDC.slot, addresses.USDT.slot];
const balances = [
  parseFixed('1000000000', addresses.USDC.decimals).toString(),
  parseFixed('1000000000', addresses.USDT.decimals).toString(),
];
const amplificationParameter = '2';
const swapFee = '0.01';

describe('creating composable stable pool', async () => {
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl, network);
  const signer = provider.getSigner();
  const sdkConfig = {
    network,
    rpcUrl,
  };
  const balancer = new BalancerSDK(sdkConfig);
  const composableStablePoolFactory = balancer.pools.poolFactory.of(
    PoolType.ComposableStable
  );
  context('create', async () => {
    let poolAddress: string;
    before(async () => {
      await forkSetup(
        signer,
        tokenAddresses,
        slots,
        balances,
        alchemyRpcUrl,
        blockNumber,
        false
      );
    });
    it('should create a pool', async () => {
      const { to, data } = composableStablePoolFactory.create({
        factoryAddress,
        name,
        symbol,
        tokenAddresses,
        amplificationParameter,
        rateProviders,
        tokenRateCacheDurations,
        exemptFromYieldProtocolFeeFlags,
        swapFee,
        owner,
      });
      const signerAddress = await signer.getAddress();
      const { transactionReceipt } = await sendTransactionGetBalances(
        [],
        signer,
        signerAddress,
        to as string,
        data as string
      );
      const composableStableFactoryInterface = new Interface(
        composableStableFactoryAbi
      );
      const poolCreationEvent: LogDescription = findEventInReceiptLogs({
        to: factoryAddress,
        receipt: transactionReceipt,
        logName: 'PoolCreated',
        contractInterface: composableStableFactoryInterface,
      });
      if (poolCreationEvent) {
        poolAddress = poolCreationEvent.args.pool;
      }
      expect(!!poolCreationEvent).to.be.true;
      return;
    });
    it('should init join a pool', async () => {
      const signerAddress = await signer.getAddress();
      const composableStablePoolInterface = new Interface(
        ComposableStablePoolAbi
      );
      const pool = new Contract(
        poolAddress,
        composableStablePoolInterface,
        provider
      );
      const poolId = await pool.getPoolId();
      const scalingFactors = await pool.getScalingFactors();
      const amountsIn = [
        parseFixed('10000', 6).toString(),
        parseFixed('10000', 6).toString(),
      ];
      const { to, data } = composableStablePoolFactory.buildInitJoin({
        joiner: signerAddress,
        poolId,
        poolAddress,
        tokensIn: tokenAddresses,
        amountsIn,
      });
      const { transactionReceipt, balanceDeltas } =
        await sendTransactionGetBalances(
          [...tokenAddresses, poolAddress],
          signer,
          signerAddress,
          to,
          data
        );
      const vaultInterface = new Interface(Vault__factory.abi);
      const poolInitJoinEvent: LogDescription = findEventInReceiptLogs({
        receipt: transactionReceipt,
        to,
        contractInterface: vaultInterface,
        logName: 'PoolBalanceChanged',
      });
      expect(!!poolInitJoinEvent).to.be.true;
      expect(
        balanceDeltas
          .slice(0, amountsIn.length)
          .map((delta) => delta.toString())
      ).deep.equal(amountsIn);

      //Calculate and compare the bptAmountOut
      const poolInvariant = StableMaths._invariant(
        parseFixed(amplificationParameter, 3),
        amountsIn.map((amount, index) => {
          const upscaledAmount = _upscale(
            BigInt(amount),
            scalingFactors[index + 1].toBigInt()
          ).toString();
          return OldBigNumber(upscaledAmount, 10);
        })
      ).toString();
      // The amountOut of BPT shall be (invariant - 10e6) for equal amountsIn
      const bptAmountInvariantDelta = SolidityMaths.sub(
        BigInt(poolInvariant),
        BigInt(balanceDeltas[amountsIn.length].toString())
      );
      // 1e6 is the minimum bpt, this amount of token is sent to address 0 to prevent the Pool to ever be drained
      expect(bptAmountInvariantDelta).to.equal(BigInt(1e6));
    });
  });
});