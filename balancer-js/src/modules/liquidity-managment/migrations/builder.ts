import { OutputReference, Relayer } from '@/modules/relayer/relayer.module';
import * as actions from '@/modules/relayer/actions';
import { buildPaths } from './helpers';
import balancerRelayerAbi from '@/lib/abi/BalancerRelayer.json';
import { Interface } from '@ethersproject/abi';
import { BigNumber } from '@ethersproject/bignumber';

const balancerRelayerInterface = new Interface(balancerRelayerAbi);

/**
 * Using array of objects to preserve the tokens order
 */
export interface MigrationPool {
  address: string;
  id?: string;
  poolType?: string;
  poolTypeVersion?: number;
  tokens?: MigrationPool[];
  mainIndex?: number;
}

export const migrationBuilder = (
  user: string,
  relayer: string,
  bptAmount: string,
  from: MigrationPool,
  to: MigrationPool,
  fromGauge?: string,
  toGauge?: string
): string => {
  if (
    !from.id ||
    !to.id ||
    !from.tokens ||
    !to.tokens ||
    !from.poolType ||
    !to.poolType
  ) {
    throw 'Pool data is missing';
  }

  // Define tokens
  const fromTokens = from.tokens.flatMap(({ address }) => address);
  const toTokens = to.tokens.flatMap(({ address }) => address);

  // Prefer proportional exit, except for ComposableStableV1
  // Choose 0 as the exit token index
  // TODO: make default exit token dynamic
  const exitTokenIndex =
    from.poolType === 'ComposableStable' && from.poolTypeVersion == 1 ? 0 : -1;

  // Define output references
  let exitOutputReferences: OutputReference[];
  let swapOutputReferences: BigNumber[] = [];
  if (exitTokenIndex > -1) {
    exitOutputReferences = [
      {
        index: exitTokenIndex,
        key: Relayer.toChainedReference(`10${exitTokenIndex}`),
      },
    ];
    swapOutputReferences = [Relayer.toChainedReference(`20${exitTokenIndex}`)];
  } else {
    exitOutputReferences = fromTokens.map((_, idx) => ({
      index: idx,
      key: Relayer.toChainedReference(`10${idx}`),
    }));
    swapOutputReferences = fromTokens.map((_, idx) =>
      Relayer.toChainedReference(`20${idx}`)
    );
  }

  const joinAmount = Relayer.toChainedReference('999');

  // Configure migration steps
  const migrationSteps = [];
  const needsExit = true;
  const needsJoin = true;
  let needsSwap = false;

  if (from.poolType === 'ComposableStable') {
    needsSwap = true;
  }

  // 1. Withdraw from old gauge
  if (fromGauge) {
    migrationSteps.push(
      actions.gaugeWithdrawal(fromGauge, user, relayer, bptAmount)
    );
  }

  // 2. Exit old pool
  if (needsExit) {
    migrationSteps.push(
      actions.exit(
        from.id,
        fromTokens,
        exitTokenIndex,
        exitOutputReferences,
        bptAmount,
        fromGauge ? relayer : user,
        relayer,
        from.poolType == 'ComposableStable'
      )
    );
  }

  // 3. Swap
  if (needsSwap) {
    const swapPaths = buildPaths(from.tokens, to.tokens, exitTokenIndex);

    // Match exit to swap amounts
    const swaps = swapPaths
      .map((path, idx) => ({
        path,
        inputAmount: String(exitOutputReferences[idx].key),
        outputReference: swapOutputReferences[idx],
      }))
      .filter(({ path }) => path.length > 0);

    migrationSteps.push(actions.swaps(relayer, relayer, swaps));
  }

  // 3. Join
  const minBptOut = '0';

  if (needsJoin) {
    // Match swap or exit references to the positions of join tokens
    // In case no reference is defined, the default is 0
    const references = toTokens
      .filter((address) => to.address != address)
      .map((to) => {
        const fromIdx = fromTokens.indexOf(to);
        return String(
          (needsSwap && swapOutputReferences[fromIdx]) ||
            exitOutputReferences[fromIdx]?.key ||
            0
        );
      });

    migrationSteps.push(
      actions.join(
        to.id,
        toTokens,
        references,
        minBptOut,
        String(joinAmount),
        relayer,
        toGauge ? relayer : user,
        true
      )
    );
  }

  // 4. Deposit to the new gauge
  if (toGauge) {
    migrationSteps.push(
      actions.gaugeDeposit(toGauge, relayer, user, String(joinAmount))
    );
  }

  const callData = balancerRelayerInterface.encodeFunctionData('multicall', [
    migrationSteps,
  ]);

  return callData;
};
