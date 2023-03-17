import { Findable, Pool, PoolAttribute } from '@/types';
import { JsonRpcProvider } from '@ethersproject/providers';
import { ERC20 } from '../contracts/implementations/ERC20';
import { SubgraphLiquidityGauge } from '../subgraph/subgraph';
import { migrationBuilder } from './migrations/builder';
import { buildMigrationPool } from './migrations/helpers';

/**
 * This class is responsible for building the transaction used to migrate the liquidity.
 *
 * @example
 * ```typescript
 * const sdk = new BalancerSDK({
 *   network: 1,
 *   rpcUrl: 'https://rpc.ankr.com/eth',
 * })
 *
 * const migrations = new Migrations(
 *   sdk.networkConfig.addresses.contracts.relayerV4 as string,
 *   sdk.data.pools,
 *   sdk.data.liquidityGauges.subgraph,
 *   sdk.provider
 * )
 *
 * const user = '0xfacec29Ae158B26e234B1a81Db2431F6Bd8F8cE8'
 * const from = '0x32296969ef14eb0c6d29669c550d4a0449130230000200000000000000000080'
 * const to = '0x32296969ef14eb0c6d29669c550d4a0449130230000200000000000000000080'
 * const { to, data } = await migrations.pool2pool(user, from, to)
 *
 * const tx = await sdk.provider.sendTransaction({ to, data })
 * ```
 */
export class Migrations {
  constructor(
    public relayerAddress: string,
    public poolsRepository: Findable<Pool, PoolAttribute>,
    public gaugesRepository: Findable<SubgraphLiquidityGauge>,
    public provider: JsonRpcProvider
  ) {}

  /**
   * Takes user, from and to pool IDs as strings and returns the transaction data
   *
   * @param user - user address
   * @param from - pool address
   * @param to - pool address
   * @returns transaction data
   */
  async pool2pool(
    user: string,
    from: string,
    to: string
  ): Promise<{ to: string; data: string }> {
    const fromPool = await buildMigrationPool(from, this.poolsRepository);
    const toPool = await buildMigrationPool(to, this.poolsRepository);
    const balance = await ERC20(fromPool.address, this.provider).balanceOf(
      user
    );

    const data = migrationBuilder(
      user,
      this.relayerAddress,
      String(balance),
      fromPool,
      toPool
    );

    return {
      to: this.relayerAddress,
      data,
    };
  }

  /**
   * Takes user, from and to pool IDs as strings and returns the transaction data
   * for a migration including unstaking and restaking
   *
   * @param user - user address
   * @param from - pool address
   * @param to - pool address
   * @returns transaction data
   */
  async gauge2gauge(
    user: string,
    from: string,
    to: string
  ): Promise<{ to: string; data: string }> {
    const fromGauge = await this.gaugesRepository.findBy('poolId', from);
    const toGauge = await this.gaugesRepository.findBy('poolId', to);
    if (!fromGauge || !fromGauge.poolId || !toGauge || !toGauge.poolId) {
      throw new Error('Gauge not found');
    }
    const fromPool = await buildMigrationPool(
      fromGauge.poolId,
      this.poolsRepository
    );
    const toPool = await buildMigrationPool(
      toGauge.poolId,
      this.poolsRepository
    );
    const balance = await ERC20(fromGauge.id, this.provider).balanceOf(user);

    const data = migrationBuilder(
      user,
      this.relayerAddress,
      String(balance),
      fromPool,
      toPool,
      fromGauge.id,
      toGauge.id
    );

    return {
      to: this.relayerAddress,
      data,
    };
  }
}
