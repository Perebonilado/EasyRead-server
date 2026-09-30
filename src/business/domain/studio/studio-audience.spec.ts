import { briefOf } from './studio';
import {
  AUDIENCE_BANDS,
  AUDIENCE_CHIPS,
  AUDIENCE_RECIPES,
  BAND_LADDER,
  PRIOR_CHIPS,
  audienceChips,
  audienceIn,
  bandOf,
  checksAt,
  describeAudience,
  describeRecipe,
  profileOf,
  recipeFor,
  stageOf,
  whoHeard,
  whoLine,
  whoOf,
  type AudienceBand,
} from './studio-audience';

describe('whom the maker’s words say it is for (audienceIn)', () => {
  /** Phrasings from many school systems and from grown-ups, each with the band it is. */
  const cases: [string, AudienceBand][] = [
    // The United States and Canada.
    ['An explainer on the water cycle for grade 5', 'primary-upper'],
    ['for my 5th grade class', 'primary-upper'],
    ['fifth-graders learning fractions', 'primary-upper'],
    ['something for 2nd graders about magnets', 'primary-lower'],
    ['Kindergarten: why leaves change colour', 'early-years'],
    ['for 8th grade science', 'secondary-lower'],
    ['Grade 11 chemistry: moles', 'secondary-upper'],
    ['for high school students', 'secondary-upper'],
    ['middle schoolers learning about volcanoes', 'secondary-lower'],
    ['AP Biology: cell respiration', 'secondary-upper'],
    ['for college freshmen in intro psych', 'university'],
    // The United Kingdom and Ireland.
    ['for Year 9 history', 'secondary-lower'],
    ['Year 3 phonics', 'primary-upper'],
    ['a Year 1 class', 'primary-lower'],
    ['Key Stage 2 science', 'primary-upper'],
    ['KS3 maths: ratios', 'secondary-lower'],
    ['GCSE physics revision: forces', 'secondary-upper'],
    ['A level economics', 'secondary-upper'],
    ['for my sixth form class', 'secondary-upper'],
    ['Reception class counting', 'early-years'],
    ['Leaving Cert biology', 'secondary-upper'],
    // IB, anywhere.
    ['IB Diploma physics: waves', 'secondary-upper'],
    ['MYP design unit', 'secondary-lower'],
    ['PYP unit on communities', 'primary-upper'],
    // India.
    ['Class 7 science: nutrition in plants', 'secondary-lower'],
    ['CBSE Class 10 maths', 'secondary-upper'],
    ['for Class XII physics', 'secondary-upper'],
    // East and West Africa, and elsewhere.
    ['Standard 6 social studies', 'primary-upper'],
    ['Form 2 chemistry', 'secondary-lower'],
    ['Form 4 biology for KCSE', 'secondary-upper'],
    ['Primary 4 basic science', 'primary-upper'],
    ['JSS 2 basic science', 'secondary-lower'],
    ['SS 3 physics for WAEC', 'secondary-upper'],
    // Australia and New Zealand.
    ['Year 10 geography', 'secondary-upper'],
    ['for Year 12 students sitting the HSC', 'secondary-upper'],
    // French-style classes.
    ['pour une classe de CM2: les fractions', 'primary-upper'],
    ['en terminale: la photosynthèse', 'secondary-upper'],
    ['for 6e students', 'secondary-lower'],
    // Singapore.
    ['PSLE science: energy', 'primary-upper'],
    // Ages.
    ['for 10-year-olds', 'primary-upper'],
    ['ages 6–8', 'primary-lower'],
    ['for kids aged 4', 'early-years'],
    ['a video for 14 year olds', 'secondary-upper'],
    ['Kids (8–11)', 'primary-upper'],
    ['Young kids (4–7)', 'early-years'],
    // University.
    ['for first-year nursing students', 'university'],
    ['first-year nursing: blood pressure', 'university'],
    ['undergraduate econometrics', 'university'],
    ['for my master’s students', 'university'],
    ['law students learning contract formation', 'university'],
    ['a medical student revising the heart', 'university'],
    ['200 level biochemistry', 'university'],
    // Work.
    ['for my team at work', 'professional'],
    ['onboarding new hires on our deploy process', 'professional'],
    ['CPD for pharmacists', 'professional'],
    ['training for nurses on sepsis', 'professional'],
    ['Work', 'professional'],
    // Grown-ups and others.
    ['for adults', 'general-adult'],
    ['for my book club', 'general-adult'],
    ['an adult learning English: budgets', 'general-adult'],
    ['Anyone curious', 'general-adult'],
    ['University', 'university'],
    ['Teens', 'secondary-lower'],
    ['for teenagers', 'secondary-lower'],
    ['for young kids', 'early-years'],
    ['for kids', 'primary-upper'],
  ];

  it('reads grades, years, stages, forms, exams, ages, courses and jobs as the world says them', () => {
    expect(cases.length).toBeGreaterThanOrEqual(40);
    for (const [words, band] of cases)
      expect([words, audienceIn(words)?.band]).toEqual([words, band]);
  });

  it('keeps the maker’s own words for the line', () => {
    expect(audienceIn('An explainer for grade 5 on fractions')?.said).toBe(
      'Grade 5',
    );
    expect(audienceIn('for Year 9')?.said).toBe('Year 9');
    expect(audienceIn('for first-year nursing students')?.said).toBe(
      'First-year nursing',
    );
    expect(audienceIn('for my book club')?.said).toBe('My book club');
    expect(audienceIn('Kids (8–11)')?.said).toBe('Kids (8–11)');
  });

  it('never guesses from a name or a place', () => {
    for (const words of [
      'The history of Lagos',
      'Amara explains the Nairobi water supply',
      'How Tokyo’s trains run on time',
      'Kofi and Mei learn about the moon',
      'Why Mumbai has monsoons',
      'The geography of Scotland and Wales',
      'Photosynthesis',
      'How vaccines work',
    ])
      expect([words, audienceIn(words)?.band]).toEqual([words, undefined]);
  });

  it('is not fooled by grades, forms and years that are not school ones', () => {
    expect(audienceIn('A grade 4 glioma')?.band).toBeUndefined();
    expect(audienceIn('Filling in tax form 1040')?.band).toBeUndefined();
    expect(audienceIn('The year 1066')?.band).toBeUndefined();
    expect(audienceIn('Storing files in AWS S3')?.band).toBeUndefined();
  });

  it('takes the level named most surely: a year over a loose word', () => {
    expect(audienceIn('Year 9 kids learning about volcanoes')?.band).toBe(
      'secondary-lower',
    );
    // Said as who it is for: "for nurses" is work, even beside "kids".
    expect(
      audienceIn('How to take a child’s temperature, for nurses')?.band,
    ).toBe('professional');
    // A course's students are at university, however they work.
    expect(audienceIn('for nursing students')?.band).toBe('university');
  });

  it('hears what they know, their goal, their English and their need for help', () => {
    expect(
      audienceIn('a uni student new to the topic who needs hand-holding'),
    ).toMatchObject({
      band: 'university',
      prior: 'new',
      support: 'extra',
    });
    expect(audienceIn('complete beginner, adult')).toMatchObject({
      band: 'general-adult',
      prior: 'new',
      support: 'extra',
    });
    expect(
      audienceIn('Year 11, revising for the exam next week'),
    ).toMatchObject({
      band: 'secondary-upper',
      prior: 'revising',
      goal: 'exam',
    });
    expect(audienceIn('a refresher on SQL joins')).toMatchObject({
      prior: 'revising',
    });
    expect(audienceIn('for ESL students')).toMatchObject({
      language: 'learning',
    });
    expect(audienceIn('EAL learners in Year 5')).toMatchObject({
      band: 'primary-upper',
      language: 'learning',
    });
    expect(audienceIn('they already know the basics of algebra')).toMatchObject(
      { prior: 'some' },
    );
    expect(audienceIn('Kids (8–11) · New to it')).toMatchObject({
      band: 'primary-upper',
      prior: 'new',
    });
    expect(audienceIn('Anyone curious')).toMatchObject({
      band: 'general-adult',
      goal: 'curious',
    });
    expect(audienceIn('We will send the forms on Monday')).toBeNull();
  });
});

describe('the profile on the brief', () => {
  it('derives the old audience from the band, so all that read it still does', () => {
    const brief = briefOf({
      format: 'explainer',
      who: { band: 'primary-upper', said: 'Grade 5', prior: 'new' },
    });
    expect(brief.audience).toBe('children');
    expect(brief.who).toEqual({
      band: 'primary-upper',
      said: 'Grade 5',
      prior: 'new',
    });
    expect(briefOf({ who: { band: 'professional' } }).audience).toBe('adults');
  });

  it('patches field by field: a band tapped drops the old words, what they know stays', () => {
    const base = briefOf({
      format: 'explainer',
      who: { band: 'primary-upper', said: 'Grade 5', prior: 'new' },
    });
    const teens = briefOf({ who: { band: 'secondary-lower' } }, base);
    expect(teens.who).toEqual({ band: 'secondary-lower', prior: 'new' });
    expect(teens.audience).toBe('teens');
    const revising = briefOf({ who: { prior: 'revising' } }, base);
    expect(revising.who).toEqual({
      band: 'primary-upper',
      said: 'Grade 5',
      prior: 'revising',
    });
    // A band that is none is ignored; a field sent as null goes back to its usual.
    expect(
      briefOf({ who: { band: 'toddlers', prior: null } }, base).who,
    ).toEqual({ band: 'primary-upper', said: 'Grade 5' });
  });

  it('takes the band back to the four words when they change, and keeps it when they agree', () => {
    const base = briefOf({
      who: { band: 'university', said: 'first-year nursing' },
    });
    expect(briefOf({ audience: 'adults' }, base).who?.band).toBe('university');
    expect(briefOf({ audience: 'children' }, base).who).toEqual({
      band: 'primary-upper',
    });
    // A brief with no profile stays without one.
    expect(briefOf({ audience: 'teens' }).who).toBeUndefined();
  });

  it('gives the band and the stage for the voice, the theme and the writer', () => {
    expect(bandOf(briefOf({ audience: 'children' }))).toBe('primary-upper');
    expect(bandOf(briefOf({}))).toBeNull();
    expect(stageOf(briefOf({ who: { band: 'professional' } }))).toBe(
      'professional',
    );
    expect(profileOf(briefOf({ audience: 'adults' }))).toEqual({
      band: 'general-adult',
      prior: 'some',
      goal: 'understand',
      language: 'fluent',
      support: 'normal',
    });
    expect(whoOf(null)).toBeUndefined();
  });

  it('says it in one line: their words, then what they know', () => {
    expect(
      whoLine({ band: 'primary-upper', said: 'Grade 5', prior: 'new' }),
    ).toBe('Grade 5 · new to it');
    expect(whoLine({ band: 'secondary-lower' })).toBe('Teens (11–14)');
    expect(
      whoLine({
        band: 'general-adult',
        said: 'An adult',
        language: 'learning',
      }),
    ).toBe('An adult · learning English');
  });
});

describe('asking whom it is for', () => {
  it('asks an explainer’s audience with one row of chips, and what they know only when nothing said it', () => {
    const brief = briefOf({ format: 'explainer', idea: 'The water cycle' });
    expect(audienceChips(brief, 'Explain the water cycle')).toEqual({
      choices: AUDIENCE_CHIPS.map((c) => c.label),
      also: PRIOR_CHIPS.map((c) => c.label),
    });
    expect(
      audienceChips(brief, 'Explain the water cycle, they are new to it'),
    ).toEqual({ choices: AUDIENCE_CHIPS.map((c) => c.label) });
    expect(AUDIENCE_CHIPS.map((c) => c.label)).toEqual([
      'Young kids (4–7)',
      'Kids (8–11)',
      'Teens',
      'University',
      'Work',
      'Anyone curious',
    ]);
    // Only while it is the next thing asked, and only for an explainer.
    expect(audienceChips({ ...brief, audience: 'teens' }, '')).toBeNull();
    expect(audienceChips({ ...brief, idea: '' }, '')).toBeNull();
    expect(audienceChips({ ...brief, format: 'story' }, '')).toBeNull();
  });

  it('keeps what earlier words said of what they know once the band is tapped', () => {
    const brief = briefOf({ format: 'explainer', idea: 'Blood pressure' });
    expect(
      whoHeard(
        brief,
        'University',
        'Blood pressure, I am new to it\nUniversity',
      ),
    ).toEqual({ band: 'university', said: 'University', prior: 'new' });
  });

  it('keeps no profile for four words alone, and takes the level a pasted text names', () => {
    const adults = briefOf({ format: 'explainer', audience: 'adults' });
    expect(whoHeard(adults, 'Sounds good', 'Sounds good')).toBeUndefined();
    const pasted = briefOf({
      format: 'explainer',
      source:
        'Lecture notes, Department of Biochemistry. 200 Level, first semester.',
    });
    expect(whoHeard(pasted, '', '')).toMatchObject({ band: 'university' });
  });
});

describe('the recipes', () => {
  const ladder = BAND_LADDER.map((band) => recipeFor({ band }));
  const rising = (values: number[]) =>
    values.every((v, i) => i === 0 || v >= values[i - 1]);
  const falling = (values: number[]) =>
    values.every((v, i) => i === 0 || v <= values[i - 1]);

  it('rise with the band: longer sentences, faster voices and reading, harder words allowed', () => {
    expect(rising(ladder.map((r) => r.sentence[1]))).toBe(true);
    expect(rising(ladder.map((r) => r.sentence[0]))).toBe(true);
    expect(rising(ladder.map((r) => r.wpm))).toBe(true);
    expect(rising(ladder.map((r) => r.readWpm))).toBe(true);
    expect(rising(ladder.map((r) => r.grade))).toBe(true);
    expect(rising(ladder.map((r) => r.hardShare))).toBe(true);
    expect(rising(ladder.map((r) => r.cardWords))).toBe(true);
    expect(rising(ladder.map((r) => r.labels))).toBe(true);
    expect(rising(ladder.map((r) => r.motion))).toBe(true);
    expect(rising(ladder.map((r) => r.checkEvery))).toBe(true);
    expect(rising(ladder.map((r) => r.termsAMinute))).toBe(true);
    expect(falling(ladder.map((r) => r.textSize))).toBe(true);
  });

  it('put the general adult among the grown-ups', () => {
    const adult = recipeFor({ band: 'general-adult' });
    const teen = recipeFor({ band: 'secondary-upper' });
    const pro = recipeFor({ band: 'professional' });
    expect(adult.wpm).toBeGreaterThanOrEqual(teen.wpm);
    expect(adult.wpm).toBeLessThanOrEqual(pro.wpm);
    expect(adult.textSize).toBeLessThanOrEqual(teen.textSize);
  });

  it('take the plan’s numbers for the voice and the reading', () => {
    expect(
      Object.fromEntries(
        AUDIENCE_BANDS.map((b) => [b, AUDIENCE_RECIPES[b].wpm]),
      ),
    ).toEqual({
      'early-years': 110,
      'primary-lower': 120,
      'primary-upper': 132,
      'secondary-lower': 142,
      'secondary-upper': 150,
      university: 155,
      professional: 160,
      'general-adult': 155,
    });
    expect(AUDIENCE_RECIPES['primary-upper'].readWpm).toBe(130);
    expect(AUDIENCE_RECIPES['primary-upper'].cardWords).toBe(3);
    expect(AUDIENCE_RECIPES.university.cardWords).toBe(7);
  });

  it('are moved by what they know, their English and their goal', () => {
    const plain = recipeFor({ band: 'university' });
    const fresh = recipeFor({ band: 'university', prior: 'new' });
    expect(fresh.wpm).toBe(Math.round(155 * 0.95));
    expect(fresh.checkEvery).toBeLessThan(plain.checkEvery);
    expect(fresh.notes.join(' ')).toMatch(/name the parts before the process/);
    const revising = recipeFor({ band: 'university', prior: 'revising' });
    expect(revising.wpm).toBeGreaterThan(plain.wpm);
    expect(revising.analogies.length).toBeLessThan(plain.analogies.length);
    const learning = recipeFor({ band: 'general-adult', language: 'learning' });
    expect(learning.sentence[1]).toBe(15);
    expect(learning.wpm).toBe(Math.round(155 * 0.9));
    expect(learning).toMatchObject({ captions: true, keyCards: true });
    expect(
      recipeFor({ band: 'secondary-upper', goal: 'exam' }).notes.join(' '),
    ).toMatch(/exam's exact terms/);
  });

  it('space the checks for understanding by the band, never on the hook', () => {
    const scenes = [30, 30, 30, 30, 30, 30].map((seconds) => ({ seconds }));
    expect(checksAt(scenes, recipeFor({ band: 'primary-upper' }))).toEqual([
      false,
      false,
      true,
      false,
      false,
      true,
    ]);
    expect(checksAt(scenes, recipeFor({ band: 'professional' }))).toEqual([
      false,
      false,
      false,
      false,
      true,
      false,
    ]);
    // Young children are asked more often than adults.
    const kids = checksAt(scenes, recipeFor({ band: 'early-years' }));
    const adults = checksAt(scenes, recipeFor({ band: 'general-adult' }));
    expect(kids.filter(Boolean).length).toBeGreaterThan(
      adults.filter(Boolean).length,
    );
    // Revising ends on a question.
    expect(
      checksAt(scenes, recipeFor({ band: 'university' }), {
        prior: 'revising',
      })[5],
    ).toBe(true);
  });

  it('reach the writers in words', () => {
    const who = {
      band: 'primary-upper' as const,
      said: 'Grade 5',
      prior: 'new' as const,
    };
    const outline = describeAudience(who);
    expect(outline).toMatch(/eight to eleven/);
    expect(outline).toMatch(/The maker said: "Grade 5"/);
    expect(outline).toMatch(/one worked example for each idea/);
    const scene = describeRecipe(recipeFor(who), { seconds: 30, check: true });
    expect(scene).toMatch(/Sentences of 5 to 13 words/);
    expect(scene).toMatch(/grade 5 or easier/);
    expect(scene).toMatch(/delivery "question"/);
    expect(scene).toMatch(/at most 3 words on a card/);
    expect(
      describeRecipe(recipeFor(who), { seconds: 30, check: false }),
    ).toMatch(/no question for the viewer/);
  });
});
