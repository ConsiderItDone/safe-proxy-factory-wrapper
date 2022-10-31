import {
  Args_encodeAddOwnerWithThresholdData,
  Args_encodeChangeThresholdData,
  Args_encodeDisableModuleData,
  Args_encodeEnableModuleData,
  Args_encodeRemoveOwnerData,
  Args_encodeSwapOwnerData,
  Args_getModules,
  Args_getOwners,
  Args_getThreshold,
  Args_isModuleEnabled,
  Args_isOwner,
  Args_createTransaction,
  Args_addSignature,
  Env,
  Ethereum_Module,
  SafeContracts_Module,
  // Logger_Module,
  SafeTransaction,
} from "./wrap";
import { Box } from "@polywrap/wasm-as";
import { Args_getTransactionHash } from "./wrap/Module";
import { adjustVInSignature, arrayify, getTransactionHashArgs } from "./utils";
import {
  Args_adjustSignature,
  Args_getBytesArray,
  Args_getHashedMessage,
  Args_getHashSignature,
} from "./wrap/Module/serialization";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const SENTINEL_ADDRESS = "0x0000000000000000000000000000000000000001";

function sameString(str1: string, str2: string): bool {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  return s1 == s2;
}

function findIndex(item: string, items: string[]): i32 {
  for (let i = 0, ln = items.length; i < ln; i++) {
    if (sameString(item, items[i])) {
      return i;
    }
  }
  return -1;
}

export function isZeroAddress(address: string): bool {
  return sameString(address, ZERO_ADDRESS);
}

function isSentinelAddress(address: string): bool {
  return sameString(address, SENTINEL_ADDRESS);
}

export function isRestrictedAddress(address: string): bool {
  return isZeroAddress(address) || isSentinelAddress(address);
}

function validateOwnerAddress(ownerAddress: string): void {
  const isValidAddress = Ethereum_Module.checkAddress({
    address: ownerAddress,
  });
  if (!isValidAddress || isRestrictedAddress(ownerAddress)) {
    throw new Error("Invalid owner address provided");
  }
}

function validateAddressIsNotOwner(
  ownerAddress: string,
  owners: string[]
): void {
  const ownerIndex = findIndex(ownerAddress, owners);
  if (ownerIndex >= 0) {
    throw new Error("Address provided is already an owner");
  }
}

function validateAddressIsOwnerAndGetPrev(
  ownerAddress: string,
  owners: string[]
): string {
  const ownerIndex = findIndex(ownerAddress, owners);
  if (ownerIndex < 0) {
    throw new Error("Address provided is not an owner");
  }
  if (ownerIndex == 0) {
    return SENTINEL_ADDRESS;
  }
  return owners[ownerIndex - 1];
}

function validateThreshold(threshold: number, numOwners: number): void {
  if (threshold <= 0) {
    throw new Error("Threshold needs to be greater than 0");
  }
  if (threshold > numOwners) {
    throw new Error("Threshold cannot exceed owner count");
  }
}

function validateModuleAddress(moduleAddress: string): void {
  const isValidAddress = Ethereum_Module.checkAddress({
    address: moduleAddress,
  });
  if (!isValidAddress.unwrap() || isRestrictedAddress(moduleAddress)) {
    throw new Error("Invalid module address provided");
  }
}

function validateModuleIsNotEnabled(
  moduleAddress: string,
  modules: string[]
): void {
  const moduleIndex = findIndex(moduleAddress, modules);
  if (moduleIndex >= 0) {
    throw new Error("Module provided is already enabled");
  }
}

function validateModuleIsEnabledAndGetPrev(
  moduleAddress: string,
  modules: string[]
): string {
  const moduleIndex = findIndex(moduleAddress, modules);
  if (moduleIndex < 0) {
    throw new Error("Module provided is not enabled yet");
  }
  if (moduleIndex == 0) {
    return SENTINEL_ADDRESS;
  }
  return modules[moduleIndex - 1];
}

export function getOwners(args: Args_getOwners, env: Env): string[] {
  const result = SafeContracts_Module.getOwners({
    address: env.safeAddress,
    connection: {
      node: env.connection.node,
      networkNameOrChainId: env.connection.networkNameOrChainId,
    },
  });
  return result.unwrap();
}

export function getThreshold(args: Args_getThreshold, env: Env): u32 {
  const result = SafeContracts_Module.getThreshold({
    address: env.safeAddress,
    connection: {
      node: env.connection.node,
      networkNameOrChainId: env.connection.networkNameOrChainId,
    },
  });
  return result.unwrap();
}

export function isOwner(args: Args_isOwner, env: Env): bool {
  const result = SafeContracts_Module.isOwner({
    address: env.safeAddress,
    ownerAddress: args.ownerAddress,
    connection: {
      node: env.connection.node,
      networkNameOrChainId: env.connection.networkNameOrChainId,
    },
  });
  return result.unwrap();
}

export function encodeAddOwnerWithThresholdData(
  args: Args_encodeAddOwnerWithThresholdData,
  env: Env
): string {
  validateOwnerAddress(args.ownerAddress);
  const owners = getOwners({}, env);
  validateAddressIsNotOwner(args.ownerAddress, owners);
  let threshold: u32 = 0;
  if (args.threshold !== null) {
    threshold = args.threshold!.unwrap();
  } else {
    threshold = getThreshold({}, env);
  }
  validateThreshold(threshold, owners.length + 1);
  const result = Ethereum_Module.encodeFunction({
    method:
      "function addOwnerWithThreshold(address owner, uint256 _threshold) public",
    args: [args.ownerAddress, threshold.toString(16)],
  });
  return result.unwrap();
}

export function encodeRemoveOwnerData(
  args: Args_encodeRemoveOwnerData,
  env: Env
): string {
  validateOwnerAddress(args.ownerAddress);
  const owners = getOwners({}, env);
  const prevOwnerAddress = validateAddressIsOwnerAndGetPrev(
    args.ownerAddress,
    owners
  );
  let threshold: u32 = 0;
  if (args.threshold !== null) {
    threshold = args.threshold!.unwrap();
  } else {
    threshold = getThreshold({}, env);
  }
  validateThreshold(threshold, owners.length - 1);
  const result = Ethereum_Module.encodeFunction({
    method:
      "function removeOwner(address prevOwner, address owner, uint256 _threshold) public",
    args: [prevOwnerAddress, args.ownerAddress, threshold.toString(16)],
  });
  return result.unwrap();
}

export function encodeSwapOwnerData(
  args: Args_encodeSwapOwnerData,
  env: Env
): string {
  validateOwnerAddress(args.oldOwnerAddress);
  validateOwnerAddress(args.newOwnerAddress);
  const owners = getOwners({}, env);
  validateAddressIsNotOwner(args.newOwnerAddress, owners);
  const prevOwnerAddress = validateAddressIsOwnerAndGetPrev(
    args.oldOwnerAddress,
    owners
  );
  const result = Ethereum_Module.encodeFunction({
    method:
      "function swapOwner(address prevOwner, address oldOwner, address newOwner) public",
    args: [prevOwnerAddress, args.oldOwnerAddress, args.newOwnerAddress],
  });
  return result.unwrap();
}

export function encodeChangeThresholdData(
  args: Args_encodeChangeThresholdData,
  env: Env
): string {
  validateThreshold(args.threshold, getOwners({}, env).length);
  const result = Ethereum_Module.encodeFunction({
    method: "function changeThreshold(uint256 _threshold) public",
    args: [args.threshold.toString(16)],
  });
  return result.unwrap();
}

export function getModules(args: Args_getModules, env: Env): string[] {
  const result = SafeContracts_Module.getModules({
    address: env.safeAddress,
    connection: {
      node: env.connection.node,
      networkNameOrChainId: env.connection.networkNameOrChainId,
    },
  });
  return result.unwrap();
}

export function isModuleEnabled(args: Args_isModuleEnabled, env: Env): bool {
  const result = SafeContracts_Module.isModuleEnabled({
    address: env.safeAddress,
    moduleAddress: args.moduleAddress,
    connection: {
      node: env.connection.node,
      networkNameOrChainId: env.connection.networkNameOrChainId,
    },
  });
  return result.unwrap();
}

export function encodeEnableModuleData(
  args: Args_encodeEnableModuleData,
  env: Env
): string {
  validateModuleAddress(args.moduleAddress);
  validateModuleIsNotEnabled(args.moduleAddress, getModules({}, env));
  const result = Ethereum_Module.encodeFunction({
    method: "function enableModule(address module) public",
    args: [args.moduleAddress],
  });
  return result.unwrap();
}

export function encodeDisableModuleData(
  args: Args_encodeDisableModuleData,
  env: Env
): string {
  validateModuleAddress(args.moduleAddress);
  const prevModuleAddress = validateModuleIsEnabledAndGetPrev(
    args.moduleAddress,
    getModules({}, env)
  );
  const result = Ethereum_Module.encodeFunction({
    method: "function disableModule(address prevModule, address module) public",
    args: [prevModuleAddress, args.moduleAddress],
  });
  return result.unwrap();
}

export function createTransaction(
  args: Args_createTransaction
): SafeTransaction {
  // TODO: if args.tx.data is parsed as an array, create multisend tx

  // let value: Box<u32> = args.tx.value != null ? args.tx.value : <u32>0;

  // 0 is Call, 1 is DelegateCall
  // let operation = args.tx.operation != null ? args.tx.operation : <u8>0;

  if (args.tx.value == null) {
    args.tx.value = "0";
  }
  if (args.tx.operation == null) {
    args.tx.operation = Box.from(<u8>0);
  }
  // tx.signatures = args.tx.signatures;
  // TODO add txOverrides
  // baseGas: args.tx.baseGas ?? 0,
  // gasPrice: args.tx.gasPrice ?? 0,
  // gasToken: args.tx.gasToken || ZERO_ADDRESS,
  // refundReceiver: args.tx.refundReceiver || ZERO_ADDRESS,
  // nonce: args.tx.nonce ?? (await safeContract.getNonce())

  return args.tx;
}

export function getTransactionHash(
  args: Args_getTransactionHash,
  env: Env
): string {
  if (!args.tx.nonce) {
    args.tx.nonce = Ethereum_Module.getSignerTransactionCount({
      connection: env.connection,
      blockTag: null,
    }).unwrap();
  }

  const contractArgs = getTransactionHashArgs(args.tx, args.tx.nonce!);

  const res = Ethereum_Module.callContractView({
    address: env.safeAddress,
    method:
      "function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) public view returns (bytes32)",
    args: contractArgs,
    connection: env.connection,
  }).unwrap();

  return res;
}

export function addSignature(
  args: Args_addSignature,
  env: Env
): SafeTransaction {
  const address = Ethereum_Module.getSignerAddress({
    connection: {
      node: env.connection.node,
      networkNameOrChainId: env.connection.networkNameOrChainId,
    },
  }).unwrap();

  const transactionHash = getTransactionHash({ tx: args.tx }, env);

  //TODO should sign array, not string
  // https://github.com/safe-global/safe-core-sdk/blob/cc2515c5a77bf611c8f1877f98fdb1510164f177/packages/safe-ethers-lib/src/EthersAdapter.ts#L169
  // https://github.com/ethers-io/ethers.js/blob/01aea705ce60b1c42d2f465b162cb339a0e94392/packages/wallet/src.ts/index.ts#L129
  // https://github.com/ethers-io/ethers.js/blob/01aea705ce60b1c42d2f465b162cb339a0e94392/packages/hash/src.ts/message.ts

  const hashedMessage = getHashSignature({ hash: transactionHash }, env);

  const signature = Ethereum_Module.signMessage({
    message: hashedMessage,
    connection: {
      node: env.connection.node,
      networkNameOrChainId: env.connection.networkNameOrChainId,
    },
  }).unwrap();

  let signatures = args.tx.signatures;
  if (signatures == null) {
    signatures = new Map<string, string>();
  }
  if (signatures != null) {
    signatures.set(address, signature);
  }
  args.tx.signatures = signatures;

  return args.tx;
}

export function getHashSignature(
  args: Args_getHashSignature,
  env: Env
): string {
  const transactionHash = args.hash;

  const byteArray = getBytesArray({ hash: transactionHash }, env)!;

  const signature = Ethereum_Module.signMessageBytes({
    bytes: byteArray,
    connection: {
      node: env.connection.node,
      networkNameOrChainId: env.connection.networkNameOrChainId,
    },
  }).unwrap();

  return signature;
}

export function adjustSignature(args: Args_adjustSignature, env: Env): string {
  const address = Ethereum_Module.getSignerAddress({
    connection: {
      node: env.connection.node,
      networkNameOrChainId: env.connection.networkNameOrChainId,
    },
  }).unwrap();

  return adjustVInSignature("eth_sign", args.signature, args.txHash, address);
}

export function getBytesArray(
  args: Args_getBytesArray,
  env: Env
): ArrayBuffer | null {
  return arrayify(args.hash).buffer;
}

export function getHashedMessage(
  args: Args_getHashedMessage,
  env: Env
): string {
  const messagePrefix = "\x19Ethereum Signed Message:\n";

  return Ethereum_Module.solidityKeccak256({
    types: ["string", "string", "bytes"],
    values: [
      messagePrefix,
      args.bytes.byteLength.toString(),
      "[" + Uint8Array.wrap(args.bytes).toString() + "]",
    ],
  }).unwrap();
}
