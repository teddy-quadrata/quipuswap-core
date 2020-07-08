#include "IDex.ligo"

type exchange_storage is record 
   tokenList: set (address);
   tokenToExchange: big_map(address, address);
   lambdas: big_map(nat, (dexAction * dex_storage * address) -> (list(operation) * dex_storage));
end

type full_exchange_storage is record
  storage: exchange_storage;
  lambdas: big_map(nat, (address * address * exchange_storage) -> (list(operation) * exchange_storage));
end

type exchangeAction is
| LaunchExchange of (address)
| TokenToExchangeLookup of (address * address * nat)
// | ConfigDex of (address)
| SetFunction of (nat * ((dexAction * dex_storage * address) -> (list(operation) * dex_storage)))