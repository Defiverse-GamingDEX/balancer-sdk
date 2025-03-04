import { Contract } from '@ethersproject/contracts';
import { Provider } from '@ethersproject/providers';
import { Signer } from '@ethersproject/abstract-signer';
import { ContractAddresses } from '@/types';
import { Network } from '@/lib/constants/network';
import { BALANCER_NETWORK_CONFIG } from '@/lib/constants/config';
import { LidoRelayer__factory } from '@/contracts/factories/LidoRelayer__factory';
import { LidoRelayer } from '@/contracts/LidoRelayer';
import { BalancerHelpers } from '@/contracts/BalancerHelpers';
import { BalancerHelpers__factory } from '@/contracts/factories/BalancerHelpers__factory';
import { Vault__factory } from '@/contracts/factories/Vault__factory';
import { Vault } from '@/contracts/Vault';
import { Multicall } from './implementations/multicall';
import { ERC20 } from './implementations/ERC20';
import { BasePool } from './implementations/base-pool';
import { VeBal } from './implementations/veBAL';
import { VeBalProxy } from './implementations/veBAL-proxy';
import { Relayer } from './implementations/relayer';
import { LiquidityGauge } from './implementations/liquidity-gauge';
import { GaugeClaimHelper } from './implementations/GaugeClaimHelper';
import { ComposableStablePoolFactory } from '@/modules/contracts/implementations/composable-stable-pool-factory';
import { WeightedPoolFactory } from '@/modules/contracts/implementations/weighted-pool-factory';

type ContractFactory = (
  address: string,
  signerOrProvider: Signer | Provider
) => Contract;

export interface ContractInstances {
  balancerHelpers: BalancerHelpers;
  BasePool: ContractFactory;
  composableStablePoolFactory?: Contract;
  ERC20: ContractFactory;
  gaugeClaimHelper?: Contract;
  lidoRelayer?: LidoRelayer;
  liquidityGauge: ContractFactory;
  multicall: Contract;
  relayerV3?: Contract;
  relayerV4?: Contract;
  vault: Vault;
  veBal?: VeBal;
  veBalProxy?: VeBalProxy;
  weightedPoolFactory?: Contract;
}

export class Contracts {
  balancerHelpers: BalancerHelpers;
  composableStablePoolFactory?: Contract;
  contractAddresses: ContractAddresses;
  gaugeClaimHelper?: Contract;
  lidoRelayer?: LidoRelayer;
  multicall: Contract;
  relayerV3?: Contract;
  relayerV4?: Contract;
  vault: Vault;
  veBal?: VeBal;
  veBalProxy?: VeBalProxy;
  weightedPoolFactory?: Contract;

  /**
   * Create instances of Balancer contracts connected to passed provider.
   * @param { Network | ContractAddresses } networkOrAddresses
   * @param { Provider } provider
   */
  constructor(
    networkOrAddresses: Network | ContractAddresses,
    provider: Provider
  ) {
    // Access addresses using passed network if available
    if (typeof networkOrAddresses === 'number') {
      this.contractAddresses =
        BALANCER_NETWORK_CONFIG[networkOrAddresses].addresses.contracts;
    } else {
      this.contractAddresses = networkOrAddresses;
    }

    this.vault = Vault__factory.connect(this.contractAddresses.vault, provider);
    this.balancerHelpers = BalancerHelpers__factory.connect(
      this.contractAddresses.balancerHelpers,
      provider
    );

    if (this.contractAddresses.lidoRelayer)
      this.lidoRelayer = LidoRelayer__factory.connect(
        this.contractAddresses.lidoRelayer,
        provider
      );

    // These contracts aren't included in Balancer Typechain but are still useful.
    // TO DO - Possibly create via Typechain but seems unnecessary?
    this.multicall = Multicall(this.contractAddresses.multicall, provider);
    if (this.contractAddresses.relayerV3)
      this.relayerV3 = Relayer(this.contractAddresses.relayerV3, provider, 3);
    if (this.contractAddresses.relayerV4)
      this.relayerV4 = Relayer(this.contractAddresses.relayerV4, provider, 4);

    if (this.contractAddresses.veBal) {
      this.veBal = new VeBal(this.contractAddresses, provider);
    }

    if (this.contractAddresses.veBalProxy) {
      this.veBalProxy = new VeBalProxy(this.contractAddresses, provider);
    }

    if (this.contractAddresses.gaugeClaimHelper)
      this.gaugeClaimHelper = GaugeClaimHelper(
        this.contractAddresses.gaugeClaimHelper,
        provider
      );
    if (this.contractAddresses.composableStablePoolFactory) {
      this.composableStablePoolFactory = ComposableStablePoolFactory(
        this.contractAddresses.composableStablePoolFactory,
        provider
      );
    }
    if (this.contractAddresses.weightedPoolFactory) {
      this.weightedPoolFactory = WeightedPoolFactory(
        this.contractAddresses.weightedPoolFactory,
        provider
      );
    }
  }

  /**
   * Expose contract instances.
   */
  get contracts(): ContractInstances {
    return {
      balancerHelpers: this.balancerHelpers,
      BasePool: this.getBasePool,
      composableStablePoolFactory: this.composableStablePoolFactory,
      ERC20: this.getErc20,
      gaugeClaimHelper: this.gaugeClaimHelper,
      liquidityGauge: this.getLiquidityGauge,
      lidoRelayer: this.lidoRelayer,
      multicall: this.multicall,
      relayerV3: this.relayerV3,
      relayerV4: this.relayerV4,
      vault: this.vault,
      veBal: this.veBal,
      veBalProxy: this.veBalProxy,
      weightedPoolFactory: this.weightedPoolFactory,
    };
  }

  /**
   * Helper to create ERC20 contract.
   * @param { string } address ERC20 address.
   * @param { Signer | Provider } signerOrProvider Signer or Provider.
   * @returns Contract.
   */
  getErc20(address: string, signerOrProvider: Signer | Provider): Contract {
    return ERC20(address, signerOrProvider);
  }

  /**
   * Helper to create base pool contract.
   * @param { string } address pool address.
   * @param { Signer | Provider } signerOrProvider Signer or Provider.
   * @returns Contract.
   */
  getBasePool(address: string, signerOrProvider: Signer | Provider): Contract {
    return BasePool(address, signerOrProvider);
  }

  /**
   * Helper to create LiquidityGauge contract.
   * @param { string } address Gauge address.
   * @param { Signer | Provider} signerOrProvider Signer or Provider.
   * @returns Contract.
   */
  getLiquidityGauge(
    address: string,
    signerOrProvider: Signer | Provider
  ): Contract {
    return LiquidityGauge(address, signerOrProvider);
  }
}
