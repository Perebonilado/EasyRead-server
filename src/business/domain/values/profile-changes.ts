import type { ProfileChangeField } from '../../repositories/learning.repository';

/**
 * A profile change as a human sentence fragment, for the tutor to narrate
 * and the settings screen to display. One vocabulary for both, so the app
 * never describes the same change two different ways.
 */
export function describeChange(
  field: ProfileChangeField,
  toValue: string,
): string {
  const phrases: Record<string, string> = {
    'pace:slower': 'taking things slower',
    'pace:steady': 'back to a steady pace',
    'pace:faster': 'moving faster',
    'depth:deeper': 'breaking things down more',
    'depth:standard': 'unpacking things normally',
    'depth:lighter': 'staying closer to the main ideas',
    'interactivity:more': 'checking in more often',
    'interactivity:standard': 'checking in at the usual rate',
    'interactivity:less': 'checking in less often',
  };
  if (field === 'style_notes') return `noted: ${toValue}`;
  return phrases[`${field}:${toValue}`] ?? `${field} is now ${toValue}`;
}
