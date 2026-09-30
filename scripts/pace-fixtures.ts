/**
 * Six lesson scenes for the pace bench and the voice's calibration: one a
 * band from young children to professionals, each with its new terms,
 * written as the lesson writer writes (a sentence a beat, each with how
 * it is said and whether the idea changes after it). Global: no place or
 * name is anyone's default.
 */
import type { AudienceBand } from '../src/business/domain/scene-pace';
import type { SceneBeat } from '../src/business/domain/scene-script';

export interface PaceFixture {
  id: string;
  title: string;
  band: AudienceBand;
  terms: string[];
  beats: Pick<SceneBeat, 'say' | 'delivery' | 'pause'>[];
}

const b = (
  say: string,
  delivery: SceneBeat['delivery'] = 'explain',
  pause: SceneBeat['pause'] = 'short',
): PaceFixture['beats'][number] => ({ say, delivery, pause });

export const PACE_FIXTURES: PaceFixture[] = [
  {
    id: 'kids-water-cycle',
    title: 'Where does rain come from?',
    band: 'primary-upper',
    terms: ['evaporation', 'condensation'],
    beats: [
      b('Have you ever wondered where rain comes from?', 'hook'),
      b('The sun warms the water in seas, lakes and puddles.'),
      b(
        'The warm water rises into the air as an invisible gas.',
        'explain',
        'long',
      ),
      b('This is called evaporation.', 'key'),
      b('High up in the sky, the air is cold.'),
      b(
        'The gas cools down and turns into tiny drops of water.',
        'explain',
        'long',
      ),
      b('This is called condensation, and the drops make clouds.', 'key'),
      b(
        'What do you think happens when the drops get too heavy?',
        'question',
        'long',
      ),
      b('They fall back down as rain, and the cycle starts again.', 'recap'),
    ],
  },
  {
    id: 'early-sleep',
    title: 'Why do we sleep?',
    band: 'early-years',
    terms: ['brain'],
    beats: [
      b('Why do we all need to sleep?', 'hook'),
      b('When you sleep, your body rests.'),
      b('Your brain is busy, too.', 'explain', 'long'),
      b('It keeps the things you learned today.', 'key'),
      b('Sleep also helps you grow big and strong.'),
      b('How do you feel after a good sleep?', 'question', 'long'),
      b('Happy, strong and ready to play!', 'recap'),
    ],
  },
  {
    id: 'teen-printing-press',
    title: 'The printing press',
    band: 'secondary-lower',
    terms: ['movable type'],
    beats: [
      b(
        'Five hundred years ago, a single book could take a scribe months to copy by hand.',
        'hook',
      ),
      b('Around 1450, a new machine changed that.', 'explain', 'long'),
      b(
        'It used movable type: small metal letters that could be arranged, inked and pressed onto paper.',
        'key',
      ),
      b('A printer could now make hundreds of copies of a page in a day.'),
      b(
        'Books became cheaper, and far more people learned to read.',
        'explain',
        'long',
      ),
      b(
        'Ideas that once stayed in one city could now travel across a continent.',
        'aside',
      ),
      b('Why might rulers have been worried about that?', 'question', 'long'),
      b(
        'Cheap printing spread knowledge, and with it, new ideas and arguments.',
        'recap',
      ),
    ],
  },
  {
    id: 'uni-elasticity',
    title: 'Price elasticity of demand',
    band: 'university',
    terms: ['price elasticity of demand', 'inelastic'],
    beats: [
      b(
        'Why does a price rise hurt sales of some goods more than others?',
        'hook',
      ),
      b(
        'Economists measure this with the price elasticity of demand.',
        'explain',
        'long',
      ),
      b(
        'It is the percentage change in quantity demanded divided by the percentage change in price.',
        'key',
      ),
      b('If a 10% price rise cuts demand by 20%, the elasticity is minus two.'),
      b(
        'Goods with few substitutes, such as insulin or petrol in the short run, are inelastic.',
        'explain',
        'long',
      ),
      b('For them, demand barely moves when the price changes.', 'aside'),
      b(
        'So which goods would a government tax if it wanted steady revenue?',
        'question',
        'long',
      ),
      b(
        'Elasticity tells us how strongly buyers respond to price, and that shapes pricing and policy.',
        'recap',
      ),
    ],
  },
  {
    id: 'adult-vaccines',
    title: 'How vaccines train the body',
    band: 'general-adult',
    terms: ['antibodies', 'memory cells'],
    beats: [
      b('How can a small injection protect you for years?', 'hook'),
      b(
        'A vaccine shows your immune system a harmless piece of a germ.',
        'explain',
        'long',
      ),
      b(
        'Your body responds by making antibodies that fit that piece exactly.',
        'key',
      ),
      b('It also keeps memory cells that remember the shape.'),
      b(
        'If the real germ ever arrives, those memory cells react within days, not weeks.',
        'explain',
        'long',
      ),
      b(
        'That head start is often the difference between a mild illness and a serious one.',
        'aside',
      ),
      b('So what does the vaccine really give you?', 'question', 'long'),
      b(
        'A rehearsal: your immune system learns the fight before the real one begins.',
        'recap',
      ),
    ],
  },
  {
    id: 'pro-blood-pressure',
    title: 'Reading a blood pressure',
    band: 'professional',
    terms: ['systolic', 'diastolic'],
    beats: [
      b(
        'A blood pressure reading is two numbers, and each one tells you something different.',
        'hook',
      ),
      b(
        'The top number is the systolic pressure, when the heart contracts.',
        'explain',
        'long',
      ),
      b(
        'The bottom number is the diastolic pressure, when the heart rests between beats.',
        'key',
      ),
      b('A typical adult reading is 120 over 80 millimetres of mercury.'),
      b(
        'A reading of 140 over 90 or higher, repeated on separate days, suggests hypertension.',
        'explain',
        'long',
      ),
      b(
        'Always check the cuff size first, because a small cuff reads high.',
        'aside',
      ),
      b(
        'What would you do if a patient read 180 over 110?',
        'question',
        'long',
      ),
      b(
        'Two numbers, two phases of the heartbeat: record both, and act on the pattern.',
        'recap',
      ),
    ],
  },
];

/** A neutral passage of twelve sentences for a voice's calibration: plain explaining, no hooks, no questions. */
export const CALIBRATION_PASSAGE = [
  'A river begins as rain that falls on high ground.',
  'The water runs downhill and gathers in small streams.',
  'Streams join together and slowly become a river.',
  'On its way, the river carries sand and small stones.',
  'Where the ground is steep, the water moves quickly.',
  'Where the land is flat, it slows down and bends.',
  'These bends are called meanders, and they change over time.',
  'Near the sea, the river drops the sand it has carried.',
  'This sand builds new land at the mouth of the river.',
  'People have always settled near rivers for water and food.',
  'Many large cities grew up along their banks.',
  'Today, rivers still shape the land and the lives around them.',
];
