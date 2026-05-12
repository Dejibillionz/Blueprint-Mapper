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
  { id:  3, name: "Partner 4",  description: "NFT partner details coming soon.", imageUrl: "" },
  { id:  4, name: "Partner 5",  description: "NFT partner details coming soon.", imageUrl: "" },
  { id:  5, name: "Partner 6",  description: "NFT partner details coming soon.", imageUrl: "" },
  { id:  6, name: "Partner 7",  description: "NFT partner details coming soon.", imageUrl: "" },
  { id:  7, name: "Partner 8",  description: "NFT partner details coming soon.", imageUrl: "" },
  { id:  8, name: "Partner 9",  description: "NFT partner details coming soon.", imageUrl: "" },
  { id:  9, name: "Partner 10", description: "NFT partner details coming soon.", imageUrl: "" },
  { id: 10, name: "Partner 11", description: "NFT partner details coming soon.", imageUrl: "" },
];
