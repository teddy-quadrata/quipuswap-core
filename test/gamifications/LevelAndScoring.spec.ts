import { importKey, InMemorySigner } from "@taquito/signer";
import { MichelCodecPacker, MichelsonMap, TezosToolkit } from "@taquito/taquito"
import BigNumber from "bignumber.js";
import { transferToContract } from "../utils/Utils";

const scorerJsonCode = require('../../contracts/main/gamifications/Scorer.tz.json')
const dexJsonCode = require('../../contracts/main/DexFA12.tz.json')
const dummyFA12JsonCode = require('../../contracts/main/gamifications/DummyFA12.tz.json')
const scoreFA12JsonCode = require('../../contracts/main/gamifications/ScoreFA12.tz.json')
const accounts = require('../../scripts/sandbox/accounts')

const token_to_tez = require('../../contracts/partials/gamifications/lambda1.tz.json')
const tez_to_tokens = require('../../contracts/partials/gamifications/lambda2.tz.json')

const useTestNet = false


function getLevelStorage(dexAddr, scoreFA12Addr, levelTokenFA12Addr) {
    const ranks = new MichelsonMap();

    const levelStorage = {
        trading_pair: dexAddr, // contract of quipu contract
        level_token: levelTokenFA12Addr,  // contract of level token
        score_token: scoreFA12Addr,  // contract of score token
        score: 1,
        streak: 0,
        current_rank: 0,
        possible_ranks: ranks,
        multiplier: 1,
        owner: getAlice().pkh,
        principal: 0,
    }

    return levelStorage
}

function getDexStorage(tokenAddr) {

    const storage = {
        tez_pool: 1300, // make sure tez_pool/token_pool state vars are updated to reflect simulation values
        token_pool: 1000,
        token_address: tokenAddr, // address of token to be traded
        baker_validator: "KT1LcPGQzWWaqBdJKH32fn6RQXVeZPgutDqw",
        total_supply: 1300,
        ledger: MichelsonMap.fromLiteral({}),
        voters: MichelsonMap.fromLiteral({}),
        vetos: MichelsonMap.fromLiteral({}),
        votes: MichelsonMap.fromLiteral({}),
        veto: 0,
        last_veto: "2021-11-21T08:34:42Z",
        current_delegated: "tz1PFeoTuFen8jAMRHajBySNyCwLmY5RqF9M",
        current_candidate: "tz1VceyYUpq1gk5dtp6jXQRtCtY8hm5DKt72",
        total_votes: 0,
        reward: 0,
        total_reward: 0,
        reward_paid: 0,
        reward_per_share: 0,
        reward_per_sec: 0,
        last_update_time: "2021-11-21T08:34:42Z",
        period_finish: "2021-11-21T08:34:42Z",
        user_rewards: MichelsonMap.fromLiteral({})
    }


    const dex_lambdas = new MichelsonMap()
    dex_lambdas.set(1, tez_to_tokens)
    dex_lambdas.set(2, token_to_tez)


    const fullDexStorage = {
        storage: storage,
        metadata: MichelsonMap.fromLiteral({}),
        dex_lambdas: dex_lambdas,
        token_lambdas: MichelsonMap.fromLiteral({}),
    }

    return fullDexStorage
}

function getExtendedFA12(admins) {

    const tokens = new MichelsonMap()

    const allowances = new MichelsonMap()

    const token_metadata = new MichelsonMap()

    const token0 = new MichelsonMap()

    token_metadata.set(0, token0)

    const storage = {
        tokens: tokens,
        allowances: allowances,
        total_amount: 0,
    }

    const extendedStorage = {
        standards: storage,
        admins: admins,
        token_metadata: token_metadata
    }


    return extendedStorage;
}


function getAlice() {

    if(useTestNet){
        return accounts.alice_hangzhounet;
    }

    if(!useTestNet) {
        return accounts.alice;
    }
}

function getRpc() {

    if(useTestNet){
        return 'https://hangzhounet.api.tez.ie';
    }

    if(!useTestNet) {
        return 'http://localhost:8732';
    }
}



describe("BuildLevel()", function () {
    this.timeout(60000 * 30) // 30 min timeout

    let scorer, dex
    let wxtz, scoreFA12

    let scorerStorage, dexStorage
    let wxtzStorage, scoreFA12Storage

    before(async () => {
        console.log("BuildLevel Test")
        const tezos = new TezosToolkit(getRpc());

        if(!useTestNet) {
            tezos.setProvider({ signer: await InMemorySigner.fromSecretKey(getAlice().sk) })
        }

        if(useTestNet) {
            importKey(
                tezos,
                getAlice().email,
                getAlice().password,
                getAlice().mnemonic.join(' '),
                getAlice().activation_code
              );
        }


        tezos.setPackerProvider(new MichelCodecPacker());

        // deploy wxtz
        await tezos.contract.originate({
            code: dummyFA12JsonCode.text_code,
            storage: getExtendedFA12([getAlice().pkh]),
        }).then((originationOp) => {
            console.log(`Waiting for confirmation of origination for WXTZ: ${originationOp.contractAddress}...`);
            return originationOp.contract();
        }).then((contract) => {
            console.log(`WXTZ Origination completed.`);
            wxtz = contract
        }).catch((error) => console.log(`WXTZ Error: ${JSON.stringify(error, null, 2)}`));
        wxtzStorage = await wxtz.storage()

        // deploy ScoreFA12
        await tezos.contract.originate({
            code: scoreFA12JsonCode.text_code,
            storage: getExtendedFA12([getAlice().pkh]),
        }).then((originationOp) => {
            console.log(`Waiting for confirmation of origination for ScoreFA12: ${originationOp.contractAddress}...`);
            return originationOp.contract();
        }).then((contract) => {
            console.log(`ScoreFA12 Origination completed.`);
            scoreFA12 = contract
        }).catch((error) => console.log(`ScoreFA12 Error: ${JSON.stringify(error, null, 2)}`));
        scoreFA12Storage = await scoreFA12.storage()

        // deploy dex
        await tezos.contract.originate({
            code: dexJsonCode.text_code,
            storage: getDexStorage(wxtz.address),
        }).then((originationOp) => {
            console.log(`Waiting for confirmation of origination for Dex: ${originationOp.contractAddress}...`);
            return originationOp.contract();
        }).then((contract) => {
            console.log(`Dex Origination completed.`);
            dex = contract
        }).catch((error) => console.log(`Dex Error: ${JSON.stringify(error, null, 2)}`));
        dexStorage = await dex.storage()


        // give Dex KT 1300 mutez
        // Todo

        // give Dex KT 1000 wxtz tokens
        const op = await wxtz.methods.mint(dex.address, 1000).send()
        await op.confirmation()

        // deploy scorer
        await tezos.contract.originate({
            code: scorerJsonCode.text_code,
            storage: getLevelStorage(dex.address, scoreFA12.address, wxtz.address)
        }).then((originationOp) => {
            console.log(`Waiting for confirmation of origination for Scorer: ${originationOp.contractAddress}...`);
            return originationOp.contract();
        }).then((contract) => {
            console.log(`Scorer Origination completed.`);
            scorer = contract
        }).catch((error) => console.log(`Scorer Error: ${JSON.stringify(error, null, 2)}`));
        scorerStorage = await scorer.storage()

        const addAdminToScorer = await scoreFA12.methods.addAdmin(scorer.address).send()
        await addAdminToScorer.confirmation()
    });

    it("succeeds at calling tez_to_tokens and tokens_to_tez", async () => {
        const swap1 = await dex.methods.tezToTokenPayment(6, getAlice().pkh).send({amount: 100, mutez: true})
        await swap1.confirmation()

        const approveDex = await wxtz.methods.approve(dex.address, 16).send()
        await approveDex.confirmation()

        const swap2 = await dex.methods.tokenToTezPayment(16, 1, getAlice().pkh).send()
        await swap2.confirmation()

    })

    it("buys tokens and swaps from quipu", async () => {
        const op = await scorer.methods.buy(4).send({amount: 4, mutez: true})
        await op.confirmation()
    })

    it("sells tokens and swaps from quipu", async () => {

        const approveLevel = await wxtz.methods.approve(scorer.address, 4).send()
        await approveLevel.confirmation()

        const levelApproveDex = await scorer.methods.preSell(4).send()
        await levelApproveDex.confirmation()

        const sell = await scorer.methods.sell(4).send()
        await sell.confirmation()
    })
})