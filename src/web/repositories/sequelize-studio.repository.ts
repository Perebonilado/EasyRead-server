import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, UniqueConstraintError } from 'sequelize';
import {
  bibleOf,
  briefOf,
  outlineOf,
  sheetOf,
  STUDIO_FORMATS,
  type StudioFormat,
} from '../../business/domain/studio/studio';
import type { SheetProblem } from '../../business/domain/studio/studio-check';
import {
  EPISODE_PHASES,
  type EpisodeBusy,
  type EpisodePhase,
  type StudioActivity,
  type StudioEpisodeRecord,
  type StudioMessageRecord,
  type StudioRepository,
  type StudioSceneRecord,
  type StudioSceneStatus,
  type StudioShowRecord,
} from '../../business/repositories/studio.repository';
import {
  StudioEpisodeModel,
  StudioMessageModel,
  StudioSceneModel,
  StudioShowModel,
} from '../database/models';
import { newId } from '../database/uuid';

/** JSON as kept, read back; null for none, or for what cannot be read. */
function parsed(kept: string | null | undefined): unknown {
  if (!kept) return null;
  try {
    return JSON.parse(kept) as unknown;
  } catch {
    return null;
  }
}

const json = (value: unknown) =>
  value === null || value === undefined ? null : JSON.stringify(value);

/** An activity as kept, read back: null for none, or for one that cannot be read. */
function activityOf(kept: string | null | undefined): StudioActivity | null {
  const value = parsed(kept) as StudioActivity | null;
  return value && typeof value === 'object' && typeof value.at === 'string'
    ? value
    : null;
}

@Injectable()
export class SequelizeStudioRepository implements StudioRepository {
  constructor(
    @InjectModel(StudioShowModel)
    private readonly shows: typeof StudioShowModel,
    @InjectModel(StudioEpisodeModel)
    private readonly episodes: typeof StudioEpisodeModel,
    @InjectModel(StudioSceneModel)
    private readonly scenes: typeof StudioSceneModel,
    @InjectModel(StudioMessageModel)
    private readonly messages: typeof StudioMessageModel,
  ) {}

  private show(row: StudioShowModel): StudioShowRecord {
    const bible = parsed(row.bible);
    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      format: STUDIO_FORMATS.includes(row.format as StudioFormat)
        ? (row.format as StudioFormat)
        : null,
      brief: briefOf(parsed(row.brief)),
      bible: bible ? bibleOf(bible) : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private episode(row: StudioEpisodeModel): StudioEpisodeRecord {
    const outline = parsed(row.outline);
    return {
      id: row.id,
      showId: row.showId,
      userId: row.userId,
      number: row.number,
      title: row.title,
      logline: row.logline,
      phase: EPISODE_PHASES.includes(row.phase as EpisodePhase)
        ? (row.phase as EpisodePhase)
        : 'brief',
      busy: (row.busy as EpisodeBusy | null) ?? null,
      error: row.error,
      outline: outline ? outlineOf(outline) : null,
      shareToken: row.shareToken,
      durationMs: row.durationMs,
      thumbKey: row.thumbKey,
      activity: activityOf(row.activity),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private scene(row: StudioSceneModel): StudioSceneRecord {
    const sheet = parsed(row.sheet);
    const previous = parsed(row.previousSheet);
    const problems = parsed(row.problems);
    return {
      id: row.id,
      episodeId: row.episodeId,
      position: row.position,
      sheet: sheet ? sheetOf(sheet) : null,
      sheetHash: row.sheetHash,
      problems: Array.isArray(problems) ? (problems as SheetProblem[]) : [],
      previousSheet: previous ? sheetOf(previous) : null,
      status: row.status as StudioSceneStatus,
      step: row.step,
      error: row.error,
      sceneKey: row.sceneKey,
      audioKey: row.audioKey,
      thumbKey: row.thumbKey,
      madeHash: row.madeHash,
      durationMs: row.durationMs,
      activity: activityOf(row.activity),
      updatedAt: row.updatedAt,
    };
  }

  private message(row: StudioMessageModel): StudioMessageRecord {
    const meta = parsed(row.meta);
    return {
      id: row.id,
      showId: row.showId,
      episodeId: row.episodeId,
      role: row.role === 'assistant' ? 'assistant' : 'user',
      content: row.content,
      meta: meta && typeof meta === 'object' ? meta : null,
      createdAt: row.createdAt,
    };
  }

  async createShow(input: {
    userId: string;
    title: string;
    brief: StudioShowRecord['brief'];
  }): Promise<StudioShowRecord> {
    const row = await this.shows.create({
      id: newId(),
      userId: input.userId,
      title: input.title.slice(0, 120),
      format: input.brief.format,
      brief: JSON.stringify(input.brief),
      bible: null,
      deletedAt: null,
    } as never);
    return this.show(row);
  }

  async findShow(id: string): Promise<StudioShowRecord | null> {
    const row = await this.shows.findOne({ where: { id, deletedAt: null } });
    return row ? this.show(row) : null;
  }

  async listShows(userId: string): Promise<StudioShowRecord[]> {
    const rows = await this.shows.findAll({
      where: { userId, deletedAt: null },
      order: [['updatedAt', 'DESC']],
      limit: 200,
    });
    return rows.map((row) => this.show(row));
  }

  async updateShow(
    id: string,
    patch: Partial<
      Pick<StudioShowRecord, 'title' | 'format' | 'brief' | 'bible'>
    >,
  ): Promise<void> {
    await this.shows.update(
      {
        ...(patch.title !== undefined
          ? { title: patch.title.slice(0, 120) }
          : {}),
        ...(patch.format !== undefined ? { format: patch.format } : {}),
        ...(patch.brief !== undefined
          ? { brief: JSON.stringify(patch.brief) }
          : {}),
        ...(patch.bible !== undefined ? { bible: json(patch.bible) } : {}),
      },
      { where: { id } },
    );
  }

  async deleteShow(id: string, now: Date): Promise<void> {
    await this.shows.update({ deletedAt: now }, { where: { id } });
  }

  async createEpisode(input: {
    showId: string;
    userId: string;
    number: number;
    title: string;
    phase: EpisodePhase;
  }): Promise<StudioEpisodeRecord> {
    const row = await this.episodes.create({
      id: newId(),
      showId: input.showId,
      userId: input.userId,
      number: input.number,
      title: input.title.slice(0, 120),
      logline: null,
      phase: input.phase,
      busy: null,
      error: null,
      outline: null,
      shareToken: null,
      durationMs: null,
      thumbKey: null,
    } as never);
    return this.episode(row);
  }

  async findEpisode(id: string): Promise<StudioEpisodeRecord | null> {
    const row = await this.episodes.findByPk(id);
    return row ? this.episode(row) : null;
  }

  async findEpisodeByShareToken(
    token: string,
  ): Promise<StudioEpisodeRecord | null> {
    const row = await this.episodes.findOne({ where: { shareToken: token } });
    return row ? this.episode(row) : null;
  }

  async listEpisodes(showId: string): Promise<StudioEpisodeRecord[]> {
    const rows = await this.episodes.findAll({
      where: { showId },
      order: [['number', 'ASC']],
    });
    return rows.map((row) => this.episode(row));
  }

  async updateEpisode(
    id: string,
    patch: Parameters<StudioRepository['updateEpisode']>[1],
  ): Promise<void> {
    const { outline, title, ...rest } = patch;
    await this.episodes.update(
      {
        ...rest,
        ...(title !== undefined ? { title: title.slice(0, 120) } : {}),
        ...(outline !== undefined ? { outline: json(outline) } : {}),
      },
      { where: { id } },
    );
    // The show goes to the top of the maker's list when any of it changes.
    const row = await this.episodes.findByPk(id, { attributes: ['showId'] });
    if (row)
      await this.shows.update(
        { updatedAt: new Date() },
        {
          where: { id: row.showId },
        },
      );
  }

  async claimEpisode(id: string, busy: EpisodeBusy): Promise<boolean> {
    const [changed] = await this.episodes.update(
      { busy, error: null },
      { where: { id, busy: null } },
    );
    return changed > 0;
  }

  async replaceScenes(
    episodeId: string,
    count: number,
  ): Promise<StudioSceneRecord[]> {
    await this.scenes.destroy({ where: { episodeId } });
    const rows = await this.scenes.bulkCreate(
      Array.from({ length: count }, (_, position) => ({
        id: newId(),
        episodeId,
        position,
        sheet: null,
        sheetHash: null,
        problems: null,
        previousSheet: null,
        status: 'writing',
        step: null,
        error: null,
        sceneKey: null,
        audioKey: null,
        thumbKey: null,
        madeHash: null,
        durationMs: null,
      })) as never[],
    );
    return rows.map((row) => this.scene(row));
  }

  async listScenes(episodeId: string): Promise<StudioSceneRecord[]> {
    const rows = await this.scenes.findAll({
      where: { episodeId },
      order: [['position', 'ASC']],
    });
    return rows.map((row) => this.scene(row));
  }

  async listScenesOf(
    episodeIds: readonly string[],
  ): Promise<StudioSceneRecord[]> {
    if (!episodeIds.length) return [];
    const rows = await this.scenes.findAll({
      where: { episodeId: { [Op.in]: [...episodeIds] } },
      order: [
        ['episodeId', 'ASC'],
        ['position', 'ASC'],
      ],
    });
    return rows.map((row) => this.scene(row));
  }

  async findScene(id: string): Promise<StudioSceneRecord | null> {
    const row = await this.scenes.findByPk(id);
    return row ? this.scene(row) : null;
  }

  async updateScene(
    id: string,
    patch: Parameters<StudioRepository['updateScene']>[1],
  ): Promise<void> {
    const { sheet, previousSheet, problems, ...rest } = patch;
    await this.scenes.update(
      {
        ...rest,
        ...(sheet !== undefined ? { sheet: json(sheet) } : {}),
        ...(previousSheet !== undefined
          ? { previousSheet: json(previousSheet) }
          : {}),
        ...(problems !== undefined ? { problems: json(problems) } : {}),
      },
      { where: { id } },
    );
  }

  async noteActivity(
    of: { episodeId: string } | { sceneId: string },
    activity: StudioActivity | null,
  ): Promise<void> {
    const kept = { activity: json(activity) };
    // Said often while a job runs: the row's updatedAt stays as it was.
    if ('sceneId' in of)
      await this.scenes.update(kept, {
        where: { id: of.sceneId },
        silent: true,
      });
    else
      await this.episodes.update(kept, {
        where: { id: of.episodeId },
        silent: true,
      });
  }

  async insertScene(
    episodeId: string,
    position: number,
  ): Promise<StudioSceneRecord> {
    await this.scenes.increment('position', {
      by: 1,
      where: { episodeId, position: { [Op.gte]: position } },
    });
    const row = await this.scenes.create({
      id: newId(),
      episodeId,
      position,
      sheet: null,
      sheetHash: null,
      problems: null,
      previousSheet: null,
      status: 'writing',
      step: null,
      error: null,
      sceneKey: null,
      audioKey: null,
      thumbKey: null,
      madeHash: null,
      durationMs: null,
    } as never);
    return this.scene(row);
  }

  async removeScene(id: string): Promise<void> {
    const row = await this.scenes.findByPk(id);
    if (!row) return;
    await row.destroy();
    await this.scenes.decrement('position', {
      by: 1,
      where: { episodeId: row.episodeId, position: { [Op.gt]: row.position } },
    });
  }

  async makingFor(userId: string): Promise<number> {
    const episodes = await this.episodes.findAll({
      where: { userId },
      attributes: ['id'],
    });
    if (!episodes.length) return 0;
    return this.scenes.count({
      where: {
        episodeId: { [Op.in]: episodes.map((e) => e.id) },
        status: 'making',
      },
    });
  }

  async addMessage(input: {
    id?: string;
    showId: string;
    episodeId: string | null;
    role: 'user' | 'assistant';
    content: string;
    meta?: StudioMessageRecord['meta'];
  }): Promise<StudioMessageRecord> {
    try {
      const row = await this.messages.create({
        id: input.id ?? newId(),
        showId: input.showId,
        episodeId: input.episodeId,
        role: input.role,
        content: input.content.slice(0, 20_000),
        meta: json(input.meta ?? null),
      } as never);
      return this.message(row);
    } catch (error) {
      // Its id taken: added already, by a try before this one.
      if (!(error instanceof UniqueConstraintError) || !input.id) throw error;
      const kept = await this.messages.findByPk(input.id);
      if (!kept) throw error;
      return this.message(kept);
    }
  }

  async listMessages(
    showId: string,
    limit = 60,
    before?: string,
  ): Promise<StudioMessageRecord[]> {
    // Those said in the same second are kept in the order of their ids.
    const from = before ? await this.messages.findByPk(before) : null;
    if (before && from?.showId !== showId) return [];
    const rows = await this.messages.findAll({
      where: from
        ? {
            showId,
            [Op.or]: [
              { createdAt: { [Op.lt]: from.createdAt } },
              { createdAt: from.createdAt, id: { [Op.lt]: from.id } },
            ],
          }
        : { showId },
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit,
    });
    return rows.reverse().map((row) => this.message(row));
  }

  async countUserMessagesSince(userId: string, since: Date): Promise<number> {
    const shows = await this.shows.findAll({
      where: { userId },
      attributes: ['id'],
    });
    if (!shows.length) return 0;
    return this.messages.count({
      where: {
        showId: { [Op.in]: shows.map((s) => s.id) },
        role: 'user',
        createdAt: { [Op.gte]: since },
      },
    });
  }
}
