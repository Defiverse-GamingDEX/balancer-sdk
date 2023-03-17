/**
 * Display APRs for pool ids hardcoded under `const ids`
 * Run command: yarn examples:run ./examples/liquidity-managment/migrations.ts
 */
import { BalancerSDK, Migrations } from '@/.'

const sdk = new BalancerSDK({
  network: 1,
  rpcUrl: 'https://rpc.ankr.com/eth',
})

if (!sdk.data.liquidityGauges) {
  throw new Error('No liquidity gauges repository found')
}

const migrations = new Migrations(
  sdk.networkConfig.addresses.contracts.relayerV4 as string,
  sdk.data.pools,
  sdk.data.liquidityGauges.subgraph,
  sdk.provider
)

const main = async () => {
  const user = '0xfacec29Ae158B26e234B1a81Db2431F6Bd8F8cE8'
  const from = '0x32296969ef14eb0c6d29669c550d4a0449130230000200000000000000000080'
  const to = '0x32296969ef14eb0c6d29669c550d4a0449130230000200000000000000000080'
  const { data } = await migrations.pool2pool(user, from, to)

  console.log(data)
}

main()
