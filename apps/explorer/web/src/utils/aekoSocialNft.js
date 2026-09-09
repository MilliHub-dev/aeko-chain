import { confirmSignature, getAccountInfo, getLatestBlockhash, sendTransaction } from './aekoRpcClient';
import { signMessage } from './aekoTestKeypair';
import {
  buildPreparedCollectionSetupTransaction,
  buildPreparedMintWithAccountSetupTransaction,
  deriveToken721AddressWithSeed,
  estimateCollectionAccountSpace,
  estimateTokenAccountSpace,
} from './nftTransactionBuilder';
import { fetchMinimumBalanceForRentExemption } from './nftAccountDecoder';
import { fetchNftsForCreator } from './testConsoleApi';

function fromBase64(value) {
  const raw = atob(value);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
function toBase64(bytes) {
  let raw = '';
  bytes.forEach((byte) => { raw += String.fromCharCode(byte); });
  return btoa(raw);
}

function signSingleSignerPreparedTransaction(wallet, preparedBase64) {
  const bytes = fromBase64(preparedBase64);
  if (bytes[0] !== 1) throw new Error('Social NFT flow requires a single-signature prepared transaction.');
  const message = bytes.slice(65);
  const signature = signMessage(wallet, message);
  bytes.set(signature, 1);
  return toBase64(bytes);
}

async function digestHex(value) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(digest).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function confirmPrepared(rpcUrl, wallet, prepared) {
  const signed = signSingleSignerPreparedTransaction(wallet, prepared);
  const signature = await sendTransaction(rpcUrl, signed);
  await confirmSignature(rpcUrl, signature);
  return signature;
}

export async function mintSocialPostAsNft({ rpcUrl, explorerApiUrl, wallet, post, explorerOrigin = window.location.origin }) {
  if (!wallet?.address) throw new Error('Select an owned test wallet before minting.');
  if (post?.creator !== wallet.address) throw new Error('Only the wallet that created this Social post can mint it as an NFT.');

  const postHash = await digestHex(post.postId);
  const collectionSeed = 'aeko-social-posts';
  const tokenSeed = `post-${postHash.slice(0, 24)}`;
  const collectionAddress = await deriveToken721AddressWithSeed(wallet.address, collectionSeed);
  const tokenAddress = await deriveToken721AddressWithSeed(wallet.address, tokenSeed);
  const postUrl = `${explorerOrigin}/faucet?console=1&tab=social&social=post&post=${encodeURIComponent(post.postId)}&persona=${encodeURIComponent(wallet.address)}`;
  const tokenId = BigInt(`0x${postHash.slice(0, 16)}`).toString();
  const collectionMetadata = { name: 'AEKO Social Posts', symbol: 'ASOC', baseUri: `${explorerOrigin}/faucet?console=1&tab=social&social=assets` };
  const metadata = {
    name: `AEKO Social · ${post.postId.slice(0, 8)}`,
    description: `On-chain AEKO Social post by ${wallet.address}`,
    uri: postUrl,
    imageUri: null,
    attributes: [
      { traitType: 'postId', value: post.postId },
      { traitType: 'postKind', value: post.postKind || 'original' },
      { traitType: 'creator', value: wallet.address },
    ],
  };

  let collectionSignature = '';
  if (!(await getAccountInfo(rpcUrl, collectionAddress))) {
    const space = estimateCollectionAccountSpace(collectionMetadata);
    const lamports = await fetchMinimumBalanceForRentExemption(rpcUrl, space);
    const blockhash = await getLatestBlockhash(rpcUrl);
    const prepared = buildPreparedCollectionSetupTransaction({
      payer: wallet.address, recentBlockhash: blockhash, base: wallet.address,
      collectionAddress, collectionSeed, lamports, space, authority: wallet.address,
      name: collectionMetadata.name, symbol: collectionMetadata.symbol, baseUri: collectionMetadata.baseUri,
    });
    collectionSignature = await confirmPrepared(rpcUrl, wallet, prepared);
  }

  if (await getAccountInfo(rpcUrl, tokenAddress)) {
    throw new Error('This post already has its deterministic AEKO-721 token account.');
  }
  const space = estimateTokenAccountSpace({ metadata });
  const lamports = await fetchMinimumBalanceForRentExemption(rpcUrl, space);
  const blockhash = await getLatestBlockhash(rpcUrl);
  const prepared = buildPreparedMintWithAccountSetupTransaction({
    payer: wallet.address, recentBlockhash: blockhash, base: wallet.address,
    tokenAddress, tokenSeed, lamports, space, collection: collectionAddress,
    authority: wallet.address, owner: wallet.address, tokenId, royaltyBps: 0, metadata,
  });
  const signature = await confirmPrepared(rpcUrl, wallet, prepared);

  let indexed = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const nfts = await fetchNftsForCreator(explorerApiUrl, wallet.address, 100).catch(() => []);
    indexed = nfts.find((nft) => nft.tokenId === tokenAddress) || null;
    if (indexed) break;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!indexed) throw new Error('NFT mint confirmed but Explorer did not index the token within 30 seconds.');
  return { collectionAddress, tokenAddress, tokenId, signature, collectionSignature, indexed, postUrl };
}
