# One simplified note, one voice — plan

The decision, 15 Sep 2026: text runs on OpenAI (gpt-4o-mini writing,
gpt-4.1-mini verifying) as it did before the Modal spike; the Easiest
reading level is removed from the product so there is one simplified note;
and every lecture is voiced by Kokoro on Modal, a learner's own upload
included. The Modal text service and the admin's channel switch, both
added on 14 Sep, are retired.

**Amendment, same day, before implementation:** the slow-learner lecture
style (`gentle`) **stays**. Everything below about removing it (§2.1's
second migration, the gentle parts of §2.3, §2.11's fixture renames, §3.4)
was not done; `gentle` now reads the one simplified note like the other
styles, and the two coverage exemptions that existed because it read a
differently numbered note were made unconditional.

**As built:** the server work of PR 1 and PR 3 landed together on the
`next-work` branch, without the compatibility DTO fields (the client and
server deploy together); migrations are `0046-one-simplified-note` and
`0047-drop-platform-settings`. The client work of PR 2 and §4.4 landed on
the client's `next-work` branch.

Measured on today's ledger rates, a 300-page document in three styles
costs about $3.60 and takes the OpenAI run time. This plan supersedes
`open-model-channel-plan.md`, which is deleted.

Line numbers below are as of commit `e9fbe93` (server) and the client's
HEAD on 15 Sep; the inventories were taken file by file, so a line that
has moved is still the same code.

## 0. Decisions fixed here, so nothing is re-decided mid-way

| Question | Decision |
| --- | --- |
| Internal name of the one simplified note | Stays `standard` wherever a DB value or a step name exists (`simplified_pages.level`, `pipeline_runs.step = 'simplify_standard'`, `tts_standard`). No rename migration. The **user-facing** word is "Simplified"; the `Level` type is deleted from both contracts. |
| `reading_positions.level` | Narrowed to `('original', 'standard')`. |
| Lesson intents and the profile pace dial (`LessonIntent = 'gentle'`, `pace = 'slower'`) | **Kept.** They drive the live tutor, not the lecture style; the only bridge between them (`intentToStyle` in the client) is dead code and is deleted. |
| The `part` segment kind (a long page voiced as two pieces) | **Kept.** Splitting never depended on `gentle`; only the prose that called it "a slow learner's page" is reworded. |
| `plainWordsProblems` default style | Was `'gentle'` (the strictest bar). Becomes `'steady'`. Specs are re-pinned to steady's bar. |
| Gentle-only relaxations in the board grounding checks | Deleted: the stricter path applies to every style. |
| Gentle-only rules (`two_terms`, the zero-tolerance empty-word bar) | Deleted, including the `'two_terms'` problem kind. |
| `recapCheck` / `tailChars` in `LectureStyleSpec` | Fields kept (now uniform); only the `gentle` entry is deleted. No logic refactor. |
| Follow-along fixtures named `gentle-*` | Renamed `steady-*`, `style` field set to `steady`. They are the matcher's regression corpus and are not deleted. |
| Old rows | Easiest pages, easiest exports, easiest pipeline runs and gentle segments are deleted by migration. Their mp3s and PDFs in the bucket are left as orphans (regenerable, harmless). |
| Old jobs in Redis | The worker gains a one-release guard that exits quietly on a simplify job carrying `level: 'easiest'` or a lecture job whose style is not a `LectureStyle`. No manual drain. |
| API compatibility | `ValidationPipe` runs with `forbidNonWhitelisted: true`, so an old client sending `easiest`, `level` or `channels` would get a 400. PR 1 keeps those DTO fields as `@IsOptional()` no-ops; PR 3 deletes them after the client is live. |
| Processing channels feature | Removed entirely in PR 3, table dropped by migration. Kokoro's `MODAL_TTS_*` and `MODAL_USD_PER_AUDIO_HOUR` stay: they are now the only voice and the only audio price. |
| Learners' documents voiced on Kokoro | `voicesHere()` becomes "the voice service is configured". `LECTURE_VOICE_EXTERNAL` and `AI_LECTURE_VOICE` are deleted. Existing learner audio keeps its files; only new voicing changes. |

## 1. Release order

1. **PR 1, server**: easiest level out, gentle style out, all lecture voice on Kokoro, migrations 0046 and 0047, DTO compatibility fields. Deploy (migration runs as the API's pre-deploy command).
2. **PR 2, client**: reader, settings, admin, landing copy, types. Deploy.
3. **PR 3, server**: retire the processing channels feature, delete the compatibility DTO fields, migration 0048 drops `platform_settings`, delete the Modal text service, docs. Deploy.
4. **Ops** between 1 and 3: `modal app stop easiread-llm`, delete the two dormant `easiread-tts` apps, unset the removed env vars.

Each PR must pass `npm run lint` and `npm test` (server) or `npm run lint` and `npm run build` (client) before merge.

## 2. PR 1, server

### 2.1 Migrations

**`migrations/0046-one-simplified-note.migration.ts`**, `up`:

1. `DELETE FROM simplified_pages WHERE level = 'easiest'`.
2. `DELETE FROM exports WHERE level = 'easiest'`.
3. `DELETE FROM pipeline_runs WHERE step = 'simplify_easiest'`.
4. `UPDATE reading_positions SET level = 'standard' WHERE level = 'easiest'`.
5. `DELETE FROM usage_counters WHERE metric = 'easiest_conversions'` (historical rows; the metric no longer exists in code).
6. `changeColumn('simplified_pages', 'level', ENUM('standard'))` — kept as a single-value column rather than dropped, so the unique index `(document_id, level, page_number)` from `0001` needs no rebuild. Check the index name in `0001-initial-schema.migration.ts:293` region first and leave it.
7. `changeColumn('exports', 'level', ENUM('standard'))`, same reasoning (the cache key `(document_id, level, content_version)` stays valid).
8. `changeColumn('reading_positions', 'level', ENUM('original', 'standard'))`.
9. `changeColumn('pipeline_runs', 'step', ENUM(...STEPS_WITH_OCR minus 'simplify_easiest'))` — copy the list from `0013-ocr-pages.migration.ts:14-24`.
10. `removeColumn('users', 'default_level')`.

`down`: restore the four enums with their old members and re-add `users.default_level` ENUM('standard','easiest') default 'standard'. Deleted rows are not restored (they are regenerable).

Do not edit `0001`, `0013` or `0022` in place.

**`migrations/0047-two-lecture-styles.migration.ts`**, `up` (all style columns are `STRING(16)`, no enum change):

1. `DELETE FROM lecture_segments WHERE style = 'gentle'`.
2. `UPDATE lecture_positions SET style = 'steady' WHERE style = 'gentle'`.
3. `UPDATE lecture_listens SET style = 'steady' WHERE style = 'gentle'` (history counts toward the default style).
4. `UPDATE document_learning_state SET lecture_style = NULL WHERE lecture_style = 'gentle'`.
5. `UPDATE learner_profiles SET lecture_style = NULL WHERE lecture_style = 'gentle'` (null means "not chosen": the bar asks again).

`down`: no-op with a comment (the rows cannot be restored).

### 2.2 Contracts (`src/contracts/index.ts`)

- L11: delete `export type Level`.
- L38: delete `'simplify_easiest'` from `PipelineStep`.
- L97: delete `MeResponse.defaultLevel`.
- L250, L440: `simplified` becomes a single `{ done; failed; total }`.
- L331-332: delete `PrepareRequest.easiest`.
- L442: delete `DocumentDetail.easiestState`.
- L443: `position.level` typed `'original' | 'standard'`.
- L456: delete `SimplifiedPagesResponse.level`.
- L734: `StudySnapshot.reading.level` typed `'original' | 'standard'`.
- L1386, L1390, L1393, L1394: delete `level` from the `page.simplified`, `page.simplify_failed`, `document.simplified` and `export.ready` events.
- L845-853: `LectureStyle = 'steady' | 'brisk'`; `LECTURE_STYLE_KEYS = ['steady', 'brisk']`; reword "written three ways".
- L855-862: reword the `SegmentKind` comment (no "slow learner"); kinds unchanged.
- L829 `LessonIntent`: **leave**.
- Keep `ProcessingChannel*` and `PrepareEstimateDto.byChannel` for now (PR 3).

### 2.3 Domain

**`src/business/domain/follow.ts`**: delete `FollowTrack.level` (L29), `noteLevelFor` (L49-52), the `level` parameter on `trackFromAlignment`, `trackFromEstimate`, `trackFromMoves` (L535, L594, L630).

**`src/business/domain/cost.ts`**: delete `PER_PAGE.simplifyEasiest` (L96), `hasEasiest` and `easiest` inputs (L162, L168), the branch at L193-195, `LEVELS` (L227). Audio pricing is restated in §2.10.

**`src/business/domain/processing.ts`** L38: delete `'simplify_easiest'` (the file itself goes in PR 3).

**`src/business/domain/ask.ts`**: delete `AskContext.noteLevel` (L29); L213 uses the constant word "simplified"; delete the `gentle` branch of `askDelivery` (L135-137).

**`src/business/domain/entities/user.ts`**: delete `defaultLevel` (L10) and `setDefaultLevel` (L110-112); fix callers the compiler names.

**`src/business/domain/follow-eval.ts`** L48: delete `level`.

**`src/business/domain/lecture.ts`**:
- Delete the `gentle` keys of `WORD_BUDGET` (L60-76, and the comment at L64), `EXTRAS_BY_STYLE` (L141-145), `WORDS_PER_BLOCK` (L184-188), `LIFTED_MAX` (L820-826), `PLAIN_BARS` (L1292-1300).
- Delete the whole `gentle` entry of `LECTURE_STYLES` (L393-458).
- `isLectureStyle` (L511-513): drop the `'gentle'` clause.
- L1338: `options.style ?? 'steady'`.
- L1358: delete the gentle branch of the long-sentence message.
- L1389-1396: keep only the `else` arm (`empty.size + hard.size > bar.hard`).
- L1504-1513: delete the `two_terms` rule; L890: delete `'two_terms'` from the problem-kind union.
- Reword comments at L98-101, L250-254, L375, L408, L1026, L1175, L1315-1321, L1722-1728. `shouldSplit`, `splitSections`, `pageScripts`, `cutPlanIntoJobs`, `chosenLectureStyle`: no change.

**`src/business/domain/delivery.ts`**: delete the `gentle` keys of `DELIVERY` (L94-98) and `STYLE_SPEED` (L531-535); reword L12.

**`src/business/domain/board.ts`**:
- Delete the `gentle` keys of `MAX_WRITTEN` (L268-272), `PEN_MS_PER_ITEM` (L274-278), `LEAD_MS` (L322-326), `PAUSE_MS` (L342-346), `WRITING_COST` (L362-367).
- L2150-2160: `const checked = !planned` becomes `const checked = true`; simplify accordingly.
- L2370: the synthetic pool's `style: 'gentle'` becomes `'steady'`.
- L2494-2496: `held` becomes unconditional (`true`); L2508-2517: delete the twelve-word cap; L2519-2527: the grounding check runs for every style.
- Reword L263-266, L2359-2362, L3160.

**`src/business/domain/everyday-words.ts`** L829, L1022: **do not touch** (vocabulary entries that happen to contain "gentle").

### 2.4 Repositories, models, queries

- `src/business/repositories/simplified-page.repository.ts` (L5, 19, 28, 33, 39, 43, 48, 57, 61, 62) and `src/web/repositories/sequelize-simplified-page.repository.ts` (L4, 58, 75, 82, 90, 100, 111, 142, 158, 180): drop `level` from every signature and `where`. The implementation may keep writing `level: 'standard'` on insert since the column stays.
- `src/business/repositories/misc.repository.ts` L58 `PositionRecord.level: 'original' | 'standard'`; L90, L96 drop `level` from `ExportRecord` and `findCached`; `src/web/repositories/sequelize-misc.repositories.ts` L262, L276 match (`where level = 'standard'` stays as a constant inside).
- `src/web/repositories/mappers.ts:17`, `sequelize-user.repository.ts:68`: delete the `defaultLevel` lines.
- `src/web/repositories/sequelize-learning.repositories.ts` L103-108 `asStyle`: drop `'gentle'`. This is the safety valve: any stray stored value reads back as `null` and falls to `steady`.
- Models: `simplified-page.model.ts` L8, L24-25 (`ENUM('standard')`); `export.model.ts` L2, L12-13 (same); `reading-position.model.ts` L22-27 (`ENUM('original','standard')`); `user.model.ts` L23-28 delete; `pipeline-run.model.ts` L21 drop the member.
- Queries: `document-detail.query.ts` L64-77 flat tally, delete `easiestState` (L120-129), `tallyByLevel` groups by status only (L131-160), drop the import (L4); `materials.query.ts` L117-142 group by document + status, `emptyTally` (L405-409) flat, L7 import; `emptyLecture` (L411-419) automatically two columns; `reader.query.ts` L77-91 drop the `level` parameter (constant `'standard'` in the where); `catalogue.query.ts:177`, `document-list.query.ts:99`, `continue-studying.query.ts:100`: the `level` field stays but is typed `'original' | 'standard'`; `me.query.ts:84` delete.

### 2.5 Handlers

- `documents/reading.handlers.ts`: delete `StartEasiestHandler` and `StartEasiestRequest` (L70-124); drop `level` from `PrioritisePagesRequest` (L38) and `RetryPageRequest` (L132); `SavePositionRequest.level` typed `'original' | 'standard'` (L183).
- `documents/export.handlers.ts`: drop `level` (L25); one "not simplified yet" message (L61-67); filename suffix becomes `Simplified` (L153-154).
- `documents/dwell.handlers.ts` L20: `'original' | 'standard'`.
- `documents/voice.handlers.ts`: `AudioLevel = 'original' | 'standard'` (L104); keep the storage key shape `${level}/${page}-…` (L149); delete the `noteLevel` plumbing (L253, L1206-1233) and read the note with the level-free `find`; L1010, L1118 unchanged.
- `institutions/materials.handlers.ts`: delete `PrepareTodo.hasEasiest` (L280), the two estimate inputs (L330, L334), the easiest fan-out branch (L379-385), the extra progress query (L448-450, L478). L316-318 keeps filtering `cmd.styles` by `LECTURE_STYLE_KEYS`.
- `documents/lecture.handlers.ts`: no logic change; L280-291 emits two summaries.
- `documents/chat.handlers.ts:155`, `domain/values/chat.ts:57`: **leave** ("easiest turn" is English).
- `src/app.module.ts` L52, L266: delete the `StartEasiestHandler` lines.

### 2.6 Pipeline

- `orchestrator.service.ts`: delete `stepFor` (L268-270); `fanOutSimplify(documentId, contentVersion)` (L119-150, drop the level and the `${level}` in the log); `afterSimplifyPage(documentId)` (L157-178) always calls `markReadyIfComplete`; L110 call site; `catalogueScripts` (L233-245) loops the two styles unchanged.
- `processors/simplify.processor.ts`: constant task `'simplify_standard'` (L85); drop `level` throughout (L63-155); `announce` emits no `level` (L140, L149-157). **Transition guard** at the top of `process`: `if ((job as { level?: string }).level === 'easiest') return;` with a comment "a job queued before 0046; delete after the next release".
- `processors/lecture-chapter.processor.ts`: delete the `noteLevelFor` import (L34); `noteFor` (L318-330) becomes one `simplified.find(documentId, pageNumber)`; `askFor` L194 delete; L577-578 drop the `gentle` entry of the inline map; L1509-1523 `exempt` computed unconditionally from `beat.skipBlocks`; L1619-1621 `moveBlocks` passed unconditionally; reword L284-287, L1233-1237, L1508-1513, L1800-1801. **Transition guard** at the top of `process`: `if (!isLectureStyle(job.style ?? 'steady')) return;`. Same guard in `lecture-voice`, `lecture-align`, `lecture-board`, `lecture-follow`, `lecture-diagram` processors.
- `processors/lecture-follow.service.ts` L118-131: return blocks only; drop the `Level` import (L2).
- `processors/lecture-diagram.processor.ts` L96: loops `LECTURE_STYLE_KEYS`, now two.
- `queues.ts`: delete `SimplifyJobData.level` (L84), `ExportJobData.level` (L159); `simplifyJobId(documentId, page, version)` (L166-175) drops the level segment. Style-typed fields narrow automatically.
- `src/business/ports/job-queue.port.ts` L17, L73, L107: drop `level`.
- `src/web/adapters/bullmq-queue.adapter.ts`: delete the `simplify_easiest` entry (L44-45), the `Level` import (L7), the level parameter in `prioritise` (L388, L395).

### 2.7 LLM port, adapters, prompts, registry

- `src/business/ports/llm.port.ts`: delete `'simplify_easiest'` (L15); `simplifyPage` loses `task` (L489); the four inline style unions (L300, L361, L387, L409) become `LectureStyle`; reword L84, L86, L353.
- `src/web/adapters/ai-sdk/models.ts` L54: delete the `simplify_easiest` mapping.
- `src/web/adapters/ai-sdk/ai-sdk-llm.adapter.ts`: `simplifyPage` uses `PROMPTS.simplifyStandard` (L783-786, narrow L767); L250, L418, L470, L536 style types; delete the gentle ternary at L334; L436 becomes `quick` / `normal-paced`; delete L441-443; delete the gentle arms at L479-480, L499-507, L571-572.
- `src/web/adapters/prompts.ts`: delete the Easiest comment and prompt (L187-198, L202-240); reword L881, L971, L1030, L1080-1083, L1129 so no prompt describes a slow learner or the meanings exception.
- `src/web/adapters/fake-llm.adapter.ts`: narrow L583 and delete L610-618; narrow L223, L316, L343, L386; L428 the fake board's meaning trigger becomes `input.style === 'steady'`.

### 2.8 Controllers and DTOs (compatibility release)

- `src/web/validation/document.dto.ts`: delete `LEVELS` (L17); `SimplifiedPagesQueryDto.level` (L74-78), `PrioritiseDto.level` (L92-99) and `ExportDto.level` (L118-121) become `@IsOptional() @IsIn(['standard', 'easiest']) level?: string` **and are ignored by the controller**, with a comment "compatibility until the client stops sending it; deleted in PR 3"; `SavePositionDto.level` `@IsIn(['original', 'standard'])` (L103-112).
- `src/web/controllers/reader.controller.ts`: delete the `POST /documents/:id/easiest` route (L129-136), the import (L31) and injection (L50); L104 stops reading `query.level`.
- `src/web/controllers/exports.controller.ts` L45: stop passing `body.level`.
- `src/web/controllers/voice.controller.ts`: `AUDIO_LEVELS = ['original', 'standard']` (L68); `noteLevel` (L122-124) becomes `@IsOptional()` and ignored (compat); `DwellVisitDto.level` `@IsIn(['original', 'standard'])` (L297-299); L226-227 `intent` **leave**.
- `src/web/controllers/admin-materials.controller.ts`: `PrepareDto.easiest` becomes `@IsOptional() @IsBoolean()` and ignored (compat); `@ArrayMaxSize(2)` on `styles` (L109-112).
- `src/web/controllers/lecture.controller.ts`: no change; `gentle` now 400s by the key list.

### 2.9 Voice: every lecture on Kokoro

- `src/business/ports/tokens.ts` L21-23: rename `CATALOGUE_SPEECH` to `LECTURE_SPEECH`; comment: "the lecture voice, Kokoro on Modal, for every document". `SPEECH` stays for read-aloud, invitations and tutor intros.
- `src/web/providers/ports.providers.ts` L95-102: bind `LECTURE_SPEECH` the same way (`ModalSpeechAdapter` when `MODAL_TTS_URL` is set, else `NoCatalogueSpeech` renamed `NoLectureSpeech`).
- `src/pipeline/processors/lecture-voice.processor.ts`: inject only `LECTURE_SPEECH` (delete L66); delete the `currentChannels` import (L1) and the `rentedVoice` choice (L130-141); `voice = speech.label().voice` (delete `AI_LECTURE_VOICE`); cost recording always `catalogueSpeechCost(...)` and `model: result.model` (L165-196; drop the `openai:` prefixing).
- `src/pipeline/processors/lecture-chapter.processor.ts` L265-281: `voicesHere()` returns `Boolean(this.config.get('MODAL_TTS_URL'))` for every document; delete `LECTURE_VOICE_EXTERNAL`.
- `src/business/handlers/institutions/pronunciation.handlers.ts:209`: rename the token.
- `src/web/adapters/modal-speech.adapter.ts` L9-19: reword the class comment.
- `.env.example`: delete `LECTURE_VOICE_EXTERNAL` (L196-199); reword L201-204 ("every lecture, a learner's own upload included; empty means no lecture is voiced").
- Spec `src/pipeline/processors/lecture.processor.spec.ts` L578-596 (one speech fake) and L2225-2246 (the `LECTURE_VOICE_EXTERNAL` case becomes "no `MODAL_TTS_URL`: scripts written, no voice jobs").

### 2.10 Cost and estimate (`src/business/domain/cost.ts`)

- Replace `PER_PAGE.audio = 0.02` with `AUDIO_MINUTES_PER_PAGE = 1.33` (the figure the old $0.02 at $0.015/min encoded).
- `estimatePrepare` takes `usdPerAudioHour` (from `MODAL_USD_PER_AUDIO_HOUR`) and prices audio as `pages × styles × AUDIO_MINUTES_PER_PAGE / 60 × usdPerAudioHour`. Text stays `PER_PAGE.lectureText` per page per style plus the pipeline steps.
- `costOf`: `-tts` models keep the per-character price (read-aloud on OpenAI); the `modal:` text branch is deleted in PR 3.
- `materials.handlers.ts` L336-343 passes the rate; `channels`/`rates` go in PR 3.
- `cost.spec.ts`: L64-95 drop the `0.0007` term and the easiest inputs; audio cases assert the Kokoro arithmetic.

### 2.11 Specs and fixtures

- `follow-fixtures/`: `git mv gentle-{72,76,81,85,153,158,202,210}.json steady-…json`; set `"style": "steady"` in each. `follow-accuracy.spec.ts` L25 asserts `steady`. Run the spec; if any baseline moves, update that fixture's `baseline` in the same commit and say so in the message.
- `follow.spec.ts`: delete L90-94 and the import (L8); drop the level args (L139, 179, 190, 197, 206, 213).
- `lecture.spec.ts`: L771-772 two styles; L776-787, L1347-1351 drop gentle assertions; L799-816 delete the recap-exemption case; L1188-1194, L1218 use steady; L1254-1290 retarget the split cases to steady; L1408-1600: delete the `two_terms` cases, re-pin the rest to steady's bar; L1593 loops two; L1732-1741 use brisk/steady.
- `lecture.processor.spec.ts`: retarget every gentle case to steady; delete the recap-exemption case (L1430-1454) and the "restate fully early" expectations; L1610-1705 split cases on steady; L1737-1752 voice instructions on steady/brisk; L2225-2246 per §2.9.
- `board.spec.ts`: every `gentle` becomes `steady`; comparisons "gentle vs brisk" become "steady vs brisk"; delete cases for the three deleted branches.
- `delivery.spec.ts` L159-171, L233-239; `ask.spec.ts` L123-151; `lecture.handlers.spec.ts` L371-372, L397-400, L456, L631-633; `lecture-review.spec.ts` L55; `ai-sdk-llm.adapter.spec.ts` L489-511 (point at `AI_MODEL_SIMPLIFY_STANDARD`), L528, L615, delete L694-719; `processing.spec.ts` drop the task; `mappers.spec.ts:17`, `session.service.spec.ts:84`, `ask.spec.ts:22`, `scripts/ask-eval.ts:40` drop the fixture fields.

### 2.12 Scripts, env, docs

- `scripts/check-models.ts` L80-96: delete the block. `scripts/import-catalogue.ts` L253 drop `easiest`; L87 example `--prepare steady,brisk`. `scripts/follow-eval.ts` L6 example `steady-72`.
- `.env.example`: delete `AI_MODEL_SIMPLIFY_EASIEST` (L68); fix the `FREE_PLAN_UNLIMITED` comment (L144); §2.9 lines.
- README "Models" section: the per-task list loses the easiest line; add two sentences on the lecture voice (Kokoro on Modal, `MODAL_TTS_*`).
- `src/query/shared/document-shape.ts` L9-11: reword.

## 3. PR 2, client (`/Users/richard/Desktop/easyread`)

### 3.1 Types and API

- `src/lib/types.ts` L1: delete `Level`. `src/lib/api/contracts.ts`: delete `Level` (L12), `"simplify_easiest"` (L37), `easiestState` (L353), `SimplifiedPagesResponse.level` (L367), `FollowTrack.level` (L718), `PrepareRequest.easiest` (L290); flatten `simplified` (L221, L351); `position.level` and `reading.level` (L354, L579) typed `"original" | "standard"`; drop `level` from the four events (L1227-1235); `LectureStyle = "steady" | "brisk"` (L675), delete `LECTURE_STYLE_KEYS` (L676-681, unused), reword L672-690; `styles` record (L797) shrinks. Keep `ProcessingChannel*` for PR 3's client half (§4.4).
- `src/lib/api/endpoints.ts`: `reader.simplified` no `level` query (L687-690); `reader.prioritise` (L697-698), `reader.retryPage` (L702-703) no level; delete `reader.startEasiest` (L700); `reader.savePosition` third arg `"original" | "standard"` (L705-706); `reader.audioPath(id, level, page)` keeps the segment with `"original" | "standard"` (L715-716); delete `lectureContext.noteLevel` (L738); `exports.create(id)` (L967-971); `lectureContext.style` typed `LectureStyle` (L728).
- `src/lib/use-document-sync.ts`: one `loadPages` call (L134-137); delete the `document.simplified` easiest branch (L205-207).

### 3.2 Reader store (`src/lib/stores/reader-store.ts`)

Delete: the `Level` import (L48), `lectureFollow.levelBefore` (L92-93, L873), `level`, `easiest`, `easiestBlocks`, `easiestState` state (L203-211, L833-840, L929-933), `"easiest-confirm"` dialog (L349), `setLevel` (L443, L1156), `showLectureLevel`/`restoreLevel` (L472-475, L1366-1385), `startEasiest` (L509, L1500-1521), the `applyDetail` fallback (L1001-1013), the `level` key in `partialize` (L2132). Rename `standard`/`standardBlocks` maps to `simplified`/`simplifiedBlocks`. Simplify `loadPages(from, to)` (L427, L1028-1060), `markPage(page, status)` (L435, L1104-1111), `retryPage(page)` (L507, L1473-1481), `prioritise` dedupe key `page` (L1490-1495), `savePosition` sends `viewMode === "original" ? "original" : "standard"` (L1523-1533), `startExport` no level (L2105-2110), `useSimplifiedCount()` (L2145-2147), `usePageBlocks(page)` (L2150-2155). A stale `level` key in a viewer's localStorage is ignored.

### 3.3 Reader components

- Delete `src/components/reader/level-menu.tsx`; remove its use in `reader-chrome.tsx` (L22, L226, L271-275) and `immersive-bar.tsx` (L10, L106-109, L199, L274).
- `reader-chrome.tsx`: delete the selectors (L68-69), the phone "Easier" entry (L169-184), `useSimplifiedCount()` (L200, L224), reword L372-373.
- `reader-dialogs.tsx`: delete `EasiestDialog` (L12-51) and `EasiestProgress` (L53-79); `ExportModal` loses the level radiogroup (L111-148) and names the file `EasiRead Simplified.pdf` (L98).
- `reader-shell.tsx`: delete L20-21, L252, L319, L517.
- `listen-bar.tsx`: `audioLevel` is `"original" | "standard"` (L45); cache keys unchanged; L250-253 two labels; reword L25.
- `highlight-paint.tsx` L83-85, L161; `simplified-pane.tsx` (L38-226) drop the `level` prop and the track comparison (L81); `use-follow-along.ts` L60 delete the guard; `voice-panel.tsx` L36-38; `lecture-player.tsx` L412, L439-440, L1380 (delete the `startEasiest` line), L1583/1591 (delete), L1754-1756 one block map, L1791 delete `noteLevel`; `study-mode.tsx` L102; `guided/preview-stage.tsx` L37.
- `icons.tsx` L70-79: delete `EasiestIcon`.
- `src/lib/pdf/blocks.ts`: delete `SENTENCE_SPLIT`, `CLAUSE_SPLIT`, `toShortSentences` (L68-82) and the `level` parameter with its branch (L84, L104-114); callers `pdf-provider.tsx:12`, `search-panel.tsx:6`.

### 3.4 Lecture style

- `src/lib/lecture/styles.ts`: delete the `gentle` entry (L19-24), `intentToStyle` (L46-50, unused), the `"gentle"` clause of `readStoredStyle` (L58: a stored `gentle` then falls to `steady`); reword L7-11, L75-86.
- `lecture-style-icon.tsx` L18-23: drop the gentle arm (`PaceSlowIcon` stays in use by `lesson-intent.tsx`).
- `lecture-player.tsx` L4195-4226 and `learn-style-sheet.tsx` L57-86 render two entries by themselves; check the menu width at L4191 still reads well.
- `lesson-intent.tsx`, `pace-setup.tsx`, `teaching-panel.tsx`: **leave** (the pace dial, not the lecture style).
- `src/lib/board/estimate.ts`: delete the `gentle` keys of `WRITING_COST` (L14) and `LEAD_MS` (L20). `skeleton.ts`: delete the gentle branch (L59-68), reword L1-8. `renderer.ts` L179, L356, L826: type as `LectureStyle`. `src/lib/voice/realtime.ts` L147 `LectureStyle`, delete L155 `noteLevel`.

### 3.5 Settings and admin

- `src/app/settings/page.tsx`: delete the "Default level" row (L148-167) and `level`/`setLevel` from L50.
- `school-workspace.tsx`: `STYLES` loses the gentle row (L155-159); delete `easiestPending` (L1099-1102, L1498-1508), the `easiest` state and body split (L1511, L1521-1526, L1564), the "Easiest notes" checkbox and heading (L1566-1580), `MaterialRow`'s easiest line (L1684-1690), `easiest: false` in the retry and revoice bodies (L1938, L2148), `PrepareOne`'s easiest state, checkbox and disabled rule (L2191, L2200, L2214, L2243-2254, L2291). The Prepare bar is then audio-only for the two styles.

### 3.6 Landing copy

Rewrite, one sentence each, no promise of a second level: `how-it-works.tsx:14`; `pricing.tsx:8, 14` and `v2/pricing-v2.tsx:15, 21` (replace "1 Easiest Read conversion" and "Unlimited highlights and Easiest Read" with the plan's other limits); `faq.tsx:28` and `v2/faq-v2.tsx:44`; delete the locked "Easiest" pill in the mockups `app-showcase.tsx:92-100` and `v3/v3-sections.tsx:640-649` (check `LockIcon` is still used before removing its import). Tutor-temperament copy (`faq.tsx:20`, `tutors-section.tsx:16`) stays.

## 4. PR 3, server: retire the processing channels, delete the compat fields

### 4.1 Delete outright

`src/business/domain/processing.ts` (+spec), `src/business/ports/processing-context.ts` (+spec), `src/business/handlers/documents/processing-settings.service.ts` (+spec), `set-processing-channels.handler.ts`, `src/business/repositories/settings.repository.ts`, `src/web/repositories/sequelize-settings.repository.ts`, `src/web/controllers/admin-processing.controller.ts`, `src/query/processing-status.query.ts`, `src/web/database/models/platform-settings.model.ts`, `PROCESSING_SETTINGS_REPOSITORY` in `tokens.ts` (L19-21), `modal/llm_service.py`, `modal/llm-bench.mjs`, `open-model-channel-plan.md`.

### 4.2 Unwire

- `src/app.module.ts` (imports ~L172-174, `queries` ~L331-332, `controllers` ~L382); `src/core.module.ts` (~L10, ~L31); `src/web/providers/repositories.providers.ts` (~L31, ~L60, ~L133-136); `src/web/database/models/index.ts` (~L43, ~L98, ~L120).
- `src/pipeline/worker-runner.service.ts`: delete the imports (L10-15), the two constructor deps (L90-91), `channelsFor` (L221-238); L176-182 becomes `await handle(job.data as never, context)`. One fewer document read and settings read per job.
- `src/pipeline/queues.ts` L1, L78-79; `src/business/ports/job-queue.port.ts` L7-11; `src/web/adapters/bullmq-queue.adapter.ts` L1-2, L72-81 and the nine `stamped(...)` call sites.
- `src/web/adapters/ai-sdk/models.ts`: L1-2 imports, `'modal'` in `PROVIDERS` (L12) and `API_KEY_VAR` (L27), the `onModal` branch (L176-180), the `modal` term of `useChat` (L188-191), `modalRef` (L249-258), `modalBaseUrl` (L285-293) and the `baseURL` branch (L275-280), `case 'modal'` (L293-298).
- `src/web/repositories/sequelize-ai-call-log.repository.ts` L16, L25-32: back to `row.costUsd ?? costOf(row)`, drop `ConfigService`. Keep the `costUsd ??` short-circuit: it is how the Kokoro price reaches the ledger.
- `src/business/domain/cost.ts`: delete `ChannelRates`, `perPageByChannel`, `OPENAI_TEXT_PER_MILLION`, `OPENAI_USD_PER_AUDIO_MINUTE`, the `channels`/`byChannel` fields and inputs, the `modal:` branch of `costOf` (L69-75). Keep `catalogueSpeechCost`. `cost.spec.ts`: delete L95-115, L128-161.
- `materials.handlers.ts`: delete the `ConfigService`, `resolveChannels`, `runWithChannels`, `ProcessingSettingsService` imports and deps (L2, L14-16, L309-310), L320-325, the `channels`/`rates` inputs (L336-343 keep only the audio rate), call `queueAll` directly (L348-352).
- `src/contracts/index.ts`: delete `ProcessingChannel`, `ProcessingChannels`, `ChannelHealthDto`, `ProcessingStatusDto` (L296-322), `PrepareRequest.channels` (L337), `PrepareEstimateDto.channels` and `byChannel` (L348-354).
- Compat fields from §2.8: delete `level` on the three DTOs, `noteLevel`, `PrepareDto.easiest`, and the two transition guards in the processors.
- `.env.example` L218-227: delete `MODAL_LLM_URL`, `MODAL_LLM_TOKEN`, `MODAL_LLM_MODEL`, `MODAL_USD_PER_MILLION_TOKENS` and the panel comment.

### 4.3 Migration

**`migrations/0048-drop-platform-settings.migration.ts`**: `up` drops `platform_settings`; `down` recreates it as `0045` did (copy the table definition and the seed row).

### 4.4 Client half (a small PR 2b, or folded into PR 2)

Delete `src/components/admin/processing-panel.tsx`; `src/app/admin/page.tsx` L6, L67; `endpoints.ts` L69-70, L496-500; `contracts.ts` L259-283, L293-295, L305-311; in `school-workspace.tsx` delete `CHANNEL_NAME`, `useProcessingChannels`, `ChannelLine`, `OtherChannels` (L31-32, L51-154), their uses (L1519-1526, L1618-1626, L2198-2200, L2273-2281), and the `channels` parameter of `retry` (L1930-1941) so the failed-page action is a plain Retry. The estimate then shows `totalUsd` alone.

## 5. Ops runbook

1. Before PR 1 deploys: nothing to drain; the transition guards cover queued jobs.
2. After PR 1 is live: `modal app stop easiread-llm`; `modal app stop` the two dormant `easiread-tts` apps. Kokoro (`easiread-kokoro`) untouched.
3. In the deployment's env (API and worker): unset `AI_MODEL_SIMPLIFY_EASIEST`, `LECTURE_VOICE_EXTERNAL`, `AI_LECTURE_VOICE`; confirm `MODAL_TTS_URL`, `MODAL_TTS_TOKEN`, `MODAL_TTS_ENGINE=kokoro`, `MODAL_USD_PER_AUDIO_HOUR` are set on the worker. After PR 3: unset `MODAL_LLM_URL`, `MODAL_LLM_TOKEN`, `MODAL_LLM_MODEL`, `MODAL_USD_PER_MILLION_TOKENS`.
4. The `easiread-llm-weights` volume sits inside Modal's free storage tier; delete it or leave it.

## 6. Verification

After PR 1 and PR 2 are live, on a school document of 20 or more pages, three checks:

- Upload to fully voiced completes with two styles in the chapter list and no gentle option in the reader's "How you learn" menu; the admin table shows two lecture columns and one simplified count.
- A learner's own upload is voiced: `ai_call_logs` rows for `tts_lecture` on that document carry a `modal:` model and a non-null `costUsd`; the audio plays.
- The ledger for the run: `select task, model, outcome, count(*), round(sum(cost_usd), 3) from ai_call_logs where document_id = ? group by task, model, outcome`. Expect no `simplify_easiest`, no `modal:` text model, and a text total near $0.008 per page (two styles plus the pipeline steps).

Reader checks: the export downloads `EasiRead Simplified.pdf`; the position round-trip saves `standard`; a device that had `easiread.lectureStyle = gentle` in localStorage opens on `steady`.

## 7. What it costs and how long it takes after this

A 300-page document, two styles: about $3.00 (text $2.40, audio $0.45, Modal idle $0.20), and the OpenAI run time with the lecture phase a third shorter. The only tail is forced alignment on the worker's CPU, about 8 seconds a page two at a time, which pages do not wait for.

## 8. Not in this plan

The call-path hardening from the superseded plan (a timeout on model calls, `statusCode` in `isPermanentFailure`) is still worth doing and is independent; take it as its own small PR after PR 3.
