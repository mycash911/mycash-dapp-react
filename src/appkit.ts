// src/appkit.ts
import { createAppKit } from '@reown/appkit';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { bsc } from '@reown/appkit/networks';

// 1. Your Reown project ID
const projectId = 'f89aac819fc8f8516ef9010d98d2fe7b';

// 2. Networks (BSC only)
export const networks = [bsc];

// 3. Adapter
const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks,
});

// 4. Metadata
const metadata = {
  name: 'MYCASH DApp',
  description: 'MYCASH rewards dApp on BSC',
  url: 'https://github.com/mycash911/mycash-dapp-react',
  icons: ['https://mycash911.github.io/mycash/icon.png'],
};

// 5. Create AppKit (Wallets ONLY)
export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks,
  defaultNetwork: bsc,
  metadata,
  hideBranding: true,



  // Put Trust + MetaMask at top
  featuredWalletIds: [
    // Trust Wallet
    '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0',
    // MetaMask
    'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96',
  ],

  // Disable Social Logins
  features: {
    socials: [],
    email: false,
    analytics: false,
  },
});

// 🔹 Make it accessible to plain JS (your old functions)
if (typeof window !== 'undefined') {
  // @ts-expect-error
  window.appKit = appKit;
}
