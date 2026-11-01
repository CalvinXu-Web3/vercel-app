export function normalizeWalletIdentity(chain: string, address: string) {
  const normalizedChain = chain.trim().toUpperCase();
  const trimmedAddress = address.trim();
  return {
    chain: normalizedChain,
    address: /^0x[0-9a-fA-F]{40}$/.test(trimmedAddress)
      ? trimmedAddress.toLowerCase()
      : trimmedAddress,
  };
}
