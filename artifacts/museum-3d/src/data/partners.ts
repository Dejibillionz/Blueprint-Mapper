export interface Partner {
  id: number;
  name: string;
  description: string;
  imageUrl: string;
  linkUrl?: string;
}

export const partners: Partner[] = [
  { id:  0, name: "Neverland",  description: "A lending protocol bringing DeFi Magic to Monad! Earn Pixie Dust for supplying and borrowing. 10K Squad holders receive a 20% bonus multiplier boost on earning pearls on the Neverland Leaderboard.", imageUrl: "/partners/neverland.jpg", linkUrl: "https://x.com/Neverland_Money" },
  { id:  1, name: "LUMITERRA",  description: "An open-world MMORPG where an AI companion learns your playstyle, helping you fight, farm, gather, and explore in real-time with other players. Hold 1–3 10K Squad NFTs to unlock skin parts; hold 5 NFTs for the full 10K Squad skin in-game. (Partnership concluded)", imageUrl: "/partners/lumiterra.jpg", linkUrl: "https://lumiterra.net" },
  { id:  2, name: "CULTVERSE AI", description: "An AI-native social platform where users interact with AI companions and unlock on-chain rewards through exploration, conversations, and actions. 10K Squad holders get a dedicated 10K Squad companion, permanent +20% gem boost, priority access, exclusive raffles, and future perks.", imageUrl: "/partners/cultverse.jpg", linkUrl: "https://x.com/cultverse_ai" },
  { id:  3, name: "KINTSU",      description: "Monad's credibly neutral liquid staking protocol, built as a public good to give the community full control over validator curation while maximizing capital efficiency. Any 10K Squad NFT with Kintsu traits receives a 1.25x (25%) points boost when staking with Kintsu or using sMON across Monad DeFi.", imageUrl: "/partners/kintsu.jpg", linkUrl: "https://kintsu.xyz" },
  { id:  4, name: "MAGMA STAKING", description: "Monad's native liquid staking protocol — stake $MON for $gMON and stay liquid while earning yield. Holding the 10K Squad NFT gives you a 1.15x (15%) Magma Points multiplier, the biggest multiplier in the protocol, active from the moment you hold the NFT. (NFT multipliers do not stack)", imageUrl: "/partners/magma.jpg", linkUrl: "https://x.com/magmaStaking" },
  { id:  5, name: "Partner 6",  description: "NFT partner details coming soon.", imageUrl: "" },
  { id:  6, name: "Partner 7",  description: "NFT partner details coming soon.", imageUrl: "" },
  { id:  7, name: "Partner 8",  description: "NFT partner details coming soon.", imageUrl: "" },
  { id:  8, name: "Partner 9",  description: "NFT partner details coming soon.", imageUrl: "" },
  { id:  9, name: "Partner 10", description: "NFT partner details coming soon.", imageUrl: "" },
  { id: 10, name: "Partner 11", description: "NFT partner details coming soon.", imageUrl: "" },
];
