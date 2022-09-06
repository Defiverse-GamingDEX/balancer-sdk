import { Factory } from 'fishery';
import { SubgraphPoolBase, SubgraphToken } from '@balancer-labs/sor';
import { BigNumber, formatFixed, parseFixed } from '@ethersproject/bignumber';

import { subgraphToken, subgraphPoolBase } from './sor';
import { formatAddress, formatId } from '../lib/utils';
import { Zero, WeiPerEther } from '@ethersproject/constants';

type LinearTokens = {
  wrappedSymbol: string;
  mainSymbol: string;
};

export type LinearParams = {
  pools: {
    tokens: LinearTokens;
    balance: string;
  }[];
  parentsProportion?: string;
};

export interface Pool extends SubgraphPoolBase {
  proportionOfParent: string;
}

export type LinearInfo = {
  linearPools: Pool[];
  mainTokens: SubgraphToken[];
  wrappedTokens: SubgraphToken[];
  linearPoolTokens: SubgraphToken[];
};

export interface PhantomStableParams {
  id: string;
  symbol: string;
  address: string;
  childTokens: SubgraphToken[];
  tokenbalance: string;
}

export type PhantomStableInfo = {
  pool: Pool;
  poolToken: SubgraphToken;
};

export interface BoostedParams {
  linearPoolsParams: LinearParams;
  rootId: string;
  rootAddress: string;
  rootBalance: string;
  parentsProportion?: string;
}

export interface BoostedInfo extends LinearInfo {
  rootPool: Pool;
  rootPoolToken: SubgraphToken;
}

export interface BoostedMetaParams {
  childBoostedParams: BoostedParams;
  childLinearParam: LinearParams;
  rootId: string;
  rootAddress: string;
  rootBalance: string;
}

export interface ChildBoostedInfo extends BoostedInfo {
  proportion: string;
}

export interface BoostedMetaInfo {
  rootInfo: PhantomStableInfo;
  childBoostedInfo: ChildBoostedInfo;
  childLinearInfo: LinearInfo;
}

export interface BoostedMetaBigParams {
  rootId: string;
  rootAddress: string;
  rootBalance: string;
  childPools: BoostedParams[];
}

export interface BoostedMetaBigInfo {
  rootPool: Pool;
  rootPoolToken: SubgraphToken;
  childPoolsInfo: ChildBoostedInfo[];
  childPools: Pool[];
}

/*
Create a set of Linear pools and associated tokens:
LinearPools consisting of wrappedToken, mainToken, phantomBpt
*/
const linearPools = Factory.define<LinearInfo, LinearParams>(
  ({ transientParams }) => {
    const { pools, parentsProportion: proportionOfParent = '1' } =
      transientParams;
    if (pools === undefined) throw new Error('Need linear pool params');
    const linearPools: Pool[] = [];
    const mainTokens: SubgraphToken[] = [];
    const wrappedTokens: SubgraphToken[] = [];
    const linearPoolTokens: SubgraphToken[] = [];

    const totalBalance = pools.reduce(
      (total: BigNumber, pool) => total.add(pool.balance),
      Zero
    );
    pools?.forEach((pool) => {
      const poolAddress = formatAddress(
        `address-${pool.tokens.mainSymbol}_${pool.tokens.wrappedSymbol}`
      );
      const mainToken = subgraphToken
        .transient({
          symbol: pool.tokens.mainSymbol,
          balance: '1000000',
        })
        .build();
      const wrappedToken = subgraphToken
        .transient({
          symbol: pool.tokens.wrappedSymbol,
          balance: '9711834',
        })
        .build();
      const phantomBptToken = subgraphToken
        .transient({
          symbol: `b${pool.tokens.mainSymbol}_${pool.tokens.wrappedSymbol}`,
          balance: '5192296829399898',
          address: poolAddress,
        })
        .build();
      const linearPool = subgraphPoolBase.build({
        id: formatId(
          `id-${pool.tokens.mainSymbol}_${pool.tokens.wrappedSymbol}`
        ),
        address: poolAddress,
        poolType: 'AaveLinear',
        tokens: [mainToken, wrappedToken, phantomBptToken],
        wrappedIndex: 1,
        mainIndex: 0,
        tokensList: [
          mainToken.address,
          wrappedToken.address,
          phantomBptToken.address,
        ],
      });
      // Update the pool token to have the expected balance set in input
      phantomBptToken.balance = pool.balance;
      linearPoolTokens.push(phantomBptToken);
      mainTokens.push(mainToken);
      wrappedTokens.push(wrappedToken);
      const proportion = BigNumber.from(pool.balance)
        .mul(WeiPerEther)
        .div(totalBalance);
      const propOfParent = proportion
        .mul(parseFixed(proportionOfParent, 18))
        .div(WeiPerEther);
      linearPools.push({
        ...linearPool,
        proportionOfParent: formatFixed(propOfParent.toString(), 18),
      });
    });
    return {
      linearPools,
      mainTokens,
      wrappedTokens,
      linearPoolTokens,
    };
  }
);

/*
Create and return a phantomStable pool (with phantomBpt) and token.
*/
const phantomStablePool = Factory.define<
  PhantomStableInfo,
  PhantomStableParams
>(({ transientParams }) => {
  // Create phantomStable BPT
  const phantomBptToken = subgraphToken
    .transient({
      symbol: transientParams.symbol,
      balance: '5192296829399898', // need phantomBpt balance for pool
      address: transientParams.address,
    })
    .build();

  // Create phantomStable pool
  const pool = subgraphPoolBase.build({
    id: transientParams.id,
    address: transientParams.address,
    poolType: 'StablePhantom',
    totalWeight: undefined,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    tokens: [...transientParams.childTokens!, phantomBptToken],
  });

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  phantomBptToken.balance = transientParams.tokenbalance!;

  return {
    pool: { ...pool, proportionOfParent: '1' },
    poolToken: phantomBptToken,
  };
});

/*
Check a boostedPool, a phantomStable with all constituents being Linear.
Also creates associated LinearPools consisting of wrappedToken, mainToken, phantomBpt.
*/
const boostedPool = Factory.define<BoostedInfo, BoostedParams>(
  ({ transientParams }) => {
    const {
      linearPoolsParams,
      rootAddress = 'address_root',
      rootId = 'id_root',
      rootBalance = '1000000',
      parentsProportion = '1',
    } = transientParams;
    let linearPoolInfo;
    // Create linear pools and tokens
    if (linearPoolsParams)
      linearPoolInfo = linearPools
        .transient({
          ...linearPoolsParams,
          parentsProportion,
        })
        .build();
    else linearPoolInfo = linearPools.build();

    const rootPoolParams = {
      id: formatId(rootId),
      symbol: 'bRootPool',
      address: formatAddress(rootAddress),
      childTokens: linearPoolInfo.linearPoolTokens,
      tokenbalance: rootBalance,
    };
    const rootInfo = phantomStablePool.build({}, { transient: rootPoolParams });

    return {
      rootPool: rootInfo.pool,
      rootPoolToken: rootInfo.poolToken,
      linearPools: linearPoolInfo.linearPools,
      mainTokens: linearPoolInfo.mainTokens,
      wrappedTokens: linearPoolInfo.wrappedTokens,
      linearPoolTokens: linearPoolInfo.linearPoolTokens,
    };
  }
);

/*
Check a boostedMetaPool, a phantomStable with one Linear and one boosted.
Also creates associated boosted and LinearPools consisting of wrappedToken, mainToken, phantomBpt.
*/
const boostedMetaPool = Factory.define<BoostedMetaInfo, BoostedMetaParams>(
  ({ transientParams }) => {
    const {
      childBoostedParams,
      childLinearParam,
      rootAddress,
      rootId,
      rootBalance,
    } = transientParams;

    if (childBoostedParams === undefined || childLinearParam === undefined)
      throw Error('Missing Pool Params.');

    const rootTokenBalanceBoosted = BigNumber.from(
      childBoostedParams.rootBalance
    );
    const rootTokenBalanceLiner = BigNumber.from(
      childLinearParam.pools[0].balance
    );
    const totalTokenBalance = rootTokenBalanceBoosted.add(
      rootTokenBalanceLiner
    );

    const childBoostedProportion = formatFixed(
      rootTokenBalanceBoosted
        .mul(BigNumber.from(WeiPerEther))
        .div(totalTokenBalance),
      18
    );

    // Build child boostedPool
    const childBoostedInfo = boostedPool
      .transient({
        ...childBoostedParams,
        parentsProportion: childBoostedProportion,
      })
      .build();
    const childBoostedBpt = childBoostedInfo.rootPoolToken;

    const childLinearProportion = formatFixed(
      rootTokenBalanceLiner.mul(WeiPerEther).div(totalTokenBalance),
      18
    );

    // Build child Linear pool
    const childLinearInfo = linearPools
      .transient({
        pools: childLinearParam.pools,
        parentsProportion: childLinearProportion,
      })
      .build();

    const rootPoolParams = {
      id: formatId(rootId as string),
      symbol: 'rootPool',
      address: formatAddress(rootAddress as string),
      childTokens: [childBoostedBpt, ...childLinearInfo.linearPoolTokens],
      tokenbalance: rootBalance,
    };
    const rootInfo = phantomStablePool.build({}, { transient: rootPoolParams });

    return {
      rootInfo,
      childBoostedInfo: {
        ...childBoostedInfo,
        proportion: childBoostedProportion,
      },
      childLinearInfo,
    };
  }
);

/*
Check a boostedMetaBigPool, a phantomStable with two boosted.
Also creates associated boosted and LinearPools consisting of wrappedToken, mainToken, phantomBpt.
*/
const boostedMetaBigPool = Factory.define<
  BoostedMetaBigInfo,
  BoostedMetaBigParams
>(({ transientParams }) => {
  const childPoolsInfo: ChildBoostedInfo[] = [];
  // These will be used in parent pool
  const childPoolTokens: SubgraphToken[] = [];
  // These will include phantomStables and linear pools
  const childPools: Pool[] = [];

  if (transientParams.childPools === undefined)
    throw new Error(`Can't create boostedMetaBig without child pools.`);

  // TO DO - need proportions
  let totalTokenBalance = Zero;
  for (let i = 0; i < transientParams.childPools.length; i++) {
    const balance = transientParams.childPools[i].rootBalance;
    totalTokenBalance = totalTokenBalance.add(balance);
  }

  // Create each child boostedPool
  for (let i = 0; i < transientParams.childPools.length; i++) {
    const childPool = transientParams.childPools[i];
    const proportion = formatFixed(
      BigNumber.from(childPool.rootBalance)
        .mul(WeiPerEther)
        .div(totalTokenBalance),
      18
    );
    childPool.parentsProportion = proportion;
    const childBoosted = boostedPool.transient(childPool).build();
    childPoolsInfo.push({ ...childBoosted, proportion });
    childPools.push(childBoosted.rootPool, ...childBoosted.linearPools);
    childPoolTokens.push(childBoosted.rootPoolToken);
  }

  const phantomParams = {
    id: formatId(transientParams.rootId as string),
    symbol: 'parentPhantom',
    address: formatAddress(transientParams.rootAddress as string),
    childTokens: childPoolTokens,
    tokenbalance: transientParams.rootBalance,
  };
  const rootInfo = phantomStablePool.build({}, { transient: phantomParams });

  return {
    rootPool: rootInfo.pool,
    rootPoolToken: rootInfo.poolToken,
    childPoolsInfo,
    childPools,
  };
});

export { linearPools, boostedPool, boostedMetaPool, boostedMetaBigPool };