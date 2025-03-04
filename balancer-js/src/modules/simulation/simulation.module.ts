import { PoolDataService } from '@balancer-labs/sor';
import { defaultAbiCoder } from '@ethersproject/abi';
import TenderlyHelper from '@/lib/utils/tenderlyHelper';
import { BalancerNetworkConfig } from '@/types';
import { VaultModel, Requests } from '../vaultModel/vaultModel.module';
import { JsonRpcSigner } from '@ethersproject/providers';

export enum SimulationType {
  Tenderly,
  VaultModel,
  Static,
}

/**
 * Simulation module is responsible for simulating the results of a generalised
 * join or exit using different types of simulation, such as:
 * - Tenderly: uses Tenderly Simulation API (third party service)
 * - VaultModel: uses TS math, which may be less accurate (min. 99% accuracy)
 * - Static: uses staticCall, which is 100% accurate but requires vault approval
 *
 * This module allows a user to perform a simulation and check for expected
 * amounts out in order to make an informed decision on whether to proceed with
 * the transaction. These expected amounts out can be used as limits to prevent
 * frontrunning and ensure that the transaction will return minimum amounts out.
 */

export class Simulation {
  private tenderlyHelper: TenderlyHelper;
  private vaultModel: VaultModel | undefined;
  constructor(
    networkConfig: BalancerNetworkConfig,
    poolDataService?: PoolDataService
  ) {
    this.tenderlyHelper = new TenderlyHelper(
      networkConfig.chainId,
      networkConfig.tenderly
    );
    if (!poolDataService) {
      this.vaultModel = undefined;
    } else {
      this.vaultModel = new VaultModel(
        poolDataService,
        networkConfig.addresses.tokens.wrappedNativeAsset
      );
    }
  }

  simulateGeneralisedJoin = async (
    to: string,
    multiRequests: Requests[][],
    encodedCall: string,
    outputIndexes: number[],
    userAddress: string,
    tokensIn: string[],
    signer: JsonRpcSigner,
    simulationType: SimulationType
  ): Promise<string[]> => {
    const amountsOut: string[] = [];
    switch (simulationType) {
      case SimulationType.Tenderly: {
        const simulationResult = await this.tenderlyHelper.simulateMulticall(
          to,
          encodedCall,
          userAddress,
          tokensIn
        );
        amountsOut.push(...this.decodeResult(simulationResult, outputIndexes));
        break;
      }

      case SimulationType.VaultModel: {
        const requestResult = await this.simulateRequests(multiRequests);
        amountsOut.push(...requestResult);
        break;
      }
      case SimulationType.Static: {
        const gasLimit = 8e6;
        const staticResult = await signer.call({
          to,
          data: encodedCall,
          gasLimit,
        });
        amountsOut.push(...this.decodeResult(staticResult, outputIndexes));
        break;
      }
      default:
        throw new Error('Simulation type not supported');
    }
    return amountsOut;
  };

  simulateGeneralisedExit = async (
    to: string,
    multiRequests: Requests[][],
    encodedCall: string,
    outputIndexes: number[],
    userAddress: string,
    tokenIn: string,
    signer: JsonRpcSigner,
    simulationType: SimulationType
  ): Promise<string[]> => {
    const amountsOut: string[] = [];
    switch (simulationType) {
      case SimulationType.Tenderly: {
        const simulationResult = await this.tenderlyHelper.simulateMulticall(
          to,
          encodedCall,
          userAddress,
          [tokenIn]
        );
        amountsOut.push(...this.decodeResult(simulationResult, outputIndexes));
        break;
      }

      case SimulationType.VaultModel: {
        const requestResult = await this.simulateRequests(multiRequests);
        amountsOut.push(...requestResult);
        break;
      }
      case SimulationType.Static: {
        const gasLimit = 8e6;
        const staticResult = await signer.call({
          to,
          data: encodedCall,
          gasLimit,
        });
        amountsOut.push(...this.decodeResult(staticResult, outputIndexes));
        break;
      }
      default:
        throw new Error('Simulation type not supported');
    }
    return amountsOut;
  };

  private decodeResult = (result: string, outputIndexes: number[]) => {
    const multicallResult = defaultAbiCoder.decode(
      ['bytes[]'],
      result
    )[0] as string[];

    // Decode each root output
    const amountsOut = outputIndexes.map((outputIndex) => {
      const result = defaultAbiCoder.decode(
        ['uint256'],
        multicallResult[outputIndex]
      );
      return result.toString();
    });

    return amountsOut;
  };

  private simulateRequests = async (multiRequests: Requests[][]) => {
    if (this.vaultModel === undefined)
      throw new Error('Missing Vault Model Config.');
    // make one multicall for each exitPath
    // take only bptOut/tokenOut delta into account
    // -- works only with single bpt/token out --
    const amountsOut: string[] = [];
    for (const [i, requests] of multiRequests.entries()) {
      const deltas = await this.vaultModel.multicall(requests, i === 0);
      const tokenOutDelta = Object.values(deltas)
        .find((d) => d.lt(0))
        ?.mul(-1);
      if (!tokenOutDelta) throw new Error('No delta found for token out.');
      amountsOut.push(tokenOutDelta.toString());
    }
    return amountsOut;
  };
}
