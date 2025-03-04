// yarn test:only ./src/modules/pools/pool-types/concerns/composableStable/exitV1.concern.integration.spec.ts
import dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { parseFixed } from '@ethersproject/bignumber';
import { getPoolAddress, Network, PoolWithMethods, removeItem } from '@/.';
import { forkSetup, TestPoolHelper } from '@/test/lib/utils';
import {
  testExactBptIn,
  testExactTokensOut,
  testRecoveryExit,
} from '@/test/lib/exitHelper';

dotenv.config();

const network = Network.MAINNET;
const { ALCHEMY_URL: jsonRpcUrl } = process.env;
const rpcUrl = 'http://127.0.0.1:8545';
const provider = new ethers.providers.JsonRpcProvider(rpcUrl, network);
const signer = provider.getSigner();
const blockNumber = 16350000;
const testPoolId =
  '0xa13a9247ea42d743238089903570127dda72fe4400000000000000000000035d';
let pool: PoolWithMethods;

describe('ComposableStableV1 Exits', () => {
  beforeEach(async () => {
    // Setup forked network, set initial token balances and allowances
    await forkSetup(
      signer,
      [getPoolAddress(testPoolId)],
      [0],
      [parseFixed('10000', 18).toString()],
      jsonRpcUrl as string,
      blockNumber
    );
    // Updatate pool info with onchain state from fork block no
    const testPoolHelper = new TestPoolHelper(
      testPoolId,
      network,
      rpcUrl,
      blockNumber
    );
    pool = await testPoolHelper.getPool();
  });
  context('exitExactBPTIn', async () => {
    it('single token max out', async () => {
      const bptIn = parseFixed('10', 18).toString();
      const tokenOut = pool.tokensList[1];
      await testExactBptIn(pool, signer, bptIn, tokenOut);
    });
    it('single token max out, token out after BPT index', async () => {
      const bptIn = parseFixed('10', 18).toString();
      const tokenOut = pool.tokensList[3];
      await testExactBptIn(pool, signer, bptIn, tokenOut);
    });
  });

  context('exitExactTokensOut', async () => {
    it('all tokens with value', async () => {
      const tokensOut = removeItem(pool.tokensList, pool.bptIndex);
      const amountsOut = tokensOut.map((_, i) =>
        parseFixed(((i + 1) * 100).toString(), 18).toString()
      );
      await testExactTokensOut(pool, signer, tokensOut, amountsOut);
    });
    it('single token with value', async () => {
      const tokensOut = removeItem(pool.tokensList, pool.bptIndex);
      const amountsOut = Array(tokensOut.length).fill('0');
      amountsOut[0] = parseFixed('202', 18).toString();
      await testExactTokensOut(pool, signer, tokensOut, amountsOut);
    });
    it('single token with value, token out after BPT index', async () => {
      const tokensOut = removeItem(pool.tokensList, pool.bptIndex);
      const amountsOut = Array(tokensOut.length).fill('0');
      amountsOut[2] = parseFixed('202', 18).toString();
      await testExactTokensOut(pool, signer, tokensOut, amountsOut);
    });
  });
  context('buildRecoveryExit', async () => {
    it('proportional exit', async () => {
      const bptIn = parseFixed('10', 18).toString();
      await testRecoveryExit(pool, signer, bptIn);
    });
  });
});
