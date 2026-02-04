import { Router } from 'express';
import { db } from '../db/pool';
import { GuildServiceImpl } from '../services/guild/guildService';

const router = Router();
const guildService = new GuildServiceImpl(db);

router.get('/guilds', async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    const guilds = await guildService.listGuilds({ limit, offset });
    res.json(guilds);
  } catch (error) {
    next(error);
  }
});

router.get('/guilds/:id', async (req, res, next) => {
  try {
    const detail = await guildService.getGuildDetail(req.params.id);
    if (!detail) {
      return res.status(404).json({ error: 'GUILD_NOT_FOUND' });
    }
    res.json(detail);
  } catch (error) {
    next(error);
  }
});

export default router;
