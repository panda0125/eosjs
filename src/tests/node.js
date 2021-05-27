const { JsonRpc, Api } = require('../../dist');
const { JsSignatureProvider } = require('../../dist/eosjs-jssig');
const { WebCryptoSignatureProvider } = require('../../dist/eosjs-webcrypto-sig');
const { generateWebCryptoKeyPair, PublicKey } = require('../../dist/eosjs-key-conversions');
const fetch = require('node-fetch');
const { TextEncoder, TextDecoder } = require('util');

const privateKey = '5JuH9fCXmU3xbj8nRmhPZaVrxxXrdPaRmZLW1cznNTmTQR2Kg5Z'; // replace with "bob" account private key
const r1PrivateKey = 'PVT_R1_GrfEfbv5at9kbeHcGagQmvbFLdm6jqEpgE1wsGbrfbZNjpVgT';
const cfactorPrivateKey = '5K8Sm2bB2b7ZC8tJMefrk1GFa4jgtHxxHRcjX49maMk9AEwq8hN';
/* new accounts for testing can be created by unlocking a cleos wallet then calling:
 * 1) cleos create key --to-console (copy this privateKey & publicKey)
 * 2) cleos wallet import
 * 3) cleos create account bob publicKey
 * 4) cleos create account alice publicKey
 */

const rpc = new JsonRpc('http://localhost:8888', { fetch });
const signatureProvider = new JsSignatureProvider([privateKey, r1PrivateKey, cfactorPrivateKey]);
const webCryptoSignatureProvider = new WebCryptoSignatureProvider();
const api = new Api({ rpc, signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() });
const apiWebCrypto = new Api({ rpc, signatureProvider: webCryptoSignatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() });

const transactWithConfig = async (config, memo, from = 'bob', to = 'alice') => {
    return await api.transact({
        actions: [{
            account: 'eosio.token',
            name: 'transfer',
            authorization: [{
                actor: from,
                permission: 'active',
            }],
            data: {
                from,
                to,
                quantity: '0.0001 SYS',
                memo,
            },
        }]
    }, config);
};

const transactWithoutConfig = async () => {
    const transactionResponse = await transactWithConfig({ blocksBehind: 3, expireSeconds: 30}, 'transactWithoutConfig');
    const blockInfo = await rpc.get_block_info(transactionResponse.processed.block_num - 3);
    const currentDate = new Date();
    const timePlusTen = currentDate.getTime() + 10000;
    const timeInISOString = (new Date(timePlusTen)).toISOString();
    const expiration = timeInISOString.substr(0, timeInISOString.length - 1);

    return await api.transact({
        expiration,
        ref_block_num: blockInfo.block_num & 0xffff,
        ref_block_prefix: blockInfo.ref_block_prefix,
        actions: [{
            account: 'eosio.token',
            name: 'transfer',
            authorization: [{
                actor: 'bob',
                permission: 'active',
            }],
            data: {
                from: 'bob',
                to: 'alice',
                quantity: '0.0001 SYS',
                memo: 'transactWithoutConfig2',
            },
        }]
    });
};

const transactWithContextFreeAction = async () => {
    return await api.transact({
        actions: [{
            account: 'cfhello',
            name: 'normal',
            authorization: [{
                actor: 'cfactor',
                permission: 'active'
            }],
            data: {
                user: 'test'
            }
        }],
        context_free_actions: [{
            account: 'cfhello',
            name: 'contextfree',
            authorization: [],
            data: {}
        }]
    }, {
        blocksBehind: 3,
        expireSeconds: 30
    });
};

const transactWithContextFreeData = async () => {
    return await api.transact({
        actions:[{
            account: 'cfhello',
            name: 'normal',
            authorization: [{
                actor: 'cfactor',
                permission: 'active'
            }],
            data: {
                user: 'test2'
            }
        }],
        context_free_actions: [{
            account: 'cfhello',
            name: 'contextfree',
            authorization: [],
            data: {}
        }],
        context_free_data: [[ '74657374', '7465737464617461' ]]
    }, {
        blocksBehind: 3,
        expireSeconds: 30
    });
};

const transactWithShorthandApiJson = async () => {
    await api.getAbi('eosio.token');
    return await api.transact({
        actions: [
            api.with('eosio.token').as('bob').transfer('bob', 'alice', '0.0001 SYS', 'transactWithShorthandApiJson')
        ]
    }, {
        blocksBehind: 3,
        expireSeconds: 30
    });
};

const transactWithShorthandTxJson = async () => {
    await api.getAbi('eosio.token');
    const tx = api.buildTransaction();
    tx.with('eosio.token').as('bob').transfer('bob', 'alice', '0.0001 SYS', 'transactWithShorthandTxJson');
    return await tx.send({
        blocksBehind: 3,
        expireSeconds: 30
    });
};

const transactWithShorthandTxJsonContextFreeAction = async () => {
    await api.getAbi('cfhello');
    const tx = api.buildTransaction();
    tx.associateContextFree(() => ({
        contextFreeAction: tx.with('cfhello').as().contextfree(),
        action: tx.with('cfhello').as('cfactor').normal('test')
    }));
    return await tx.send({
        blocksBehind: 3,
        expireSeconds: 30
    });
};

const transactWithShorthandTxJsonContextFreeData = async () => {
    await api.getAbi('cfhello');
    const tx = api.buildTransaction();
    tx.associateContextFree(() => ({
        contextFreeData: [ '74657374', '7465737464617461' ],
        contextFreeAction: tx.with('cfhello').as().contextfree(),
        action: tx.with('cfhello').as('cfactor').normal('test2')
    }));
    return await tx.send({
        blocksBehind: 3,
        expireSeconds: 30
    });
};

const transactWithReturnValue = async () => {
    await api.getAbi('returnvalue');
    const tx = api.buildTransaction();
    tx.with('returnvalue').as('bob').sum(5, 5);
    return await tx.send({
        blocksBehind: 3,
        expireSeconds: 30
    });
};

const transactWithWebCrypto = async () => {
    // Required to make a new name each test, otherwise the nodeos would need to be restarted
    const generateRandomName = () => {
        const charset = '12345abcdefghijklmnopqrstuvwxyz';
        let result = '';
        for (let i = 0; i < 12; i++) {
            result += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        return result;
    };
    const accountName = generateRandomName();

    const { privateKey: priv, publicKey: pub } = await generateWebCryptoKeyPair();
    await webCryptoSignatureProvider.addCryptoKeyPair({ privateKey: priv, publicKey: pub });
    const publicKey = await PublicKey.fromWebCrypto(pub);
    const publicKeyStr = publicKey.toString();

    // Need to create the account with the new key first
    await api.transact({
        actions: [{
            account: 'eosio',
            name: 'newaccount',
            authorization: [{
                actor: 'bobr1',
                permission: 'active',
            }],
            data: {
                creator: 'bobr1',
                name: accountName,
                owner: {
                    threshold: 1,
                    keys: [{
                        key: publicKeyStr,
                        weight: 1
                    }],
                    accounts: [],
                    waits: []
                },
                active: {
                    threshold: 1,
                    keys: [{
                        key: publicKeyStr,
                        weight: 1
                    }],
                    accounts: [],
                    waits: []
                },
            }
        }]
    }, {
        broadcast: true,
        sign: true,
        useLastIrreversible: true,
        expireSeconds: 30
    });

    return await apiWebCrypto.transact({
        actions: [{
            account: 'returnvalue',
            name: 'sum',
            authorization: [{
                actor: accountName,
                permission: 'active',
            }],
            data: {
                valueA: 5,
                valueB: 10,
            },
        }]
    }, {
        broadcast: true,
        sign: true,
        useLastIrreversible: true,
        expireSeconds: 30
    });
};

const broadcastResult = async (signaturesAndPackedTransaction) => await api.pushSignedTransaction(signaturesAndPackedTransaction);

const transactShouldFail = async () => await api.transact({
    actions: [{
        account: 'eosio.token',
        name: 'transfer',
        authorization: [{
            actor: 'bob',
            permission: 'active',
        }],
        data: {
            from: 'bob',
            to: 'alice',
            quantity: '0.0001 SYS',
            memo: '',
        },
    }]
});

const rpcShouldFail = async () => await rpc.get_block_info(-1);

module.exports = {
    transactWithConfig,
    transactWithoutConfig,
    transactWithContextFreeAction,
    transactWithContextFreeData,
    broadcastResult,
    transactShouldFail,
    transactWithShorthandApiJson,
    transactWithShorthandTxJson,
    transactWithShorthandTxJsonContextFreeAction,
    transactWithShorthandTxJsonContextFreeData,
    transactWithReturnValue,
    transactWithWebCrypto,
    rpcShouldFail
};
