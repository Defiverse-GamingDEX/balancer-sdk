import { BigNumber } from '@ethersproject/bignumber';
import { MaxInt256 } from '@ethersproject/constants';
import { defaultAbiCoder } from '@ethersproject/abi';
import { BatchSwapStep, SwapType } from '../swaps/types';
import { Relayer } from './relayer.module';
import { OutputReference } from './types';

export const gaugeWithdrawal = Relayer.encodeGaugeWithdraw;
export const gaugeDeposit = Relayer.encodeGaugeDeposit;

/**
 * Encodes exitPool callData.
 * Exit pool to underlying tokens and assigns output references to the exit amounts.
 *
 * @param poolId Pool ID.
 * @param assets Ordered pool tokens.
 * @param singleTokenExit When
 * @param outputReferences reference to exit amounts for the next transaction
 * @param amount Amount of BPT to exit with.
 * @param sender Sender address.
 * @param recipient Recipient address.
 * @param isComposable Whether the poolType is ComposableStable or not.
 * @param toInternalBalance Use internal balance or not.
 * @returns Encoded exitPool call.
 */
export const exit = (
  poolId: string,
  assets: string[],
  exitTokenIndex = -1,
  outputReferences: OutputReference[],
  amount: string,
  sender: string,
  recipient: string,
  isComposable = false,
  toInternalBalance = true
): string => {
  let userData: string;

  // Exit pool proportionally or to a singleToken
  if (exitTokenIndex > -1) {
    userData = defaultAbiCoder.encode(
      ['uint256', 'uint256', 'uint256'],
      [0, amount, exitTokenIndex]
    );
  } else {
    const exitType = isComposable ? 2 : 1;
    userData = defaultAbiCoder.encode(
      ['uint256', 'uint256'],
      [exitType, amount]
    );
  }

  // Encode exit pool data
  const callData = Relayer.encodeExitPool({
    poolId,
    poolKind: isComposable ? 0 : 0,
    sender,
    recipient,
    outputReferences,
    exitPoolRequest: {
      assets,
      minAmountsOut: new Array(assets.length).fill('0'),
      userData,
      toInternalBalance,
    },
  });

  return callData;
};

/**
 * Encodes joinPool callData.
 * Joins pool with underlying tokens and assigns output reference to the BPT amount.
 *
 * @param poolId Pool ID.
 * @param assets Ordered pool tokens.
 * @param amountsIn Amounts of tokens to join with.
 * @param minimumBPT Minimum BPT amount to receive.
 * @param outputReference reference to BPT amount for the next transaction
 * @param sender Sender address.
 * @param recipient Recipient address.
 * @param fromInternalBalance Use internal balance or not.
 * @returns Encoded joinPool call.
 */
export const join = (
  poolId: string,
  assets: string[],
  amountsIn: string[],
  minimumBPT: string,
  outputReference: string,
  sender: string,
  recipient: string,
  fromInternalBalance = true
): string => {
  const maxAmountsIn = assets.map(() => MaxInt256);

  // Encoding join pool data with the type exactTokensIn (1)
  const userData = defaultAbiCoder.encode(
    ['uint256', 'uint256[]', 'uint256'],
    [1, amountsIn, minimumBPT]
  );

  const callData = Relayer.encodeJoinPool({
    poolId,
    kind: 0,
    sender,
    recipient,
    joinPoolRequest: {
      assets,
      maxAmountsIn,
      userData,
      fromInternalBalance,
    },
    value: '0',
    outputReference,
  });

  return callData;
};

/**
 * Creates encoded batchSwap callData
 * outputReferences contain the output amount for swap's last token
 *
 * @param sender Sender address.
 * @param recipient Recipient address.
 * @param swaps List of swaps to execute.
 * @param deadline Deadline for the transaction.
 * @param toInternalBalance Use internal balance or not.
 * @returns Encoded batchSwap call
 */
export const swaps = (
  sender: string,
  recipient: string,
  swaps: {
    path: {
      poolId: string;
      assetIn: string;
      assetOut: string;
    }[];
    inputAmount: string;
    outputReference: BigNumber;
  }[],
  deadline?: string,
  toInternalBalance = true
): string => {
  const assets: string[] = [];
  const limits: string[] = [];
  const outputReferences: { index: number; key: BigNumber }[] = [];
  const batchSwaps: BatchSwapStep[] = [];

  // Convert paths into batchSwap steps
  swaps.forEach((swap) => {
    const { path, inputAmount, outputReference } = swap;

    for (let i = 0; i < path.length; i++) {
      const { poolId, assetIn, assetOut } = path[i];

      assets.push(assetIn);
      assets.push(assetOut);

      limits.push(MaxInt256.toString());
      limits.push('0');

      const assetInIndex = i * 2;
      const assetOutIndex = i * 2 + 1;

      const swap: BatchSwapStep = {
        poolId,
        assetInIndex,
        assetOutIndex,
        amount: i === 0 ? inputAmount : '0',
        userData: '0x',
      };

      batchSwaps.push(swap);
    }

    // Add output reference for the last swap
    outputReferences.push({ index: path.length * 2 - 1, key: outputReference });
  });

  const funds = {
    sender,
    recipient,
    fromInternalBalance: true,
    toInternalBalance,
  };

  const encodedBatchSwap = Relayer.encodeBatchSwap({
    swapType: SwapType.SwapExactIn,
    swaps: batchSwaps,
    assets,
    funds,
    limits,
    deadline: deadline || BigNumber.from(Math.ceil(Date.now() / 1000) + 3600), // 1 hour from now
    value: '0',
    outputReferences,
  });

  return encodedBatchSwap;
};
