import type { Request } from 'express';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { db } from '../db/pool';
import { logger } from '../logging/logger';
import { requireHuman, requireVerifiedAgent } from '../middleware/auth';
import { observerActionRateLimiter } from '../middleware/security';
import { ServiceError } from '../services/common/errors';
import { HeartbeatServiceImpl } from '../services/heartbeat/heartbeatService';
import {
  IMPACT_MAJOR_INCREMENT,
  IMPACT_MINOR_INCREMENT,
} from '../services/metrics/constants';
import { MetricsServiceImpl } from '../services/metrics/metricsService';

const router = Router();
const metricsService = new MetricsServiceImpl(db);
const heartbeatService = new HeartbeatServiceImpl(db);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_PERSONA_KEYS = ['author', 'critic', 'maker', 'judge'] as const;
const ROLE_PERSONA_FIELD_KEYS = [
  'tone',
  'signaturePhrase',
  'focus',
  'boundaries',
] as const;
const ROLE_PERSONA_KEY_SET = new Set<string>(ROLE_PERSONA_KEYS);
const ROLE_PERSONA_FIELD_KEY_SET = new Set<string>(ROLE_PERSONA_FIELD_KEYS);

const isUuid = (value: string) => UUID_PATTERN.test(value);

type PersonaRole = (typeof ROLE_PERSONA_KEYS)[number];

interface RolePersona {
  tone?: string;
  signaturePhrase?: string;
  focus?: string[];
  boundaries?: string[];
}

type RolePersonas = Partial<Record<PersonaRole, RolePersona>>;

const parsePersonaText = (
  value: unknown,
  {
    field,
    maxLength,
  }: {
    field: string;
    maxLength: number;
  },
): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ServiceError(
      'STUDIO_ROLE_PERSONAS_INVALID',
      `${field} must be a string.`,
      400,
    );
  }
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length > maxLength) {
    throw new ServiceError(
      'STUDIO_ROLE_PERSONAS_INVALID',
      `${field} exceeds max length (${maxLength}).`,
      400,
    );
  }
  return normalized;
};

const parsePersonaList = (
  value: unknown,
  {
    field,
    maxItems,
    maxItemLength,
  }: {
    field: string;
    maxItems: number;
    maxItemLength: number;
  },
): string[] | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ServiceError(
      'STUDIO_ROLE_PERSONAS_INVALID',
      `${field} must be an array of strings.`,
      400,
    );
  }
  const deduplicated = [...new Set(value.map((item) => item.trim()))].filter(
    Boolean,
  );
  if (deduplicated.length > maxItems) {
    throw new ServiceError(
      'STUDIO_ROLE_PERSONAS_INVALID',
      `${field} exceeds max items (${maxItems}).`,
      400,
    );
  }
  for (const item of deduplicated) {
    if (item.length > maxItemLength) {
      throw new ServiceError(
        'STUDIO_ROLE_PERSONAS_INVALID',
        `${field} item exceeds max length (${maxItemLength}).`,
        400,
      );
    }
  }
  return deduplicated;
};

const parseRolePersona = (
  role: PersonaRole,
  value: unknown,
): RolePersona | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ServiceError(
      'STUDIO_ROLE_PERSONAS_INVALID',
      `${role} persona must be an object.`,
      400,
    );
  }
  const record = value as Record<string, unknown>;
  const unknownFields = Object.keys(record).filter(
    (field) => !ROLE_PERSONA_FIELD_KEY_SET.has(field),
  );
  if (unknownFields.length > 0) {
    throw new ServiceError(
      'STUDIO_ROLE_PERSONAS_INVALID',
      `Unsupported persona fields: ${unknownFields.join(', ')}.`,
      400,
    );
  }

  const tone = parsePersonaText(record.tone, {
    field: `${role}.tone`,
    maxLength: 160,
  });
  const signaturePhrase = parsePersonaText(record.signaturePhrase, {
    field: `${role}.signaturePhrase`,
    maxLength: 120,
  });
  const focus = parsePersonaList(record.focus, {
    field: `${role}.focus`,
    maxItems: 8,
    maxItemLength: 60,
  });
  const boundaries = parsePersonaList(record.boundaries, {
    field: `${role}.boundaries`,
    maxItems: 8,
    maxItemLength: 80,
  });

  const parsedRole: RolePersona = {};
  if (tone) {
    parsedRole.tone = tone;
  }
  if (signaturePhrase) {
    parsedRole.signaturePhrase = signaturePhrase;
  }
  if (focus && focus.length > 0) {
    parsedRole.focus = focus;
  }
  if (boundaries && boundaries.length > 0) {
    parsedRole.boundaries = boundaries;
  }
  return Object.keys(parsedRole).length > 0 ? parsedRole : undefined;
};

const parseRolePersonas = (
  value: unknown,
  { required }: { required: boolean },
): RolePersonas | null => {
  if (value === undefined) {
    if (required) {
      throw new ServiceError(
        'STUDIO_ROLE_PERSONAS_REQUIRED',
        'rolePersonas is required.',
        400,
      );
    }
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ServiceError(
      'STUDIO_ROLE_PERSONAS_INVALID',
      'rolePersonas must be an object.',
      400,
    );
  }

  const payload = value as Record<string, unknown>;
  const unknownRoles = Object.keys(payload).filter(
    (role) => !ROLE_PERSONA_KEY_SET.has(role),
  );
  if (unknownRoles.length > 0) {
    throw new ServiceError(
      'STUDIO_ROLE_PERSONAS_INVALID',
      `Unsupported persona roles: ${unknownRoles.join(', ')}.`,
      400,
    );
  }

  const personas: RolePersonas = {};
  for (const role of ROLE_PERSONA_KEYS) {
    const parsedRole = parseRolePersona(role, payload[role]);
    if (parsedRole) {
      personas[role] = parsedRole;
    }
  }

  if (required && Object.keys(personas).length === 0) {
    throw new ServiceError(
      'STUDIO_ROLE_PERSONAS_REQUIRED',
      'At least one persona role must be provided.',
      400,
    );
  }

  return personas;
};

const parseOptionalStyleTags = (value: unknown): string[] | null => {
  if (value === undefined) {
    return null;
  }
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== 'string')) {
    throw new ServiceError(
      'STUDIO_STYLE_TAGS_INVALID',
      'styleTags must be an array of strings.',
      400,
    );
  }
  return [...new Set(value.map((tag) => tag.trim()).filter(Boolean))];
};

const parseOptionalSkillProfile = (
  value: unknown,
): Record<string, unknown> | null => {
  if (value === undefined) {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ServiceError(
      'STUDIO_SKILL_PROFILE_INVALID',
      'skillProfile must be a JSON object.',
      400,
    );
  }
  const profile = { ...(value as Record<string, unknown>) };
  if ('rolePersonas' in profile) {
    const parsedRolePersonas = parseRolePersonas(profile.rolePersonas, {
      required: false,
    });
    if (parsedRolePersonas && Object.keys(parsedRolePersonas).length > 0) {
      profile.rolePersonas = parsedRolePersonas;
    } else {
      profile.rolePersonas = undefined;
    }
  }
  return profile;
};

const parseOptionalObserverId = (req: Request): string | undefined => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return undefined;
  }
  const token = authHeader.replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub?: string };
    return typeof payload.sub === 'string' ? payload.sub : undefined;
  } catch (_error) {
    return undefined;
  }
};

const writeStudioTelemetry = async (params: {
  eventType:
    | 'studio_follow'
    | 'studio_unfollow'
    | 'studio_personas_update'
    | 'studio_follow_duplicate';
  userType: 'agent' | 'observer';
  userId: string;
  studioId: string;
  status: string;
  metadata?: Record<string, unknown>;
}) => {
  try {
    await db.query(
      `INSERT INTO ux_events
       (event_type, user_type, user_id, source, status, metadata)
       VALUES ($1, $2, $3, 'api', $4, $5)`,
      [
        params.eventType,
        params.userType,
        params.userId,
        params.status,
        {
          studioId: params.studioId,
          ...params.metadata,
        },
      ],
    );
  } catch (error) {
    logger.warn(
      {
        err: error,
        eventType: params.eventType,
        userType: params.userType,
        userId: params.userId,
        studioId: params.studioId,
      },
      'studio telemetry insert failed',
    );
  }
};

interface StudioLedgerRow {
  kind: 'pr_merged' | 'fix_request';
  id: string;
  draft_id: string;
  description: string;
  severity: 'major' | 'minor' | null;
  occurred_at: string;
  draft_title: string;
}

router.get('/studios/:id', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) {
      throw new ServiceError('STUDIO_ID_INVALID', 'Invalid studio id.', 400);
    }
    const observerId = parseOptionalObserverId(req);
    const result = await db.query(
      `SELECT
         a.id,
         a.studio_name,
         a.personality,
         a.impact,
         a.signal,
         a.avatar_url,
         a.style_tags,
         a.skill_profile,
         COALESCE(fs.follower_count, 0) AS follower_count,
         CASE
           WHEN $2::uuid IS NULL THEN false
           ELSE EXISTS (
             SELECT 1
             FROM observer_studio_follows osf
             WHERE osf.observer_id = $2::uuid
               AND osf.studio_id = a.id
           )
         END AS is_following
       FROM agents a
       LEFT JOIN (
         SELECT studio_id, COUNT(*)::int AS follower_count
         FROM observer_studio_follows
         GROUP BY studio_id
       ) fs ON fs.studio_id = a.id
       WHERE a.id = $1`,
      [req.params.id, observerId ?? null],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'STUDIO_NOT_FOUND' });
    }
    const heartbeat = await heartbeatService.getHeartbeat(req.params.id);
    res.json({ ...result.rows[0], heartbeat });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/studios/:id/follow',
  requireHuman,
  observerActionRateLimiter,
  async (req, res, next) => {
    try {
      const studioId = req.params.id;
      if (!isUuid(studioId)) {
        throw new ServiceError('STUDIO_ID_INVALID', 'Invalid studio id.', 400);
      }

      const observerId = req.auth?.id as string;
      const studioExists = await db.query(
        'SELECT 1 FROM agents WHERE id = $1',
        [studioId],
      );
      if (studioExists.rows.length === 0) {
        return res.status(404).json({ error: 'STUDIO_NOT_FOUND' });
      }

      const insertResult = await db.query(
        `INSERT INTO observer_studio_follows (observer_id, studio_id)
         VALUES ($1, $2)
         ON CONFLICT (observer_id, studio_id) DO NOTHING
         RETURNING created_at`,
        [observerId, studioId],
      );

      const existingResult =
        insertResult.rows.length > 0
          ? insertResult
          : await db.query(
              `SELECT created_at
               FROM observer_studio_follows
               WHERE observer_id = $1 AND studio_id = $2`,
              [observerId, studioId],
            );

      const followerCountResult = await db.query(
        `SELECT COUNT(*)::int AS follower_count
         FROM observer_studio_follows
         WHERE studio_id = $1`,
        [studioId],
      );

      await writeStudioTelemetry({
        eventType:
          insertResult.rows.length > 0
            ? 'studio_follow'
            : 'studio_follow_duplicate',
        userType: 'observer',
        userId: observerId,
        studioId,
        status: insertResult.rows.length > 0 ? 'created' : 'already_following',
        metadata: {
          followerCount: Number(
            followerCountResult.rows[0]?.follower_count ?? 0,
          ),
        },
      });

      return res.status(201).json({
        studioId,
        observerId,
        isFollowing: true,
        followerCount: Number(followerCountResult.rows[0]?.follower_count ?? 0),
        followedAt: existingResult.rows[0]?.created_at ?? null,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/studios/:id/follow',
  requireHuman,
  observerActionRateLimiter,
  async (req, res, next) => {
    try {
      const studioId = req.params.id;
      if (!isUuid(studioId)) {
        throw new ServiceError('STUDIO_ID_INVALID', 'Invalid studio id.', 400);
      }
      const observerId = req.auth?.id as string;

      const deleteResult = await db.query(
        `DELETE FROM observer_studio_follows
         WHERE observer_id = $1 AND studio_id = $2`,
        [observerId, studioId],
      );

      const followerCountResult = await db.query(
        `SELECT COUNT(*)::int AS follower_count
         FROM observer_studio_follows
         WHERE studio_id = $1`,
        [studioId],
      );

      const removed = (deleteResult.rowCount ?? 0) > 0;
      await writeStudioTelemetry({
        eventType: 'studio_unfollow',
        userType: 'observer',
        userId: observerId,
        studioId,
        status: removed ? 'removed' : 'already_unfollowed',
        metadata: {
          followerCount: Number(
            followerCountResult.rows[0]?.follower_count ?? 0,
          ),
        },
      });

      return res.json({
        studioId,
        observerId,
        removed,
        isFollowing: false,
        followerCount: Number(followerCountResult.rows[0]?.follower_count ?? 0),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.put('/studios/:id', requireVerifiedAgent, async (req, res, next) => {
  try {
    if (req.auth?.id !== req.params.id) {
      return res.status(403).json({ error: 'NOT_OWNER' });
    }
    const {
      studioName,
      personality,
      webhookUrl,
      notificationPrefs,
      avatarUrl,
      styleTags,
      skillProfile,
    } = req.body;
    const parsedStyleTags = parseOptionalStyleTags(styleTags);
    const parsedSkillProfile = parseOptionalSkillProfile(skillProfile);
    const result = await db.query(
      `UPDATE agents
       SET studio_name = COALESCE($1, studio_name),
           personality = COALESCE($2, personality),
           webhook_url = COALESCE($3, webhook_url),
           notification_prefs = COALESCE($4, notification_prefs),
           avatar_url = COALESCE($5, avatar_url),
           style_tags = COALESCE($6::jsonb, style_tags),
           skill_profile = COALESCE($7::jsonb, skill_profile)
       WHERE id = $8
       RETURNING id, studio_name, personality, webhook_url, notification_prefs, avatar_url, style_tags, skill_profile`,
      [
        studioName,
        personality,
        webhookUrl,
        notificationPrefs ?? null,
        avatarUrl ?? null,
        parsedStyleTags ? JSON.stringify(parsedStyleTags) : null,
        parsedSkillProfile ? JSON.stringify(parsedSkillProfile) : null,
        req.params.id,
      ],
    );

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.get('/studios/:id/personas', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) {
      throw new ServiceError('STUDIO_ID_INVALID', 'Invalid studio id.', 400);
    }
    const result = await db.query(
      `SELECT id, skill_profile->'rolePersonas' AS role_personas
       FROM agents
       WHERE id = $1`,
      [req.params.id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'STUDIO_NOT_FOUND' });
    }

    return res.json({
      id: result.rows[0].id,
      rolePersonas: result.rows[0].role_personas ?? {},
    });
  } catch (error) {
    next(error);
  }
});

router.put(
  '/studios/:id/personas',
  requireVerifiedAgent,
  observerActionRateLimiter,
  async (req, res, next) => {
    try {
      if (!isUuid(req.params.id)) {
        throw new ServiceError('STUDIO_ID_INVALID', 'Invalid studio id.', 400);
      }
      if (req.auth?.id !== req.params.id) {
        return res.status(403).json({ error: 'NOT_OWNER' });
      }

      const parsedRolePersonas = parseRolePersonas(req.body?.rolePersonas, {
        required: true,
      });
      const result = await db.query(
        `UPDATE agents
         SET skill_profile = COALESCE(skill_profile, '{}'::jsonb) || jsonb_build_object('rolePersonas', $1::jsonb)
         WHERE id = $2
         RETURNING id, skill_profile->'rolePersonas' AS role_personas`,
        [JSON.stringify(parsedRolePersonas), req.params.id],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'STUDIO_NOT_FOUND' });
      }

      const rolePersonas = (result.rows[0].role_personas ?? {}) as Record<
        string,
        unknown
      >;
      await writeStudioTelemetry({
        eventType: 'studio_personas_update',
        userType: 'agent',
        userId: req.auth?.id as string,
        studioId: req.params.id,
        status: 'updated',
        metadata: {
          roleCount: Object.keys(rolePersonas).length,
        },
      });

      return res.json({
        id: result.rows[0].id,
        rolePersonas,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get('/studios/:id/metrics', async (req, res, next) => {
  try {
    const metrics = await metricsService.getAgentMetrics(req.params.id);
    res.json(metrics);
  } catch (error) {
    next(error);
  }
});

router.get('/studios/:id/ledger', async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 8;
    const safeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(limit, 50))
      : 8;

    const result = await db.query(
      `SELECT *
       FROM (
         SELECT
           'pr_merged' AS kind,
           pr.id,
           pr.draft_id,
           pr.description,
           pr.severity,
           pr.decided_at AS occurred_at,
           COALESCE(d.metadata->>'title', 'Untitled') AS draft_title
         FROM pull_requests pr
         JOIN drafts d ON d.id = pr.draft_id
         WHERE pr.maker_id = $1 AND pr.status = 'merged'
         UNION ALL
         SELECT
           'fix_request' AS kind,
           fr.id,
           fr.draft_id,
           fr.description,
           NULL AS severity,
           fr.created_at AS occurred_at,
           COALESCE(d.metadata->>'title', 'Untitled') AS draft_title
         FROM fix_requests fr
         JOIN drafts d ON d.id = fr.draft_id
         WHERE fr.critic_id = $1
       ) ledger
       ORDER BY occurred_at DESC
       LIMIT $2`,
      [req.params.id, safeLimit],
    );

    const entries = result.rows.map((row) => {
      const ledgerRow = row as StudioLedgerRow;
      const severity = ledgerRow.severity;
      let impactDelta = 0;
      if (ledgerRow.kind === 'pr_merged') {
        impactDelta =
          severity === 'major'
            ? IMPACT_MAJOR_INCREMENT
            : IMPACT_MINOR_INCREMENT;
      }

      return {
        kind: ledgerRow.kind,
        id: ledgerRow.id,
        draftId: ledgerRow.draft_id,
        draftTitle: ledgerRow.draft_title,
        description: ledgerRow.description,
        severity,
        occurredAt: ledgerRow.occurred_at,
        impactDelta,
      };
    });

    res.json(entries);
  } catch (error) {
    next(error);
  }
});

export default router;
