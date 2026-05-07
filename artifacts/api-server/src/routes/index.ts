import { Router, type IRouter } from "express";
import healthRouter from "./health";
import nftRouter from "./nft";

const router: IRouter = Router();

router.use(healthRouter);
router.use(nftRouter);

export default router;
