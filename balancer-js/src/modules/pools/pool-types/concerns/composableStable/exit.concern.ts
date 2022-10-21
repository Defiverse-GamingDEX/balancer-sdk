import {
  ExitConcern,
  ExitExactBPTInSingleTokenOutParameters,
  ExitExactTokensOutParameters,
  ExitPoolAttributes,
} from '../types';

export class ComposableStablePoolExit implements ExitConcern {
  buildExitSingleTokenOut = ({
    exiter,
    pool,
    bptIn,
    slippage,
    shouldUnwrapNativeAsset,
    wrappedNativeAsset,
    singleTokenMaxOut,
  }: ExitExactBPTInSingleTokenOutParameters): ExitPoolAttributes => {
    // TODO implementation
    console.log(
      exiter,
      pool,
      bptIn,
      slippage,
      shouldUnwrapNativeAsset,
      wrappedNativeAsset,
      singleTokenMaxOut
    );

    throw new Error('To be implemented');
  };

  buildExitExactTokensOut = ({
    exiter,
    pool,
    tokensOut,
    amountsOut,
    slippage,
    wrappedNativeAsset,
  }: ExitExactTokensOutParameters): ExitPoolAttributes => {
    // TODO implementation
    console.log(
      exiter,
      pool,
      tokensOut,
      amountsOut,
      slippage,
      wrappedNativeAsset
    );

    throw new Error('To be implemented');
  };
}