import { faceOfLine } from './scene-feeling';

describe('the face a line is said with', () => {
  it('reads it from the words: grave things sadly, a denial in fear, good news gladly, a question thinking', () => {
    expect(faceOfLine('I tell you the truth, one of you will betray me.')).toBe(
      'sad',
    );
    expect(faceOfLine('Surely not I, Rabbi?')).toBe('afraid');
    expect(faceOfLine('Rejoice and be glad!')).toBe('happy');
    expect(faceOfLine('Where do you want us to prepare the Passover?')).toBe(
      'thinking',
    );
    expect(faceOfLine('How can this be?')).toBe('surprised');
    expect(faceOfLine('Get behind me, Satan!')).toBe('angry');
    // A plain statement tells nothing: the face stays as it is.
    expect(faceOfLine('Go into the city to a certain man.')).toBeNull();
  });
});
