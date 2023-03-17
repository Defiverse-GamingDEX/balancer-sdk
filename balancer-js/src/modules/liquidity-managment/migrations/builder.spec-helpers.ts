import { SubgraphLiquidityGauge } from '@/modules/subgraph/subgraph';
import { factories } from '@/test/factories';
import { Pool, PoolType } from '@/types';

export const metaStable = {
  id: '0x32296969ef14eb0c6d29669c550d4a0449130230000200000000000000000080',
  address: '0x32296969ef14eb0c6d29669c550d4a0449130230',
  tokens: [
    { address: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0' },
    { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' },
  ],
  poolType: 'Metastable',
  poolTypeVersion: 1,
};

const tokens = ['DAI', 'USDC', 'USDT'].map((symbol) => [
  factories.poolTokenFactory.transient({ symbol: `a${symbol}` }).build(),
  factories.poolTokenFactory.transient({ symbol: `b${symbol}` }).build(),
  factories.poolTokenFactory.transient({ symbol: `${symbol}` }).build(),
]);

export const bDaiPool = factories.poolFactory.build({
  id: '0xae37d54ae477268b9997d4161b96b8200755935c000000000000000000000337',
  address: tokens[0][1].address,
  poolType: PoolType.AaveLinear,
  mainIndex: 1,
  tokens: [tokens[0][1], tokens[0][0], tokens[0][2]],
});

export const bUsdcPool = factories.poolFactory.build({
  id: '0x82698aecc9e28e9bb27608bd52cf57f704bd1b83000000000000000000000336',
  address: tokens[1][1].address,
  poolType: PoolType.AaveLinear,
  mainIndex: 1,
  tokens: [tokens[1][1], tokens[1][0], tokens[1][2]],
});

export const bUsdtPool = factories.poolFactory.build({
  id: '0x2f4eb100552ef93840d5adc30560e5513dfffacb000000000000000000000334',
  address: tokens[2][1].address,
  poolType: PoolType.AaveLinear,
  mainIndex: 1,
  tokens: [tokens[2][1], tokens[2][0], tokens[2][2]],
});

export const composableStable = {
  id: '0xa13a9247ea42d743238089903570127dda72fe4400000000000000000000035d',
  address: '0xa13a9247ea42d743238089903570127dda72fe44',
  tokens: [
    { address: '0xa13a9247ea42d743238089903570127dda72fe44', balance: '1' },
    tokens[0][1],
    tokens[1][1],
    tokens[2][1],
  ],
  poolType: 'ComposableStable',
  poolTypeVersion: 1,
};

const poolsMap = new Map([
  [metaStable.id, metaStable as Pool],
  [composableStable.id, composableStable as Pool],
  [bDaiPool.id, bDaiPool as Pool],
  [bUsdcPool.id, bUsdcPool as Pool],
  [bUsdtPool.id, bUsdtPool as Pool],
]);

export const poolRepository = factories.data.findable<Pool>(poolsMap);

const metaStableGauge = '0xcd4722b7c24c29e0413bdcd9e51404b4539d14ae';
const composableStableGauge = '0xa6325e799d266632d347e41265a69af111b05403';
const gaugesMap = new Map([
  [
    composableStableGauge,
    {
      id: composableStableGauge,
      poolId:
        '0xa13a9247ea42d743238089903570127dda72fe4400000000000000000000035d',
    } as unknown as SubgraphLiquidityGauge,
  ],
  [
    metaStableGauge,
    {
      id: metaStableGauge,
      poolId:
        '0x32296969ef14eb0c6d29669c550d4a0449130230000200000000000000000080',
    } as unknown as SubgraphLiquidityGauge,
  ],
]);

export const gaugesRepository =
  factories.data.findable<SubgraphLiquidityGauge>(gaugesMap);
