import { Router, type IRouter } from "express";

const router: IRouter = Router();

const OPENSEA_CONTRACT = "0x818030837e8350ba63e64d7dc01a547fa73c8279";
const OPENSEA_CHAIN    = "monad";

router.get("/nft/:token_id", async (req, res) => {
  const { token_id } = req.params;
  const apiKey = process.env.OPENSEA_API_KEY ?? "";

  if (!apiKey) {
    res.status(503).json({ error: "OpenSea API key not configured" });
    return;
  }

  const url = `https://api.opensea.io/api/v2/chain/${OPENSEA_CHAIN}/contract/${OPENSEA_CONTRACT}/nfts/${encodeURIComponent(token_id)}`;

  try {
    const upstream = await fetch(url, {
      headers: {
        "x-api-key": apiKey,
        "accept":    "application/json",
      },
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      req.log.warn({ status: upstream.status, token_id }, "OpenSea upstream error");
      res.status(upstream.status).json({ error: `OpenSea error ${upstream.status}`, detail: text });
      return;
    }

    const data = await upstream.json() as {
      nft?: {
        traits?: { trait_type: string; value: string | number }[];
        owners?: { address: string; quantity: number }[];
      };
    };

    const nft = data.nft ?? {};
    res.json({
      traits: nft.traits ?? [],
      owner:  nft.owners?.[0]?.address ?? null,
    });
  } catch (err) {
    req.log.error({ err, token_id }, "Failed to fetch OpenSea NFT detail");
    res.status(502).json({ error: "Failed to reach OpenSea" });
  }
});

export default router;
