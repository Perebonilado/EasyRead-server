/**
 * The critic's loop as the make runs it (WP13; explainer-animation-plan
 * §9.3): once a scene of shots is composed and stored, its stills are
 * taken on the render page, checked by code and tiled into a sheet; the
 * critic (explainer_critic) scores the sheet beside the scene's lines and
 * shots; where a score is under the pass score its fixes are applied to
 * the plan (the board asked again for a shot's words where a fix needs
 * it) and the scene is built again on the voice it was made with, round
 * after round (shots/critic-loop). Every round is written on the scene's
 * row (`frames`, 0067) as it goes.
 *
 * The scene stays `making` throughout, so the maker sees it being put
 * together and nothing exports a version about to be replaced; its row
 * points at each version as it is made (the render page plays the row's
 * film), with the sheet whose plan it was built from, so the two never
 * disagree. A version left behind is deleted; the sheets are kept, as the
 * record of what the critic saw. Nothing here ever fails the make: the
 * loop ends on the last version made and kept, and says why.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FilmShape, SceneDto } from '../../contracts';
import { costOf } from '../../business/domain/cost';
import { kitIdsFor } from '../../business/domain/kit/registry';
import { readMapBase } from '../../business/domain/scene-map';
import type { DocumentProfile } from '../../business/domain/scene-profile';
import type { SceneReading } from '../../business/domain/scene-reading';
import type { SceneScript } from '../../business/domain/scene-script';
import type { ThemeId } from '../../business/domain/scene-themes';
import {
  runCriticLoop,
  type CriticLoopPorts,
  type SceneFrames,
} from '../../business/domain/shots/critic-loop';
import {
  checkFrames,
  type StillImage,
} from '../../business/domain/shots/frame-checks';
import {
  shrink,
  type CriticTile,
} from '../../business/domain/shots/frame-sheet';
import {
  shotParts,
  type BoardShotsInput,
} from '../../business/domain/shots/shot-board';
import { planOf } from '../../business/domain/shots/shot-check';
import type { ShotsInput } from '../../business/domain/shots/shot-compose';
import {
  criticMoments,
  criticParts,
  critiqueOf,
  momentLabel,
  shotNumbers,
} from '../../business/domain/shots/shot-critic';
import {
  applyFixes,
  boardAskPart,
  type BoardAsk,
} from '../../business/domain/shots/shot-fix';
import { sceneNarration } from '../../business/domain/shots/shot-phrases';
import { registryOf } from '../../business/domain/shots/shot-registry';
import type { ExplainerSheet } from '../../business/domain/studio/studio';
import {
  criticBudget,
  criticSwitchOn,
} from '../../business/domain/studio/studio-editor-cut';
import { onItsVoice } from '../../business/domain/studio/studio-stage';
import { sceneFingerprint } from '../../business/handlers/studio/studio-views';
import { partsKeyOf } from '../../business/handlers/studio/studio-twins';
import type {
  LlmGatewayPort,
  LlmTask,
  LlmUsage,
} from '../../business/ports/llm.port';
import type { StoragePort } from '../../business/ports/storage.port';
import type { AiCallLogRepository } from '../../business/repositories/ai-call-log.repository';
import type {
  StudioEpisodeRecord,
  StudioRepository,
  StudioSceneRecord,
  StudioShowRecord,
} from '../../business/repositories/studio.repository';
import type { SceneEyesPort } from '../export/scene-eyes';
import { criticSheet, encodePng, readStill } from '../export/frame-images';
import type { SceneProcessor } from './scene.processor';

/** What the critic is made with. */
export interface SceneCriticDeps {
  studio: StudioRepository;
  llm: Pick<LlmGatewayPort, 'shotsCritic' | 'shotsBoard'>;
  calls: AiCallLogRepository;
  storage: StoragePort;
  scenes: Pick<SceneProcessor, 'recompose'>;
  /** The render page's eyes; none (no browser, no web), the loop does not run. */
  eyes: SceneEyesPort | null;
  setting: (name: string) => string | undefined;
  logger: { log(line: string): void; warn(line: string): void };
}

/** What the make hands the critic: the scene as made, and what it was made from. */
export interface CriticInput {
  show: StudioShowRecord;
  episode: StudioEpisodeRecord;
  /** The scene's row as the make found it: its sheet is the one made. */
  row: StudioSceneRecord;
  make: {
    /** Its script as voiced (shotsScriptOf), its profile, its plan with what it may name, and its finish. */
    script: SceneScript;
    profile: DocumentProfile;
    shots: ShotsInput;
    finish?: (scene: SceneDto) => SceneDto;
    theme?: ThemeId;
    reading?: SceneReading | null;
  };
  made: {
    scene: SceneDto;
    sceneKey: string;
    thumbKey: string;
    audioKey: string;
    durationMs: number;
  };
  shape: FilmShape;
  who: string;
  /** The most rounds (the rules' LOOP.rounds when absent): a CLI's trial may ask fewer. */
  rounds?: number;
}

export interface CriticOutput {
  scene: SceneDto;
  sceneKey: string;
  thumbKey: string;
  /** The sheet as it ends, when the loop changed its plan; null when it did not. */
  sheet: ExplainerSheet | null;
  frames: SceneFrames | null;
}

/** How long the loop may take on one scene, in minutes, unless EXPLAINER_CRITIC_MINUTES says. */
const MINUTES = 10;

export class SceneCritic {
  constructor(private readonly deps: SceneCriticDeps) {}

  /** Whether scenes of shots are looked at: the switch on (the default), and eyes to look with. */
  on(): boolean {
    return (
      criticSwitchOn(this.deps.setting('EXPLAINER_CRITIC')) &&
      this.deps.eyes !== null
    );
  }

  /** The loop on a scene just made (see the module's comment); the scene as it ends. */
  async loop(input: CriticInput): Promise<CriticOutput> {
    const { show, episode, row, make, made, shape, who } = input;
    const { studio, storage, logger } = this.deps;
    const unchanged: CriticOutput = {
      scene: made.scene,
      sceneKey: made.sceneKey,
      thumbKey: made.thumbKey,
      sheet: null,
      frames: null,
    };
    const eyes = this.deps.eyes;
    if (!this.on() || !eyes || row.sheet?.kind !== 'explainer')
      return unchanged;
    const sheet = row.sheet;
    const planned = episode.outline?.scenes[row.position];
    const lines = planned?.rows
      ? (episode.editorial?.rows ?? []).slice(
          planned.rows[0],
          planned.rows[1] + 1,
        )
      : [];
    if (!lines.length) {
      logger.log(`${who}: critic: no lines to judge it by`);
      return unchanged;
    }
    // The episode's budget, less what the critic spent on its other scenes.
    const rows = await studio.listScenes(episode.id);
    const elsewhere = rows
      .filter((one) => one.id !== row.id)
      .reduce((sum, one) => sum + (one.frames?.costUsd ?? 0), 0);
    const budgetUsd = Math.max(
      0,
      criticBudget(this.deps.setting('EXPLAINER_CRITIC_BUDGET')) - elsewhere,
    );
    // What an earlier make's loop kept is no one's now.
    for (const one of row.frames?.rounds ?? [])
      if (one.sheetKey)
        await storage.delete(one.sheetKey).catch(() => undefined);
    // The scene as made, on its row, so the render page plays it; still making.
    await studio.updateScene(row.id, {
      sceneKey: made.sceneKey,
      audioKey: made.audioKey,
      thumbKey: made.thumbKey,
      durationMs: made.durationMs,
      frames: null,
    });

    const world = show.editor?.world ?? null;
    const registry = registryOf(make.shots.registry);
    const look =
      (made.scene.shots?.look as { style?: string } | undefined)?.style ===
      'illustrated'
        ? 'illustrated'
        : 'editorial';
    const options = {
      kit: kitIdsFor(look),
      map: Boolean(readMapBase(world?.base)),
    };
    const narration = sceneNarration(lines);
    const opening = row.position === 0;
    const title = sheet.title || planned?.title || `Scene ${row.position + 1}`;
    const scenes = episode.outline?.scenes.length ?? 1;
    const thumbs = new Map([[made.sceneKey, made.thumbKey]]);
    let current: ExplainerSheet = sheet;
    const boardInput: BoardShotsInput = {
      rows: lines,
      rowClaims: sheet.rowClaims,
      research: show.editor?.research ?? null,
      world,
      shape,
      scene: {
        index: row.position,
        of: scenes,
        title,
        seconds: Math.round(made.durationMs / 1000),
        episode: episode.outline?.title,
      },
      audience: show.brief.audience,
      look,
    };

    const ports: CriticLoopPorts = {
      look: async (version, round) => {
        const dir = await mkdtemp(join(tmpdir(), 'studio-critic-'));
        try {
          const stills = await eyes.stills({
            episodeId: episode.id,
            sceneId: row.id,
            shape,
            moments: criticMoments(version.scene),
            outDir: dir,
          });
          if (!stills.length)
            throw new Error('the render page did not play the scene');
          const pixels: StillImage[] = [];
          const tiles: CriticTile[] = [];
          for (const still of stills) {
            const half = await readStill(still.file);
            pixels.push(half);
            tiles.push({
              png: encodePng(shrink(half, 2)).toString('base64'),
              label: momentLabel(still.moment),
            });
          }
          const checked = checkFrames({
            scene: version.scene,
            reports: stills.map((one) => one.inspect),
            pixels,
            shape,
            sceneId: row.id,
            joins: stills.map((one) => one.join),
            first: opening,
          });
          const png = await criticSheet({
            title: `${row.position + 1}. ${title}`,
            subtitle: `scene ${row.position + 1} of ${scenes} · round ${round} · ${stills.length} stills`,
            tiles,
            shape,
          });
          const sheetKey = `${version.sceneKey.replace(/-scene\.json$/u, '')}-critic-${round}.png`;
          const kept = await storage
            .put({ key: sheetKey, body: png, mimeType: 'image/png' })
            .then(() => sheetKey)
            .catch(() => null);
          return {
            png,
            sheetKey: kept,
            stills: stills.length,
            checks: { scores: checked.scores, problems: checked.problems },
          };
        } finally {
          await rm(dir, { recursive: true, force: true }).catch(
            () => undefined,
          );
        }
      },
      critic: async (version, looked) => {
        const answer = await this.deps.llm.shotsCritic({
          image: looked.png,
          parts: criticParts({
            title,
            index: row.position,
            of: scenes,
            episode: episode.outline?.title ?? episode.title,
            rows: lines,
            scene: version.scene,
            plan: version.plan,
            checks: looked.checks,
            look,
            audience: show.brief.audience,
            stills: looked.stills,
          }),
        });
        return {
          critique: critiqueOf(answer.value, {
            shots: shotNumbers(version.scene),
            opening,
          }),
          costUsd: await this.spend(
            episode.id,
            answer.usage,
            'explainer_critic',
          ),
        };
      },
      fix: async (version, fixes) => {
        let costUsd = 0;
        const board = async (ask: BoardAsk) => {
          const answer = await this.deps.llm.shotsBoard({
            parts: [...shotParts(boardInput, registry), boardAskPart(ask)],
          });
          costUsd += await this.spend(
            episode.id,
            answer.usage,
            'explainer_shots',
          );
          return planOf(answer.value, narration, options);
        };
        const fixed = await applyFixes(version.plan, fixes, {
          rows: lines,
          registry,
          world,
          options,
          board,
        });
        for (const one of fixed.applied)
          logger.log(
            `${who}: critic: s${one.fix.shot} ${one.fix.kind}: ${one.outcome}${one.what ? `, ${one.what}` : ''}`,
          );
        return { ...fixed, costUsd };
      },
      remake: async (plan, from, round) => {
        const voiced = onItsVoice(make.script, from.scene);
        if (!voiced)
          throw new Error(
            'its words are no longer its voice’s: it is built again only on the voice it was made with',
          );
        const next: ExplainerSheet = { ...current, shots: plan };
        const fingerprint = sceneFingerprint(next, show.bible, show.brief);
        const base = `studio/${show.id}/${episode.id}/${row.id}-${fingerprint.slice(0, 8)}-${Date.now().toString(36)}`;
        const again = await this.deps.scenes.recompose({
          script: voiced,
          kept: new Map(),
          beats: from.scene.beats,
          durationMs: from.scene.durationMs,
          timing: from.scene.timing,
          profile: make.profile,
          story: null,
          base,
          who: `${who} (critic, round ${round})`,
          keepAs: `studio-${row.id}`,
          ...(shape !== 'wide' ? { shape } : {}),
          shots: { ...make.shots, plan },
          ...(make.theme ? { theme: make.theme } : {}),
          ...(make.reading ? { reading: make.reading } : {}),
          ...(make.finish ? { finish: make.finish } : {}),
          ...(from.scene.voicePace !== undefined
            ? { voicePace: from.scene.voicePace }
            : {}),
        });
        try {
          await studio.updateScene(row.id, {
            sceneKey: again.sceneKey,
            thumbKey: again.thumbKey,
            sheet: next,
            sheetHash: fingerprint,
          });
        } catch (error) {
          await this.drop(again.sceneKey, again.thumbKey);
          throw error;
        }
        current = next;
        thumbs.set(again.sceneKey, again.thumbKey);
        // The version before is no one's now.
        await this.drop(from.sceneKey, thumbs.get(from.sceneKey) ?? null);
        return { scene: again.scene, plan, sceneKey: again.sceneKey };
      },
      record: (frames) => studio.updateScene(row.id, { frames }),
      log: (line) => logger.log(`${who}: critic: ${line}`),
    };

    const minutes =
      Number(this.deps.setting('EXPLAINER_CRITIC_MINUTES')) || MINUTES;
    const result = await runCriticLoop(
      {
        first: {
          scene: made.scene,
          plan: make.shots.plan,
          sceneKey: made.sceneKey,
        },
        opening,
        budgetUsd,
        deadline: Date.now() + minutes * 60_000,
        ...(input.rounds ? { rounds: input.rounds } : {}),
      },
      ports,
    );
    logger.log(
      `${who}: critic: ${result.frames.ended} after ${result.frames.rounds.filter((r) => r.critic).length} rounds, $${result.frames.costUsd.toFixed(3)}${result.frames.error ? ` (${result.frames.error})` : ''}`,
    );
    const { version } = result;
    return {
      scene: version.scene,
      sceneKey: version.sceneKey,
      thumbKey: thumbs.get(version.sceneKey) ?? made.thumbKey,
      sheet: result.changed ? current : null,
      frames: result.frames,
    };
  }

  /** A call recorded in the ledger, and what it cost. */
  private async spend(
    episodeId: string,
    usage: LlmUsage,
    task: LlmTask,
  ): Promise<number> {
    await this.deps.calls
      .record({
        documentId: episodeId,
        task,
        model: usage.model,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        tokensCached: usage.tokensCached ?? null,
        latencyMs: usage.latencyMs,
        outcome: 'ok',
      })
      .catch(() => undefined);
    return (
      costOf({
        task,
        model: usage.model,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        tokensCached: usage.tokensCached ?? null,
      }) ?? 0
    );
  }

  /** A version's film, still and parts deleted. */
  private async drop(sceneKey: string, thumbKey: string | null): Promise<void> {
    for (const key of [sceneKey, thumbKey, partsKeyOf(sceneKey)])
      if (key) await this.deps.storage.delete(key).catch(() => undefined);
  }
}
