import { Findable, Pool, PoolAttribute } from '@/types';
import { MigrationPool, balancerRelayerInterface } from './builder';

/**
 * Foreach AaveLinear: AaveLinear > mainTokens > newAaveLinear
 *
 * @param fromTokens
 * @param toTokens
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const buildPaths = (
  fromTokens: MigrationPool[],
  toTokens: MigrationPool[],
  exitTokenIndex: number
) => {
  // Get the main token address for each pool
  const getMainToken = ({ tokens, mainIndex }: MigrationPool) =>
    (tokens && mainIndex && tokens[mainIndex].address) || '';
  const mainFromTokens = fromTokens.flatMap(getMainToken);
  const mainToTokens = toTokens.flatMap(getMainToken);

  // Find the index of the main token in both from and to pools
  const pathIndexes = mainFromTokens.map(
    (token, idx) => (token && [idx, mainToTokens.indexOf(token)]) || [-1, -1]
  );

  // Build the paths from the indexes
  const exitSwaps = pathIndexes.map(([fromIdx, toIdx]) => {
    if (fromIdx === -1 || toIdx === -1) {
      return [];
    }
    const fromPool = fromTokens[fromIdx];
    const toPool = toTokens[toIdx];
    return buildPath(fromPool, toPool);
  });

  // If we want to exit a specific token, return only that path
  if (exitTokenIndex > -1) {
    return [exitSwaps[exitTokenIndex]];
  }

  return exitSwaps;
};

const buildPath = (from: MigrationPool, to: MigrationPool) => {
  if (from.poolType?.match(/.*Linear.*/)) {
    return buildLinearPath(from, to);
  }

  return [];
};

const buildLinearPath = (from: MigrationPool, to: MigrationPool) => {
  if (
    !from.id ||
    !to.id ||
    !from.tokens ||
    !to.tokens ||
    !from.mainIndex ||
    !to.mainIndex
  ) {
    throw 'Missing tokens';
  }
  const mainToken = from.tokens[from.mainIndex];

  const path = [
    {
      poolId: from.id,
      assetIn: from.address,
      assetOut: mainToken.address,
    },
    {
      poolId: to.id,
      assetIn: mainToken.address,
      assetOut: to.address,
    },
  ];

  return path;
};

/**
 * Converts Subgraph Pool to MigrationPool
 * Recursively builds tokens
 *
 * @param id
 * @param repository
 * @returns
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const buildMigrationPool = async (
  id: string,
  repository: Findable<Pool, PoolAttribute>
) => {
  const pool = await repository.find(id);
  if (!pool) throw `Pool ${id} not found`;

  const findTokens = async (token: string, parentPool: string) => {
    let tokens: Array<MigrationPool> = [{ address: token }];
    const pool = await repository.findBy('address', token);
    if (pool && token != parentPool) {
      const sortedTokens = pool.tokens.sort(cmpTokens);
      const nestedTokens = await Promise.all(
        sortedTokens.map(({ address }) => findTokens(address, pool.address))
      );
      tokens = [
        {
          address: token,
          id: pool.id,
          poolType: pool.poolType,
          poolTypeVersion: pool.poolTypeVersion,
          mainIndex: pool.mainIndex,
          tokens: nestedTokens.flat(),
        },
      ];
    }
    return tokens;
  };

  // Sorts amounts out into ascending order (referenced to token addresses) to match the format expected by the Vault.
  const sortedTokens = pool.tokens.sort(cmpTokens);

  return {
    id,
    address: pool.address,
    tokens: (
      await Promise.all(
        sortedTokens.map(({ address }) => findTokens(address, pool.address))
      )
    ).flat(),
    poolType: pool.poolType,
    poolTypeVersion: pool.poolTypeVersion,
    mainIndex: pool.mainIndex,
  };
};

const cmpTokens = (tokenA: MigrationPool, tokenB: MigrationPool): number =>
  tokenA.address.toLowerCase() > tokenB.address.toLowerCase() ? 1 : -1;

/**
 * Decodes the relayer return value to get the minimum BPT out.
 *
 * @param relayerReturnValue
 * @returns
 */
export const getMinBptOut = (relayerReturnValue: string): string => {
  // Get last two positions of the return value, bptOut is the last one or the second to last one in case there is a gauge deposit
  // join and gauge deposit are always 0x, so any other value means that's the bptOut
  const multicallResult = balancerRelayerInterface.decodeFunctionResult(
    'multicall',
    relayerReturnValue
  );
  const minBptOut = multicallResult[0]
    .slice(-2)
    .filter((v: string) => v !== '0x');

  // NOTICE: When swapping from Linear Pools, the swap will query for the current wrapped token rate.
  // It is possible that the rate changes between the static call checking for the BPT out and the actual swap, causing it to fail.
  // To avoid this, we can add a small buffer to the min BPT out amount. eg. 1e11 which is 0.0001% of the BPT amount.
  const buffer =
    multicallResult[0].length == 4 || multicallResult[0].length == 6 ? 1e11 : 0;
  return String(BigInt(minBptOut) - BigInt(buffer));
};
